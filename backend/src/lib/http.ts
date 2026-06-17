import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";

import { badRequest } from "./errors.js";

// Respuesta JSON consistente para éxito: siempre { data }.
export function sendData<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data });
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

// Envuelve un handler async y reenvía cualquier error al middleware central.
export const asyncHandler =
  (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Valida `data` contra un schema zod; convierte el error en un 400 con detalles.
export function validate<T>(schema: ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      throw badRequest("Datos inválidos", err.flatten());
    }
    throw err;
  }
}
