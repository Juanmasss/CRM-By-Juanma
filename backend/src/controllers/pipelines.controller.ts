import type { Request, Response } from "express";
import { z } from "zod";

import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const createSchema = z.object({
  name: z.string().min(1),
  position: z.number().int().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    position: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para actualizar" });

async function nextPipelinePosition() {
  const last = await prisma.pipeline.findFirst({ orderBy: { position: "desc" } });
  return last ? last.position + 1 : 0;
}

export async function listPipelines(_req: Request, res: Response) {
  const pipelines = await prisma.pipeline.findMany({
    orderBy: { position: "asc" },
    include: {
      stages: { orderBy: { position: "asc" } },
      _count: { select: { leads: true } },
    },
  });
  sendData(res, pipelines);
}

export async function createPipeline(req: Request, res: Response) {
  const body = validate(createSchema, req.body ?? {});
  const position = body.position ?? (await nextPipelinePosition());
  const pipeline = await prisma.pipeline.create({ data: { name: body.name, position } });
  sendData(res, pipeline, 201);
}

export async function updatePipeline(req: Request, res: Response) {
  const body = validate(updateSchema, req.body ?? {});
  const pipeline = await prisma.pipeline.update({ where: { id: req.params.id }, data: body });
  sendData(res, pipeline);
}

export async function deletePipeline(req: Request, res: Response) {
  await prisma.pipeline.delete({ where: { id: req.params.id } });
  sendData(res, { id: req.params.id });
}
