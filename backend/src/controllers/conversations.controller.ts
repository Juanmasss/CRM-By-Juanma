import {
  ConversationMode,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
  SenderType,
} from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { badRequest, HttpError, notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { isReplyWindowOpen } from "../lib/messagingWindow.js";
import { prisma } from "../lib/prisma.js";
import { sendViaService } from "../lib/waService.js";

const listQuerySchema = z.object({
  status: z.nativeEnum(ConversationStatus).optional(),
  mode: z.nativeEnum(ConversationMode).optional(),
  search: z.string().optional(),
});

const postMessageSchema = z.object({ body: z.string().min(1) });
const patchModeSchema = z.object({ mode: z.nativeEnum(ConversationMode) });

// GET /api/conversations — bandeja: incluye contacto, lead, canal y el último mensaje.
export async function listConversations(req: Request, res: Response) {
  const q = validate(listQuerySchema, req.query);
  const where: Prisma.ConversationWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.mode) where.mode = q.mode;
  if (q.search) {
    where.OR = [
      { contact: { name: { contains: q.search, mode: "insensitive" } } },
      { contact: { phone: { contains: q.search, mode: "insensitive" } } },
      { lead: { name: { contains: q.search, mode: "insensitive" } } },
    ];
  }

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    include: {
      contact: true,
      lead: { select: { id: true, name: true, stageId: true } },
      channel: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  });
  sendData(res, conversations);
}

// GET /api/conversations/:id/messages — historial en orden cronológico.
export async function listMessages(req: Request, res: Response) {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conversation) throw notFound("Conversación no encontrada");

  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  sendData(res, messages);
}

// POST /api/conversations/:id/messages — el agente humano responde: envía por el servicio y persiste.
export async function postMessage(req: Request, res: Response) {
  const body = validate(postMessageSchema, req.body ?? {});

  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: { contact: true },
  });
  if (!conversation) throw notFound("Conversación no encontrada");
  if (!conversation.externalThreadId) {
    throw badRequest("La conversación no tiene un destino de WhatsApp asociado");
  }

  // Ventana de 24h: solo se puede escribir dentro de las 24h desde el último mensaje del contacto.
  if (!(await isReplyWindowOpen(conversation.id))) {
    throw new HttpError(
      403,
      "La ventana de 24 horas está cerrada. No puedes escribirle hasta que el contacto vuelva a escribir.",
    );
  }

  // Envía primero por WhatsApp; si falla, no persistimos un mensaje fantasma.
  const externalMessageId = await sendViaService({
    to: conversation.externalThreadId,
    text: body.body,
  });

  const now = new Date();
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.outbound,
      senderType: SenderType.agent,
      senderName: "Agente",
      body: body.body,
      externalMessageId: externalMessageId ?? null,
      status: MessageStatus.sent,
      createdAt: now,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now },
  });

  sendData(res, message, 201);
}

// PATCH /api/conversations/:id/mode — { mode: 'bot'|'ai'|'human' }
export async function patchMode(req: Request, res: Response) {
  const { mode } = validate(patchModeSchema, req.body ?? {});
  try {
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { mode },
    });
    sendData(res, conversation);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Conversación no encontrada");
    }
    throw err;
  }
}

// DELETE /api/conversations/:id
export async function deleteConversation(req: Request, res: Response) {
  try {
    await prisma.conversation.delete({ where: { id: req.params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Conversación no encontrada");
    }
    throw err;
  }
  sendData(res, { id: req.params.id });
}
