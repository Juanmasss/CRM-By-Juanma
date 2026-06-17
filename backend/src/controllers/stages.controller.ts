import { StageType } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { badRequest, conflict, notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().nullable().optional(),
  type: z.nativeEnum(StageType).optional(),
  position: z.number().int().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    color: z.string().nullable().optional(),
    type: z.nativeEnum(StageType).optional(),
    position: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para actualizar" });

const reorderSchema = z
  .array(z.object({ stageId: z.string().min(1), position: z.number().int() }))
  .min(1);

async function nextStagePosition(pipelineId: string) {
  const last = await prisma.stage.findFirst({
    where: { pipelineId },
    orderBy: { position: "desc" },
  });
  return last ? last.position + 1 : 0;
}

// POST /api/pipelines/:id/stages
export async function createStage(req: Request, res: Response) {
  const pipelineId = req.params.id;
  const pipeline = await prisma.pipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline) throw notFound("Pipeline no encontrado");

  const body = validate(createSchema, req.body ?? {});
  const position = body.position ?? (await nextStagePosition(pipelineId));
  const stage = await prisma.stage.create({
    data: {
      pipelineId,
      name: body.name,
      color: body.color ?? null,
      type: body.type ?? StageType.normal,
      position,
    },
  });
  sendData(res, stage, 201);
}

// PATCH /api/stages/:id
export async function updateStage(req: Request, res: Response) {
  const body = validate(updateSchema, req.body ?? {});
  const stage = await prisma.stage.update({ where: { id: req.params.id }, data: body });
  sendData(res, stage);
}

// DELETE /api/stages/:id
export async function deleteStage(req: Request, res: Response) {
  const id = req.params.id;
  const stage = await prisma.stage.findUnique({
    where: { id },
    include: { _count: { select: { leads: true } } },
  });
  if (!stage) throw notFound("Etapa no encontrada");
  if (stage._count.leads > 0) {
    throw conflict("No se puede eliminar una etapa con leads. Mueve los leads a otra etapa primero.");
  }
  await prisma.stage.delete({ where: { id } });
  sendData(res, { id });
}

// PATCH /api/pipelines/:id/stages/reorder  — body: [{ stageId, position }]
export async function reorderStages(req: Request, res: Response) {
  const pipelineId = req.params.id;
  const raw = Array.isArray(req.body) ? req.body : (req.body?.stages ?? req.body);
  const payload = validate(reorderSchema, raw);

  const ids = payload.map((p) => p.stageId);
  const existing = await prisma.stage.findMany({ where: { id: { in: ids }, pipelineId } });
  if (existing.length !== ids.length) {
    throw badRequest("Algunas etapas no existen o no pertenecen a este pipeline");
  }

  await prisma.$transaction(
    payload.map((p) =>
      prisma.stage.update({ where: { id: p.stageId }, data: { position: p.position } }),
    ),
  );

  const stages = await prisma.stage.findMany({
    where: { pipelineId },
    orderBy: { position: "asc" },
  });
  sendData(res, stages);
}
