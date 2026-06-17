import { ChannelType, Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const listQuerySchema = z.object({
  search: z.string().optional(),
  companyId: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  channel: z.nativeEnum(ChannelType).nullable().optional(),
  channelUserId: z.string().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  companyId: z.string().nullable().optional(),
});

const updateSchema = createSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para actualizar" });

export async function listContacts(req: Request, res: Response) {
  const q = validate(listQuerySchema, req.query);
  const where: Prisma.ContactWhereInput = {};
  if (q.companyId) where.companyId = q.companyId;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { phone: { contains: q.search, mode: "insensitive" } },
      { email: { contains: q.search, mode: "insensitive" } },
    ];
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { name: "asc" },
    include: { company: true, _count: { select: { leads: true } } },
  });
  sendData(res, contacts);
}

export async function getContact(req: Request, res: Response) {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: {
      company: true,
      leads: { include: { stage: true, pipeline: true }, orderBy: { updatedAt: "desc" } },
      conversations: { include: { channel: true }, orderBy: { lastMessageAt: "desc" } },
    },
  });
  if (!contact) throw notFound("Contacto no encontrado");
  sendData(res, contact);
}

export async function createContact(req: Request, res: Response) {
  const body = validate(createSchema, req.body ?? {});
  const contact = await prisma.contact.create({ data: body });
  sendData(res, contact, 201);
}

export async function updateContact(req: Request, res: Response) {
  const body = validate(updateSchema, req.body ?? {});
  const contact = await prisma.contact.update({ where: { id: req.params.id }, data: body });
  sendData(res, contact);
}

export async function deleteContact(req: Request, res: Response) {
  await prisma.contact.delete({ where: { id: req.params.id } });
  sendData(res, { id: req.params.id });
}
