import { MessageDirection, MessageStatus, SenderType } from "@prisma/client";
import type OpenAI from "openai";

import { isReplyWindowOpen } from "./messagingWindow.js";
import { getOpenRouter, openRouterModel } from "./openrouter.js";
import { prisma } from "./prisma.js";
import { sendViaService } from "./waService.js";

// Edita estos datos con los de tu tienda real.
const SYSTEM_PROMPT =
  "Eres el asistente de ventas de Tienda Juanma, una tienda online en Colombia que vende ropa, " +
  "calzado y accesorios de moda. Respondes por WhatsApp, en español, con tono cordial y breve. " +
  "Solo usas la información de esta conversación y del catálogo de la tienda. No inventes precios, " +
  "tallas ni disponibilidad que no conozcas; si no sabes algo, ofrece pasar con un asesor humano.";

const HISTORY_LIMIT = 12; // últimos N mensajes como contexto
const MAX_REPLIES_PER_MINUTE = 4; // tope de respuestas automáticas por conversación

// Registro en memoria de las marcas de tiempo de respuestas automáticas por conversación.
const replyLog = new Map<string, number[]>();

function recentCount(conversationId: string): number {
  const now = Date.now();
  const fresh = (replyLog.get(conversationId) ?? []).filter((t) => now - t < 60_000);
  replyLog.set(conversationId, fresh);
  return fresh.length;
}

function recordReply(conversationId: string): void {
  const arr = replyLog.get(conversationId) ?? [];
  arr.push(Date.now());
  replyLog.set(conversationId, arr);
}

// Motor de respuesta IA (modo 'ai'). Se invoca tras un mensaje entrante del contacto.
// NO lanza: cualquier fallo se registra y corta (sin reintentos en bucle).
export async function runAiReply({ conversationId }: { conversationId: string }): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return;
    if (conversation.mode !== "ai") return; // solo respondemos en modo ai

    // Salvaguarda anti-bucle: solo respondemos al último mensaje si es del CONTACTO.
    const last = await prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });
    if (!last || last.senderType !== SenderType.contact || !last.body) return;

    // Ventana de 24h: fuera de plazo no se responde (no se puede escribir al contacto).
    if (!(await isReplyWindowOpen(conversationId))) {
      console.warn(`[ai] Ventana de 24h cerrada en conversación ${conversationId}; omito.`);
      return;
    }

    // Rate limit por conversación.
    if (recentCount(conversationId) >= MAX_REPLIES_PER_MINUTE) {
      console.warn(`[ai] Límite de respuestas/min en conversación ${conversationId}; omito.`);
      return;
    }

    // Historial (cronológico) -> mensajes del chat. contact=>user, bot/agent=>assistant.
    const history = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    });
    history.reverse();

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history
        .filter((m) => m.body)
        .map((m) => ({
          role: m.senderType === SenderType.contact ? ("user" as const) : ("assistant" as const),
          content: m.body as string,
        })),
    ];

    const completion = await getOpenRouter().chat.completions.create({
      model: openRouterModel(),
      messages,
      temperature: 0.4,
      // Holgado: el modelo configurado razona antes de responder y con poco presupuesto
      // agota los tokens en el razonamiento (finish_reason='length', content vacío).
      max_tokens: 1000,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      console.warn("[ai] Respuesta vacía del modelo; omito.");
      return;
    }

    // Cuenta este envío para el rate limit (tras obtener respuesta, antes de persistir).
    recordReply(conversationId);

    let externalMessageId: string | undefined;
    if (conversation.externalThreadId) {
      try {
        externalMessageId = await sendViaService({
          to: conversation.externalThreadId,
          text: reply,
        });
      } catch (err) {
        console.error("[ai] No se pudo enviar la respuesta por WhatsApp:", err);
      }
    }

    const now = new Date();
    await prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.outbound,
        senderType: SenderType.bot,
        senderName: "Asistente",
        body: reply,
        externalMessageId: externalMessageId ?? null,
        status: externalMessageId ? MessageStatus.sent : MessageStatus.failed,
        createdAt: now,
      },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    });
  } catch (err) {
    // NUNCA reintentar en bucle: solo registrar. Incluye el 429 del modelo free de OpenRouter.
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      console.warn("[ai] OpenRouter respondió 429 (rate limit). No reintento.");
    } else {
      console.error("[ai] Error generando la respuesta IA:", err);
    }
  }
}
