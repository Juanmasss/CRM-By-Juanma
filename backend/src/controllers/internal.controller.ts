import {
  ChannelType,
  ConversationMode,
  MessageDirection,
  MessageStatus,
  SenderType,
} from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { runAiReply } from "../lib/aiReply.js";
import { badRequest } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const incomingSchema = z.object({
  from: z.string().min(1), // jid de WhatsApp, p. ej. "573001112233@s.whatsapp.net"
  pushName: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  externalMessageId: z.string().nullable().optional(),
  timestamp: z.number().optional(), // unix en segundos
});

// "573001112233@s.whatsapp.net" / "573001112233:6@..." -> "573001112233"
function numberFromJid(jid: string): string {
  return jid.split("@")[0]?.split(":")[0] ?? jid;
}

// POST /api/internal/whatsapp/incoming — identifica/crea contact+lead+conversation y guarda el mensaje.
export async function whatsappIncoming(req: Request, res: Response) {
  const body = validate(incomingSchema, req.body ?? {});
  const jid = body.from;
  const number = numberFromJid(jid);
  const messageAt = body.timestamp ? new Date(body.timestamp * 1000) : new Date();

  // ── Canal de WhatsApp (se crea si aún no existe) ──
  let channel = await prisma.channel.findFirst({ where: { type: ChannelType.whatsapp } });
  if (!channel) {
    channel = await prisma.channel.create({
      data: { type: ChannelType.whatsapp, name: "WhatsApp", isActive: true },
    });
  }

  // ── Contacto por número (canal whatsapp) ──
  let contact = await prisma.contact.findFirst({
    where: { channel: ChannelType.whatsapp, channelUserId: number },
  });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        name: body.pushName?.trim() || number,
        phone: `+${number}`,
        channel: ChannelType.whatsapp,
        channelUserId: number,
      },
    });
  } else if (body.pushName && (contact.name === number || !contact.name)) {
    // Completa el nombre si antes sólo teníamos el número.
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { name: body.pushName.trim() },
    });
  }

  // ── Conversación por (canal, jid) ──
  let conversation = await prisma.conversation.findUnique({
    where: { channelId_externalThreadId: { channelId: channel.id, externalThreadId: jid } },
  });

  if (!conversation) {
    // Pipeline por defecto + etapa de entrada ("Leads entrantes", type=incoming).
    const pipeline = await prisma.pipeline.findFirst({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { stages: { orderBy: { position: "asc" } } },
    });
    if (!pipeline || pipeline.stages.length === 0) {
      throw badRequest("No hay un pipeline con etapas configurado");
    }
    const incoming =
      pipeline.stages.find((s) => s.type === "incoming") ?? pipeline.stages[0];

    const lead = await prisma.lead.create({
      data: {
        name: contact.name,
        pipelineId: pipeline.id,
        stageId: incoming.id,
        contactId: contact.id,
        source: "whatsapp",
      },
    });

    conversation = await prisma.conversation.create({
      data: {
        leadId: lead.id,
        contactId: contact.id,
        channelId: channel.id,
        externalThreadId: jid,
        status: "open",
        // mode por defecto 'human' hasta que existan los motores bot/IA (B8/B9).
        lastMessageAt: messageAt,
      },
    });
  }

  // ── Mensaje entrante (sender_type='contact', direction='inbound') ──
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.inbound,
      senderType: SenderType.contact,
      senderName: body.pushName?.trim() || contact.name,
      body: body.text ?? null,
      externalMessageId: body.externalMessageId ?? null,
      status: MessageStatus.delivered,
      createdAt: messageAt,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: messageAt, status: "open" },
  });

  // Según conversation.mode disparamos el motor automático (fire-and-forget: no bloquea la respuesta
  // al servicio de WhatsApp ni propaga errores). 'human' (por defecto): no hace nada automático.
  if (conversation.mode === ConversationMode.ai) {
    void runAiReply({ conversationId: conversation.id });
  }
  // TODO(B9): if (conversation.mode === 'bot') => motor de flujo del salesbot.

  sendData(res, { conversationId: conversation.id, messageId: message.id }, 201);
}
