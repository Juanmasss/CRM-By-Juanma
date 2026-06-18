import { ChannelType, LeadStatus, Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { badRequest, notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const listQuerySchema = z.object({
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  channel: z.nativeEnum(ChannelType).optional(),
  search: z.string().optional(),
});

const customFieldsInput = z.array(
  z.object({ fieldId: z.string().min(1), value: z.string().nullable() }),
);

const createSchema = z.object({
  name: z.string().min(1),
  pipelineId: z.string().min(1),
  stageId: z.string().optional(),
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  responsibleUserId: z.string().nullable().optional(),
  value: z.number().nonnegative().optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  source: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  customFields: customFieldsInput.optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    pipelineId: z.string().optional(),
    stageId: z.string().optional(),
    contactId: z.string().nullable().optional(),
    companyId: z.string().nullable().optional(),
    responsibleUserId: z.string().nullable().optional(),
    value: z.number().nonnegative().optional(),
    status: z.nativeEnum(LeadStatus).optional(),
    source: z.string().nullable().optional(),
    tagIds: z.array(z.string()).optional(),
    customFields: customFieldsInput.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para actualizar" });

// Resuelve la etapa destino: valida que pertenezca al pipeline, o devuelve la de entrada por defecto.
async function resolveStage(pipelineId: string, stageId?: string) {
  if (stageId) {
    const stage = await prisma.stage.findFirst({ where: { id: stageId, pipelineId } });
    if (!stage) throw badRequest("La etapa indicada no pertenece al pipeline");
    return stage;
  }
  const incoming = await prisma.stage.findFirst({
    where: { pipelineId, type: "incoming" },
    orderBy: { position: "asc" },
  });
  const fallback =
    incoming ??
    (await prisma.stage.findFirst({ where: { pipelineId }, orderBy: { position: "asc" } }));
  if (!fallback) throw badRequest("El pipeline no tiene etapas configuradas");
  return fallback;
}

// GET /api/leads?pipelineId=&stageId=&channel=&search=
export async function listLeads(req: Request, res: Response) {
  const q = validate(listQuerySchema, req.query);
  const where: Prisma.LeadWhereInput = {};
  if (q.pipelineId) where.pipelineId = q.pipelineId;
  if (q.stageId) where.stageId = q.stageId;
  if (q.channel) where.conversations = { some: { channel: { type: q.channel } } };
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { contact: { name: { contains: q.search, mode: "insensitive" } } },
      { contact: { phone: { contains: q.search, mode: "insensitive" } } },
      { contact: { email: { contains: q.search, mode: "insensitive" } } },
    ];
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ stage: { position: "asc" } }, { updatedAt: "desc" }],
    include: {
      stage: true,
      contact: true,
      company: true,
      responsible: true,
      tags: { include: { tag: true } },
    },
  });
  sendData(res, leads);
}

// GET /api/leads/:id  — contacto, empresa, tags, custom fields, conversaciones y últimas actividades.
export async function getLead(req: Request, res: Response) {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id },
    include: {
      pipeline: true,
      stage: true,
      contact: { include: { company: true } },
      company: true,
      responsible: true,
      tags: { include: { tag: true } },
      customFieldVals: { include: { field: true } },
      conversations: { include: { channel: true }, orderBy: { lastMessageAt: "desc" } },
      notes: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 15 },
      tasks: { include: { assignedTo: true }, orderBy: { createdAt: "desc" }, take: 15 },
    },
  });
  if (!lead) throw notFound("Lead no encontrado");

  // Últimas actividades = notas + tareas combinadas y ordenadas por fecha (más recientes primero).
  const activities = [
    ...lead.notes.map((n) => ({ kind: "note" as const, id: n.id, at: n.createdAt, data: n })),
    ...lead.tasks.map((t) => ({ kind: "task" as const, id: t.id, at: t.createdAt, data: t })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 15);

  sendData(res, { ...lead, activities });
}

// POST /api/leads
export async function createLead(req: Request, res: Response) {
  const body = validate(createSchema, req.body ?? {});

  const pipeline = await prisma.pipeline.findUnique({ where: { id: body.pipelineId } });
  if (!pipeline) throw badRequest("Pipeline no encontrado");
  const stage = await resolveStage(body.pipelineId, body.stageId);
  const status = body.status ?? LeadStatus.open;

  const lead = await prisma.lead.create({
    data: {
      name: body.name,
      pipelineId: body.pipelineId,
      stageId: stage.id,
      contactId: body.contactId ?? null,
      companyId: body.companyId ?? null,
      responsibleUserId: body.responsibleUserId ?? null,
      value: body.value ?? 0,
      status,
      source: body.source ?? null,
      closedAt: status === LeadStatus.open ? null : new Date(),
      ...(body.tagIds
        ? { tags: { create: body.tagIds.map((tagId) => ({ tagId })) } }
        : {}),
      ...(body.customFields
        ? {
            customFieldVals: {
              create: body.customFields.map((c) => ({ fieldId: c.fieldId, value: c.value })),
            },
          }
        : {}),
    },
    include: {
      stage: true,
      contact: true,
      company: true,
      tags: { include: { tag: true } },
    },
  });
  sendData(res, lead, 201);
}

// PATCH /api/leads/:id  — permite mover de etapa (y de pipeline) cambiando stage_id.
export async function updateLead(req: Request, res: Response) {
  const id = req.params.id;
  const body = validate(updateSchema, req.body ?? {});

  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw notFound("Lead no encontrado");

  const data: Prisma.LeadUpdateInput = {};

  if (body.name !== undefined) data.name = body.name;
  if (body.source !== undefined) data.source = body.source;
  if (body.value !== undefined) data.value = body.value;

  if (body.contactId !== undefined) {
    data.contact = body.contactId ? { connect: { id: body.contactId } } : { disconnect: true };
  }
  if (body.companyId !== undefined) {
    data.company = body.companyId ? { connect: { id: body.companyId } } : { disconnect: true };
  }
  if (body.responsibleUserId !== undefined) {
    data.responsible = body.responsibleUserId
      ? { connect: { id: body.responsibleUserId } }
      : { disconnect: true };
  }

  // Movimiento de etapa/pipeline.
  if (body.pipelineId !== undefined || body.stageId !== undefined) {
    const targetPipelineId = body.pipelineId ?? existing.pipelineId;
    const stage = await resolveStage(targetPipelineId, body.stageId);
    if (body.pipelineId !== undefined) data.pipeline = { connect: { id: targetPipelineId } };
    data.stage = { connect: { id: stage.id } };
  }

  if (body.status !== undefined) {
    data.status = body.status;
    data.closedAt = body.status === LeadStatus.open ? null : (existing.closedAt ?? new Date());
  }

  if (body.tagIds !== undefined) {
    data.tags = { deleteMany: {}, create: body.tagIds.map((tagId) => ({ tagId })) };
  }

  if (body.customFields !== undefined) {
    data.customFieldVals = {
      upsert: body.customFields.map((c) => ({
        where: { leadId_fieldId: { leadId: id, fieldId: c.fieldId } },
        update: { value: c.value },
        create: { fieldId: c.fieldId, value: c.value },
      })),
    };
  }

  const lead = await prisma.lead.update({
    where: { id },
    data,
    include: {
      stage: true,
      contact: true,
      company: true,
      responsible: true,
      tags: { include: { tag: true } },
      customFieldVals: { include: { field: true } },
    },
  });
  sendData(res, lead);
}

// DELETE /api/leads/:id
export async function deleteLead(req: Request, res: Response) {
  await prisma.lead.delete({ where: { id: req.params.id } });
  sendData(res, { id: req.params.id });
}

const customFieldsSchema = z.object({ customFields: customFieldsInput });

// PATCH /api/leads/:id/custom-fields  — upsert de lead_custom_field_values.
export async function patchLeadCustomFields(req: Request, res: Response) {
  const leadId = req.params.id;
  const { customFields } = validate(customFieldsSchema, req.body ?? {});

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw notFound("Lead no encontrado");

  // Valida que los campos referenciados existan y sean de entidad 'lead'.
  if (customFields.length > 0) {
    const ids = [...new Set(customFields.map((c) => c.fieldId))];
    const defs = await prisma.customFieldDefinition.findMany({
      where: { id: { in: ids }, entity: "lead" },
      select: { id: true },
    });
    if (defs.length !== ids.length) throw badRequest("Algún campo personalizado no existe");
  }

  await prisma.$transaction(
    customFields.map((c) =>
      prisma.leadCustomFieldValue.upsert({
        where: { leadId_fieldId: { leadId, fieldId: c.fieldId } },
        update: { value: c.value },
        create: { leadId, fieldId: c.fieldId, value: c.value },
      }),
    ),
  );

  const values = await prisma.leadCustomFieldValue.findMany({
    where: { leadId },
    include: { field: true },
  });
  sendData(res, values);
}
