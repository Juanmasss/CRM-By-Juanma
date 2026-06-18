import { Prisma, TaskType } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { badRequest, notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

// status es un filtro derivado de completedAt/dueAt, no una columna.
const taskStatus = z.enum(["pending", "completed", "overdue"]);

const listQuerySchema = z.object({
  status: taskStatus.optional(),
  type: z.nativeEnum(TaskType).optional(),
  assignedTo: z.string().optional(),
  leadId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  type: z.nativeEnum(TaskType).optional(),
  description: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  completed: z.boolean().optional(),
});

const updateSchema = z
  .object({
    title: z.string().min(1).optional(),
    type: z.nativeEnum(TaskType).optional(),
    description: z.string().nullable().optional(),
    leadId: z.string().nullable().optional(),
    assignedToUserId: z.string().nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para actualizar" });

// GET /api/tasks?status=&type=&assignedTo=&leadId=&from=&to=
export async function listTasks(req: Request, res: Response) {
  const q = validate(listQuerySchema, req.query);
  const where: Prisma.TaskWhereInput = {};

  if (q.type) where.type = q.type;
  if (q.assignedTo) where.assignedToUserId = q.assignedTo;
  if (q.leadId) where.leadId = q.leadId;

  if (q.status === "completed") where.completedAt = { not: null };
  if (q.status === "pending") where.completedAt = null;
  if (q.status === "overdue") {
    where.completedAt = null;
    where.dueAt = { lt: new Date() };
  }

  // Rango por fecha de vencimiento.
  if (q.from || q.to) {
    const dueAt: Prisma.DateTimeNullableFilter = {};
    if (q.from) dueAt.gte = q.from;
    if (q.to) dueAt.lte = q.to;
    where.dueAt = { ...(where.dueAt as Prisma.DateTimeNullableFilter | undefined), ...dueAt };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    include: { assignedTo: true, lead: { select: { id: true, name: true } } },
  });
  sendData(res, tasks);
}

// GET /api/tasks/:id
export async function getTask(req: Request, res: Response) {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { assignedTo: true, lead: { select: { id: true, name: true } } },
  });
  if (!task) throw notFound("Tarea no encontrada");
  sendData(res, task);
}

// POST /api/tasks
export async function createTask(req: Request, res: Response) {
  const body = validate(createSchema, req.body ?? {});

  if (body.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (!lead) throw badRequest("El lead indicado no existe");
  }

  const task = await prisma.task.create({
    data: {
      title: body.title,
      type: body.type ?? TaskType.task,
      description: body.description ?? null,
      leadId: body.leadId ?? null,
      assignedToUserId: body.assignedToUserId ?? null,
      dueAt: body.dueAt ?? null,
      completedAt: body.completed ? new Date() : null,
    },
    include: { assignedTo: true, lead: { select: { id: true, name: true } } },
  });
  sendData(res, task, 201);
}

// PATCH /api/tasks/:id  — completar => completedAt (true sella la fecha, false la limpia).
export async function updateTask(req: Request, res: Response) {
  const id = req.params.id;
  const body = validate(updateSchema, req.body ?? {});

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) throw notFound("Tarea no encontrada");

  if (body.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (!lead) throw badRequest("El lead indicado no existe");
  }

  const data: Prisma.TaskUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.type !== undefined) data.type = body.type;
  if (body.description !== undefined) data.description = body.description;
  if (body.dueAt !== undefined) data.dueAt = body.dueAt;
  if (body.leadId !== undefined) {
    data.lead = body.leadId ? { connect: { id: body.leadId } } : { disconnect: true };
  }
  if (body.assignedToUserId !== undefined) {
    data.assignedTo = body.assignedToUserId
      ? { connect: { id: body.assignedToUserId } }
      : { disconnect: true };
  }
  if (body.completed !== undefined) {
    // No reescribe la fecha si ya estaba completada.
    data.completedAt = body.completed ? (existing.completedAt ?? new Date()) : null;
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: { assignedTo: true, lead: { select: { id: true, name: true } } },
  });
  sendData(res, task);
}

// DELETE /api/tasks/:id
export async function deleteTask(req: Request, res: Response) {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Tarea no encontrada");
    }
    throw err;
  }
  sendData(res, { id: req.params.id });
}
