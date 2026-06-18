import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { badRequest, conflict, notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().nullable().optional(),
});

const updateSchema = createSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para actualizar" });

const addTagSchema = z.object({ tagId: z.string().min(1) });

// GET /api/tags  — con el número de leads asociados.
export async function listTags(_req: Request, res: Response) {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { leads: true } } },
  });
  sendData(res, tags);
}

// POST /api/tags
export async function createTag(req: Request, res: Response) {
  const body = validate(createSchema, req.body ?? {});
  try {
    const tag = await prisma.tag.create({ data: { name: body.name, color: body.color ?? null } });
    sendData(res, tag, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("Ya existe una etiqueta con ese nombre");
    }
    throw err;
  }
}

// PATCH /api/tags/:id
export async function updateTag(req: Request, res: Response) {
  const body = validate(updateSchema, req.body ?? {});
  try {
    const tag = await prisma.tag.update({ where: { id: req.params.id }, data: body });
    sendData(res, tag);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") throw notFound("Etiqueta no encontrada");
      if (err.code === "P2002") throw conflict("Ya existe una etiqueta con ese nombre");
    }
    throw err;
  }
}

// DELETE /api/tags/:id
export async function deleteTag(req: Request, res: Response) {
  try {
    await prisma.tag.delete({ where: { id: req.params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Etiqueta no encontrada");
    }
    throw err;
  }
  sendData(res, { id: req.params.id });
}

// POST /api/leads/:id/tags  — asocia una etiqueta existente al lead.
export async function addTagToLead(req: Request, res: Response) {
  const leadId = req.params.id;
  const { tagId } = validate(addTagSchema, req.body ?? {});

  const [lead, tag] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.tag.findUnique({ where: { id: tagId } }),
  ]);
  if (!lead) throw notFound("Lead no encontrado");
  if (!tag) throw badRequest("La etiqueta indicada no existe");

  await prisma.leadTag.upsert({
    where: { leadId_tagId: { leadId, tagId } },
    update: {},
    create: { leadId, tagId },
  });

  const tags = await prisma.leadTag.findMany({
    where: { leadId },
    include: { tag: true },
  });
  sendData(res, tags, 201);
}

// DELETE /api/leads/:id/tags/:tagId  — quita la asociación lead↔etiqueta.
export async function removeTagFromLead(req: Request, res: Response) {
  const { id: leadId, tagId } = req.params;
  try {
    await prisma.leadTag.delete({ where: { leadId_tagId: { leadId, tagId } } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("La etiqueta no está asociada a este lead");
    }
    throw err;
  }
  sendData(res, { leadId, tagId });
}
