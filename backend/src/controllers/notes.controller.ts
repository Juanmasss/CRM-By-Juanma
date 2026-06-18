import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const createSchema = z.object({
  body: z.string().min(1),
  userId: z.string().nullable().optional(),
});

const updateSchema = z.object({ body: z.string().min(1) });

// GET /api/leads/:id/notes  — notas del lead, más recientes primero.
export async function listLeadNotes(req: Request, res: Response) {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) throw notFound("Lead no encontrado");

  const notes = await prisma.note.findMany({
    where: { leadId: req.params.id },
    orderBy: { createdAt: "desc" },
    include: { user: true },
  });
  sendData(res, notes);
}

// POST /api/leads/:id/notes
export async function createLeadNote(req: Request, res: Response) {
  const leadId = req.params.id;
  const body = validate(createSchema, req.body ?? {});

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw notFound("Lead no encontrado");

  const note = await prisma.note.create({
    data: { leadId, body: body.body, userId: body.userId ?? null },
    include: { user: true },
  });
  sendData(res, note, 201);
}

// PATCH /api/notes/:id
export async function updateNote(req: Request, res: Response) {
  const body = validate(updateSchema, req.body ?? {});
  try {
    const note = await prisma.note.update({
      where: { id: req.params.id },
      data: { body: body.body },
      include: { user: true },
    });
    sendData(res, note);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Nota no encontrada");
    }
    throw err;
  }
}

// DELETE /api/notes/:id
export async function deleteNote(req: Request, res: Response) {
  try {
    await prisma.note.delete({ where: { id: req.params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Nota no encontrada");
    }
    throw err;
  }
  sendData(res, { id: req.params.id });
}
