import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";

// Secrets live in the repo-root .env (shared by all services).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PORT = Number(process.env.PORT ?? 4000);
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";

const app = express();

app.use(cors({ origin: WEB_URL, credentials: true }));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT} (CORS: ${WEB_URL})`);
});
