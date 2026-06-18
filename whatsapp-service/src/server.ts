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

  // POST /connect -> el usuario pide vincular: abre la ventana de QR (5 min) y genera el código.
  app.post("/connect", async (_req, res) => {
    await wa.requestQr();
    res.json({ ok: true });
  });

  // POST /disconnect -> cierra sesión, borra ./auth y queda inactivo (no auto-genera QR).
  app.post("/disconnect", async (_req, res) => {
    await wa.disconnect();
    res.json({ ok: true });
  });

  // POST /send -> { to, text } -> { ok, externalMessageId }
  app.post("/send", async (req, res) => {
    const { to, text } = (req.body ?? {}) as { to?: unknown; text?: unknown };
    if (typeof to !== "string" || !to.trim() || typeof text !== "string" || !text) {
      return res.status(400).json({ ok: false, error: "bad_request", detail: "Se requieren { to, text }" });
    }
    try {
      const result = await wa.send(to, text);
      res.json(result);
    } catch (err) {
      console.warn("[wa] Error al enviar mensaje.", err);
      res.status(503).json({ ok: false, error: "send_failed" });
    }
  });

  return app;
}

export function startServer() {
  const app = createServer();
  app.listen(config.port, () => {
    console.log(`[wa] HTTP en http://localhost:${config.port} (x-internal-secret requerido)`);
  });
}
