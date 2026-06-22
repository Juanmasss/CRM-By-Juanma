import { MessageDirection } from "@prisma/client";

import { prisma } from "./prisma.js";

// ── Ventana de servicio de 24 horas (estilo WhatsApp) ──
// Solo se puede ESCRIBIR a un contacto dentro de las 24h desde su ÚLTIMO mensaje entrante.
// Pasado ese tiempo la ventana queda CERRADA (ni humano, ni IA, ni bot pueden escribir)
// hasta que el contacto vuelva a escribir, lo que reabre la ventana.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Fecha del último mensaje entrante (del contacto) de la conversación, o null si no hay ninguno.
export async function getLastInboundAt(conversationId: string): Promise<Date | null> {
  const last = await prisma.message.findFirst({
    where: { conversationId, direction: MessageDirection.inbound },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt ?? null;
}

// True si la ventana de 24h sigue abierta (hay un mensaje entrante reciente).
export async function isReplyWindowOpen(
  conversationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const lastInboundAt = await getLastInboundAt(conversationId);
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() <= REPLY_WINDOW_MS;
}
