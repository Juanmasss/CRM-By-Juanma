import { HttpError } from "./errors.js";

// Lee la config en tiempo de ejecución (dotenv del index.ts ya cargó el .env raíz).
function svc() {
  return {
    url: process.env.WA_SERVICE_URL ?? "http://localhost:4100",
    secret: process.env.INTERNAL_API_SECRET ?? "",
  };
}

function headers(secret: string) {
  return { "content-type": "application/json", "x-internal-secret": secret };
}

// Pide al whatsapp-service que envíe un mensaje. Devuelve el externalMessageId.
export async function sendViaService(input: {
  to: string;
  text: string;
}): Promise<string | undefined> {
  const { url, secret } = svc();
  let res: Response;
  try {
    res = await fetch(`${url}/send`, {
      method: "POST",
      headers: headers(secret),
      body: JSON.stringify(input),
    });
  } catch {
    throw new HttpError(502, "No se pudo contactar al servicio de WhatsApp");
  }
  if (!res.ok) {
    throw new HttpError(502, "El servicio de WhatsApp rechazó el envío");
  }
  const data = (await res.json()) as { ok?: boolean; externalMessageId?: string };
  if (!data.ok) throw new HttpError(502, "El servicio de WhatsApp no confirmó el envío");
  return data.externalMessageId;
}

// Proxy de GET /status + GET /qr del servicio -> estado de conexión combinado.
export async function getConnection(): Promise<{
  connected: boolean;
  phoneNumber: string | null;
  qrPng: string | null;
  awaitingQr: boolean;
}> {
  const { url, secret } = svc();
  try {
    const [statusRes, qrRes] = await Promise.all([
      fetch(`${url}/status`, { headers: headers(secret) }),
      fetch(`${url}/qr`, { headers: headers(secret) }),
    ]);
    const status = (await statusRes.json()) as {
      connected: boolean;
      phoneNumber: string | null;
      awaitingQr?: boolean;
    };
    const qr = (await qrRes.json()) as { qrPng: string | null };
    return {
      connected: status.connected,
      phoneNumber: status.phoneNumber,
      qrPng: qr.qrPng,
      awaitingQr: Boolean(status.awaitingQr),
    };
  } catch {
    // Si el servicio está caído, lo reportamos como desconectado en vez de romper.
    return { connected: false, phoneNumber: null, qrPng: null, awaitingQr: false };
  }
}

// Proxy de POST /connect del servicio -> pide generar un QR (ventana de 5 min).
export async function connectService(): Promise<{ ok: boolean }> {
  const { url, secret } = svc();
  try {
    const res = await fetch(`${url}/connect`, { method: "POST", headers: headers(secret) });
    if (!res.ok) throw new Error("bad status");
    return (await res.json()) as { ok: boolean };
  } catch {
    throw new HttpError(502, "No se pudo iniciar la vinculación de WhatsApp");
  }
}

// Proxy de POST /disconnect del servicio.
export async function disconnectService(): Promise<{ ok: boolean }> {
  const { url, secret } = svc();
  try {
    const res = await fetch(`${url}/disconnect`, { method: "POST", headers: headers(secret) });
    if (!res.ok) throw new Error("bad status");
    return (await res.json()) as { ok: boolean };
  } catch {
    throw new HttpError(502, "No se pudo desconectar el servicio de WhatsApp");
  }
}
