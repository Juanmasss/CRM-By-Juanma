import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../lib/errors.js";

// 404 para rutas no registradas.
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: "Ruta no encontrada" } });
}

// Middleware de errores centralizado: toda respuesta de error es { error: { message, details? } }.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: { message: "Recurso no encontrado" } });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: { message: "Ya existe un registro con esos datos únicos", details: err.meta } });
    }
    if (err.code === "P2003") {
      return res.status(409).json({ error: { message: "Operación bloqueada por referencias existentes", details: err.meta } });
    }
  }

  console.error("[error]", err);
  return res.status(500).json({ error: { message: "Error interno del servidor" } });
}
