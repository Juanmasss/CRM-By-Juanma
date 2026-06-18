import { rm } from "node:fs/promises";

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessageContent,
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

// ── Reconexión con backoff exponencial ──
// En cada cierre no-logout reintentamos con una espera creciente (1s, 2s, 4s… hasta 30s)
// para no martillar a WhatsApp ni quemar CPU si el corte es persistente. Se reinicia a 0
// cuando la conexión vuelve a abrir. reconnectTimer actúa de guarda anti-doble-reintento.
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | undefined;

function scheduleReconnect(): void {
  if (reconnectTimer) return; // ya hay una reconexión en cola
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts++;
  console.log(`[wa] Reintento de conexión en ${Math.round(delay / 1000)}s (intento ${reconnectAttempts}).`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connect();
  }, delay);
}

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

// Tipos de mensaje que persistimos (alineados con el enum MessageType de Prisma).
type WaMessageType = "text" | "image" | "audio" | "video" | "file";

// Clasifica el contenido de un mensaje entrante en { messageType, text }.
//   - text = el texto real, o el caption de una media (puede ser null para media sin caption).
//   - Devuelve null para lo que aún no soportamos (reacciones, protocolo, ubicación, contactos…).
// La DESCARGA de la media en sí queda como TODO: por ahora sólo guardamos tipo + caption/placeholder
// para no romper el chat (el placeholder "[imagen]" lo pone el backend según messageType).
function classifyMessage(message: WAMessageContent | null | undefined): {
  messageType: WaMessageType;
  text: string | null;
} | null {
  if (!message) return null;

  // Desenvuelve envoltorios habituales (efímeros, ver-una-vez, documento con caption).
  const inner =
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.viewOnceMessageV2Extension?.message ??
    message.documentWithCaptionMessage?.message ??
    message;

  if (inner.conversation) return { messageType: "text", text: inner.conversation };
  if (inner.extendedTextMessage?.text)
    return { messageType: "text", text: inner.extendedTextMessage.text };
  if (inner.imageMessage) return { messageType: "image", text: inner.imageMessage.caption ?? null };
  if (inner.stickerMessage) return { messageType: "image", text: null };
  if (inner.videoMessage) return { messageType: "video", text: inner.videoMessage.caption ?? null };
  if (inner.audioMessage) return { messageType: "audio", text: null };
  if (inner.documentMessage)
    return {
      messageType: "file",
      text: inner.documentMessage.caption ?? inner.documentMessage.fileName ?? null,
    };

  return null; // TODO(media): location, contact, reactions, polls… aún no soportados.
}

// Reenvía un mensaje entrante al backend (endpoint interno).
async function forwardIncoming(payload: {
  from: string;
  pushName: string | null;
  text: string | null;
  messageType: WaMessageType;
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

  // Si entramos por una llamada directa (start/disconnect) con un reintento aún en cola, lo cancelamos.
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

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
      reconnectAttempts = 0; // conexión sana: reinicia el backoff
      console.log(`[wa] Conectado como ${phoneNumber ?? "(número desconocido)"}.`);
    }

    if (connection === "close") {
      connected = false;
      phoneNumber = null;
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
        ?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        // Sesión cerrada desde el teléfono: credenciales inservibles -> limpiar auth y QR nuevo.
        console.log("[wa] Sesión cerrada (loggedOut). Limpio auth y espero un nuevo QR.");
        await clearAuth();
        reconnectAttempts = 0; // arranque limpio para el nuevo QR
      } else {
        console.log(`[wa] Conexión cerrada (code ${statusCode ?? "?"}). Reconectando con backoff…`);
      }
      // En ambos casos reconectamos (con backoff): si no hay credenciales, emitirá un QR nuevo.
      scheduleReconnect();
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

      // Texto y media (imagen/audio/video/archivo). El backend guarda tipo + caption/placeholder.
      const classified = classifyMessage(m.message);
      if (!classified) continue; // tipo aún no soportado: lo ignoramos sin romper.

      await forwardIncoming({
        from: jid,
        pushName: m.pushName ?? null,
        text: classified.text,
        messageType: classified.messageType,
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
    reconnectAttempts = 0; // desconexión manual: arranque limpio para el nuevo QR
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
