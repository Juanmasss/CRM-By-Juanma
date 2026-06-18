import { rm } from "node:fs/promises";

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { pino } from "pino";
import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";

import { config } from "./env.js";

// TODO(prod): migrar el auth state de archivos (useMultiFileAuthState) a Postgres.
//   useMultiFileAuthState NO es apto para producción (lo dice la propia doc de Baileys);
//   en prod hay que implementar un AuthenticationState respaldado en BD.

const logger = pino({ level: "silent" });

// Estado en memoria del proceso.
let sock: WASocket | undefined;
let connected = false;
let phoneNumber: string | null = null;
let qrPng: string | null = null;

// Generación: cada socket captura la suya; los handlers de un socket reemplazado se ignoran.
// Evita reconexiones duplicadas cuando se recrea el socket (close/logout).
let generation = 0;

// "12345:6@s.whatsapp.net" -> "12345"
function numberFromJid(jid: string | undefined): string | null {
  if (!jid) return null;
  return jid.split("@")[0]?.split(":")[0] ?? null;
}

// Normaliza un destino ("+57 300…", "573001112233" o un jid) a jid de WhatsApp.
function toJid(to: string): string {
  if (to.includes("@")) return to;
  const digits = to.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

// messageTimestamp de Baileys puede ser number o Long -> unix en segundos.
function toUnix(ts: number | { toNumber?: () => number } | null | undefined): number {
  if (ts == null) return Math.floor(Date.now() / 1000);
  if (typeof ts === "number") return ts;
  return typeof ts.toNumber === "function" ? ts.toNumber() : Math.floor(Date.now() / 1000);
}

// Reenvía un mensaje entrante al backend (endpoint interno).
async function forwardIncoming(payload: {
  from: string;
  pushName: string | null;
  text: string;
  externalMessageId: string | null;
  timestamp: number;
}): Promise<void> {
  try {
    const res = await fetch(`${config.backendInternalUrl}/api/internal/whatsapp/incoming`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": config.internalSecret },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn(`[wa] El backend rechazó el incoming (status ${res.status}).`);
  } catch (err) {
    console.warn("[wa] No se pudo reenviar el mensaje entrante al backend.", err);
  }
}

async function clearAuth(): Promise<void> {
  await rm(config.authDir, { recursive: true, force: true });
}

async function connect(): Promise<void> {
  const myGen = ++generation;

  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  // Versión del protocolo WA Web según Baileys (no fijar a mano).
  let version: [number, number, number] | undefined;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (err) {
    console.warn("[wa] No se pudo obtener la última versión de WA Web, uso la por defecto.", err);
  }

  sock = makeWASocket({ version, auth: state, logger });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    if (myGen !== generation) return; // socket reemplazado: ignorar

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // qr -> PNG Data URL (en memoria, lo sirve GET /qr) + ASCII en consola.
      qrPng = await QRCode.toDataURL(qr);
      connected = false;
      phoneNumber = null;
      qrcodeTerminal.generate(qr, { small: true });
      console.log("[wa] Nuevo QR. Escanéalo desde WhatsApp o consúltalo en GET /qr.");
    }

    if (connection === "open") {
      connected = true;
      qrPng = null;
      phoneNumber = numberFromJid(sock?.user?.id);
      console.log(`[wa] Conectado como ${phoneNumber ?? "(número desconocido)"}.`);
    }

    if (connection === "close") {
      connected = false;
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
        ?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        console.log("[wa] Sesión cerrada (loggedOut). Limpio auth y espero un nuevo QR.");
        await clearAuth();
      } else {
        console.log(`[wa] Conexión cerrada (code ${statusCode ?? "?"}). Reconectando…`);
      }
      // En ambos casos reconectamos: si no hay credenciales, emitirá un QR nuevo.
      void connect();
    }
  });

  // Recepción de mensajes entrantes -> reenvío al backend.
  sock.ev.on("messages.upsert", async (upsert) => {
    if (myGen !== generation) return;
    if (upsert.type !== "notify") return; // sólo mensajes nuevos

    for (const m of upsert.messages) {
      const jid = m.key.remoteJid ?? undefined;
      // Ignora salientes (fromMe) y todo lo que no sea chat individual (grupos, broadcast, status).
      if (!jid || m.key.fromMe) continue;
      if (!jid.endsWith("@s.whatsapp.net")) continue;

      // Por ahora sólo reenviamos texto (B7); media queda para más adelante.
      const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? null;
      if (!text) continue;

      await forwardIncoming({
        from: jid,
        pushName: m.pushName ?? null,
        text,
        externalMessageId: m.key.id ?? null,
        timestamp: toUnix(m.messageTimestamp),
      });
    }
  });
}

export const wa = {
  start(): Promise<void> {
    return connect();
  },

  getStatus(): { connected: boolean; phoneNumber: string | null } {
    return { connected, phoneNumber };
  },

  getQr(): { connected: boolean; qrPng: string | null } {
    // Si ya está conectado no hay QR que mostrar.
    return { connected, qrPng: connected ? null : qrPng };
  },

  // POST /disconnect: cierra sesión, borra ./auth y vuelve a estado de QR.
  async disconnect(): Promise<void> {
    try {
      await sock?.logout();
    } catch (err) {
      console.warn("[wa] logout() falló (posiblemente ya desconectado).", err);
    }
    try {
      sock?.end(undefined);
    } catch {
      /* noop */
    }
    sock = undefined;
    connected = false;
    phoneNumber = null;
    qrPng = null;
    await clearAuth();
    // Recrea el socket: al no haber credenciales, generará un nuevo QR.
    void connect();
  },

  // POST /send: envía un mensaje de texto, normalizando el destino a jid.
  async send(to: string, text: string): Promise<{ ok: boolean; externalMessageId?: string }> {
    if (!sock || !connected) {
      throw new Error("WhatsApp no está conectado");
    }
    const sent = await sock.sendMessage(toJid(to), { text });
    return { ok: true, externalMessageId: sent?.key?.id ?? undefined };
  },
};
