import { BotStatus, Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { graphSchema, initialGraph } from "../lib/botGraph.js";
import { notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const jsonValue: z.ZodType<Prisma.InputJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);

const createSchema = z.object({
  name: z.string().min(1),
  status: z.nativeEnum(BotStatus).optional(),
  triggerType: z.string().nullable().optional(),
  triggerConfig: jsonValue.nullable().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.nativeEnum(BotStatus).optional(),
    triggerType: z.string().nullable().optional(),
    triggerConfig: jsonValue.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para actualizar" });

// GET /api/bots — lista con conteo de sesiones; sin el grafo completo.
export async function listBots(_req: Request, res: Response) {
  const bots = await prisma.bot.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sessions: true } } },
  });
  sendData(res, bots);
}

// GET /api/bots/:id — incluye el grafo del flujo.
export async function getBot(req: Request, res: Response) {
  const bot = await prisma.bot.findUnique({
    where: { id: req.params.id },
    include: { flow: true, _count: { select: { sessions: true } } },
  });
  if (!bot) throw notFound("Bot no encontrado");
  sendData(res, bot);
}

// POST /api/bots — crea el bot con un grafo inicial mínimo (un nodo start_salesbot).
export async function createBot(req: Request, res: Response) {
  const body = validate(createSchema, req.body ?? {});
  const bot = await prisma.bot.create({
    data: {
      name: body.name,
      status: body.status ?? BotStatus.active,
      triggerType: body.triggerType ?? null,
      triggerConfig: (body.triggerConfig ?? Prisma.DbNull) as Prisma.InputJsonValue,
      flow: { create: { graph: initialGraph() as unknown as Prisma.InputJsonValue } },
    },
    include: { flow: true },
  });
  sendData(res, bot, 201);
}

// PATCH /api/bots/:id — metadatos del bot (no el grafo, eso va por PUT /flow).
export async function updateBot(req: Request, res: Response) {
  const body = validate(updateSchema, req.body ?? {});

  const data: Prisma.BotUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.status !== undefined) data.status = body.status;
  if (body.triggerType !== undefined) data.triggerType = body.triggerType;
  if (body.triggerConfig !== undefined) {
    data.triggerConfig = (body.triggerConfig ?? Prisma.DbNull) as Prisma.InputJsonValue;
  }

  try {
    const bot = await prisma.bot.update({
      where: { id: req.params.id },
      data,
      include: { flow: true },
    });
    sendData(res, bot);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Bot no encontrado");
    }
    throw err;
  }
}

// DELETE /api/bots/:id — borra el bot (flow y sesiones se eliminan en cascada).
export async function deleteBot(req: Request, res: Response) {
  try {
    await prisma.bot.delete({ where: { id: req.params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Bot no encontrado");
    }
    throw err;
  }
  sendData(res, { id: req.params.id });
}

// PUT /api/bots/:id/flow — valida el grafo con zod y lo guarda (upsert del BotFlow).
export async function putBotFlow(req: Request, res: Response) {
  const botId = req.params.id;
  const graph = validate(graphSchema, req.body ?? {});

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) throw notFound("Bot no encontrado");

  const flow = await prisma.botFlow.upsert({
    where: { botId },
    update: { graph: graph as unknown as Prisma.InputJsonValue },
    create: { botId, graph: graph as unknown as Prisma.InputJsonValue },
  });
  sendData(res, flow);
}
