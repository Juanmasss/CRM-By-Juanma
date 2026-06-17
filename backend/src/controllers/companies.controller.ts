import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { notFound } from "../lib/errors.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const listQuerySchema = z.object({ search: z.string().optional() });

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

const updateSchema = createSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para actualizar" });

export async function listCompanies(req: Request, res: Response) {
  const q = validate(listQuerySchema, req.query);
  const where: Prisma.CompanyWhereInput = {};
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { email: { contains: q.search, mode: "insensitive" } },
      { phone: { contains: q.search, mode: "insensitive" } },
    ];
  }

  const companies = await prisma.company.findMany({
    where,
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true, leads: true } } },
  });
  sendData(res, companies);
}

// GET /api/companies/:id  — con sus contactos y leads.
export async function getCompany(req: Request, res: Response) {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: { orderBy: { name: "asc" } },
      leads: { include: { stage: true, pipeline: true }, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!company) throw notFound("Empresa no encontrada");
  sendData(res, company);
}

export async function createCompany(req: Request, res: Response) {
  const body = validate(createSchema, req.body ?? {});
  const company = await prisma.company.create({ data: body });
  sendData(res, company, 201);
}

export async function updateCompany(req: Request, res: Response) {
  const body = validate(updateSchema, req.body ?? {});
  const company = await prisma.company.update({ where: { id: req.params.id }, data: body });
  sendData(res, company);
}

export async function deleteCompany(req: Request, res: Response) {
  await prisma.company.delete({ where: { id: req.params.id } });
  sendData(res, { id: req.params.id });
}
