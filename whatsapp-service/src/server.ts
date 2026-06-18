import express, { type NextFunction, type Request, type Response } from "express";

import { config } from "./env.js";
import { wa } from "./whatsapp.js";

export function createServer() {
  const app = express();
  app.use(express.json());

  // Todas las rutas exigen el header x-internal-secret (= INTERNAL_API_SECRET).
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.header("x-internal-secret") !== config.internalSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  });

  // GET /status -> { connected, phoneNumber }
  app.get("/status", (_req, res) => {
    res.json(wa.getStatus());
  });

  // GET /qr -> { connected, qrPng }  (Data URL PNG o null si ya está conectado)
  app.get("/qr", (_req, res) => {
    res.json(wa.getQr());
  });

  // POST /disconnect -> cierra sesión, borra ./auth y vuelve a estado de QR.
  app.post("/disconnect", async (_req, res) => {
    await wa.disconnect();
    res.json({ ok: true });
  });

  // POST /send -> { to, text } -> { ok, externalMessageId }
  // TODO(B7): implementar el envío real con sock.sendMessage. Stub por ahora.
  app.post("/send", (_req, res) => {
    res.status(501).json({ ok: false, error: "not_implemented", todo: "B7: POST /send" });
  });

  return app;
}

export function startServer() {
  const app = createServer();
  app.listen(config.port, () => {
    console.log(`[wa] HTTP en http://localhost:${config.port} (x-internal-secret requerido)`);
  });
}
