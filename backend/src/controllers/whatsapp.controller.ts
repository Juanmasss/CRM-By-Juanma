import type { Request, Response } from "express";

import { sendData } from "../lib/http.js";
import { disconnectService, getConnection } from "../lib/waService.js";

// GET /api/whatsapp/connection — proxy de /status + /qr del servicio.
export async function getWhatsappConnection(_req: Request, res: Response) {
  const connection = await getConnection();
  sendData(res, connection);
}

// POST /api/whatsapp/disconnect — proxy de /disconnect del servicio.
export async function postWhatsappDisconnect(_req: Request, res: Response) {
  const result = await disconnectService();
  sendData(res, result);
}
