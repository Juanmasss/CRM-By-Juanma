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

// Modo QR: true mientras hay un ciclo de vinculación en curso (ventana de 5 min abierta).
// Distingue "esperando escaneo" de "inactivo" (el usuario debe pulsar «Generar QR»).
let qrActive = false;
// Si las credenciales están registradas: hay una sesión válida -> reconexión silenciosa (sin QR).
let registered = false;

// Generación: cada socket captura la suya; los handlers de un socket reemplazado se ignoran.
// Evita reconexiones/QR duplicados cuando se recrea el socket.
let generation = 0;

// ── Ventana de QR ──
// Un único QR bajo demanda: cuando el usuario pide vincular, abrimos una ventana de 5 minutos
// durante la cual Baileys mantiene un QR escaneable (lo refresca solo). Si nadie escanea en ese
// tiempo, DETENEMOS la generación (no más QR) hasta que el usuario vuelva a pulsar «Generar QR».
// Así no se generan códigos en bucle infinito (que consumían CPU/red sin parar).
const QR_WINDOW_MS = 5 * 60 * 1000;
let qrWindowTimer: NodeJS.Timeout | undefined;

// ── Reconexión con backoff (sólo para sesión YA vinculada que se cae) ──
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | undefined;

function clearReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function clearQrWindow(): void {
  if (qrWindowTimer) {
    clearTimeout(qrWindowTimer);
    qrWindowTimer = undefined;
  }
}

function startQrWindow(): void {
  if (qrWindowTimer) return; // ya hay una ventana abierta
  qrWindowTimer = setTimeout(() => stopQr("expiró la ventana de 5 min"), QR_WINDOW_MS);
}

// Detiene por completo el modo QR: cierra el socket y deja el servicio inactivo a la espera
// de que el usuario pulse «Generar QR». No reconecta.
function stopQr(reason: string): void {
  clearQrWindow();
  clearReconnect();
  generation++; // invalida los handlers del socket actual
  try {
    sock?.end(undefined);
  } catch {
    /* noop */
  }
  sock = undefined;
  connected = false;
  phoneNumber = null;
  qrPng = null;
  qrActive = false;
  console.log(`[wa] QR detenido (${reason}). Pulsa «Generar QR» en el dashboard para reintentar.`);
}

// Programa una reconexión con backoff exponencial (sólo sesión vinculada).
function scheduleReconnect(): void {
  if (reconnectTimer) return;
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
// La DESCARGA de la media en sí queda como TODO: por ahora sólo guardamos tipo + caption/placeholder.
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
  clearReconnect();

  // Cierra cualquier socket previo antes de crear uno nuevo (evita sockets colgando).
  try {
    sock?.end(undefined);
  } catch {
    /* noop */
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  registered = Boolean(state.creds?.registered);

  // Versión del protocolo WA Web según Baileys (no fijar a mano).
  let version: [number, number, number] | undefined;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (err) {
    console.warn("[wa] No se pudo obtener la última versión de WA Web, uso la por defecto.", err);
  }

  sock = makeWASocket({ version, auth: state, logger });

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    registered = Boolean(sock?.authState?.creds?.registered);
  });

  sock.ev.on("connection.update", async (update) => {
    if (myGen !== generation) return; // socket reemplazado: ignorar

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // qr -> PNG Data URL (en memoria, lo sirve GET /qr) + ASCII en consola.
      qrPng = await QRCode.toDataURL(qr);
      connected = false;
      phoneNumber = null;
      qrActive = true;
      startQrWindow(); // por si la sesión cae a QR sin pasar por requestQr (idempotente)
      qrcodeTerminal.generate(qr, { small: true });
      console.log("[wa] QR listo (la ventana de vinculación dura 5 min).");
    }

    if (connection === "open") {
      connected = true;
      qrPng = null;
      qrActive = false;
      registered = true;
      phoneNumber = numberFromJid(sock?.user?.id);
      reconnectAttempts = 0;
      clearQrWindow();
      console.log(`[wa] Conectado como ${phoneNumber ?? "(número desconocido)"}.`);
    }

    if (connection === "close") {
      connected = false;
      phoneNumber = null;
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
        ?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        // Sesión cerrada desde el teléfono: credenciales inservibles -> limpiar y quedar inactivo.
        console.log("[wa] Sesión cerrada (loggedOut). Limpio auth.");
        await clearAuth();
        registered = false;
        stopQr("sesión cerrada");
      } else if (registered) {
        // Sesión vinculada que se cayó: reconectar en silencio con backoff.
        console.log(`[wa] Conexión cerrada (code ${statusCode ?? "?"}). Reconectando con backoff…`);
        scheduleReconnect();
      } else if (qrActive) {
        // Modo QR dentro de la ventana: refresca el QR reconectando (espera corta).
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            void connect();
          }, 2_000);
        }
      }
      // Si no está registrado y la ventana ya cerró: no hacemos nada (servicio inactivo).
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
  // Al arrancar: si hay sesión previa, reconecta en silencio. Si NO, queda inactivo esperando
  // que el usuario pulse «Generar QR» (no genera QR automáticamente -> sin bucle de códigos).
  async start(): Promise<void> {
    const { state } = await useMultiFileAuthState(config.authDir);
    if (state.creds?.registered) {
      console.log("[wa] Sesión previa encontrada. Reconectando…");
      await connect();
    } else {
      console.log('[wa] Sin sesión. Esperando que el usuario genere un QR desde el dashboard.');
    }
  },

  // POST /connect: el usuario pide vincular. Abre la ventana de 5 min y arranca el QR.
  async requestQr(): Promise<void> {
    if (connected) return; // ya conectado: nada que hacer
    reconnectAttempts = 0;
    clearQrWindow();
    qrActive = true;
    startQrWindow(); // la ventana cuenta desde el clic del usuario
    await connect();
  },

  getStatus(): {
    connected: boolean;
    phoneNumber: string | null;
    awaitingQr: boolean;
  } {
    return { connected, phoneNumber, awaitingQr: qrActive };
  },

  getQr(): { connected: boolean; qrPng: string | null; awaitingQr: boolean } {
    // Si ya está conectado no hay QR que mostrar.
    return { connected, qrPng: connected ? null : qrPng, awaitingQr: qrActive };
  },

  // POST /disconnect: cierra sesión, borra ./auth y queda inactivo (no auto-genera QR).
  async disconnect(): Promise<void> {
    try {
      await sock?.logout();
    } catch (err) {
      console.warn("[wa] logout() falló (posiblemente ya desconectado).", err);
    }
    clearReconnect();
    clearQrWindow();
    generation++; // invalida handlers del socket actual
    try {
      sock?.end(undefined);
    } catch {
      /* noop */
    }
    sock = undefined;
    connected = false;
    phoneNumber = null;
    qrPng = null;
    qrActive = false;
    registered = false;
    reconnectAttempts = 0;
    await clearAuth();
    console.log('[wa] Desconectado y auth limpiada. Pulsa «Generar QR» para vincular de nuevo.');
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
