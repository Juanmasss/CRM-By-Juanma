import type { NextFunction, Request, Response } from "express";

// Protege las rutas internas (servicio↔backend) con el header x-internal-secret.
export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || req.header("x-internal-secret") !== secret) {
    return res.status(401).json({ error: { message: "unauthorized" } });
  }
  next();
}
