import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// El servicio carga su PROPIO .env (whatsapp-service/.env), no el raíz del repo.
const here = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(here, ".."); // src/ o dist/ -> raíz del servicio
dotenv.config({ path: path.resolve(serviceRoot, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[wa] Falta la variable de entorno ${name} en whatsapp-service/.env`);
    process.exit(1);
  }
  return value;
}

const rawAuthDir = process.env.WA_AUTH_DIR ?? "./auth";

export const config = {
  port: Number(process.env.WA_SERVICE_PORT ?? 4100),
  // Resuelto contra la raíz del servicio para ser estable sea cual sea el cwd.
  authDir: path.isAbsolute(rawAuthDir) ? rawAuthDir : path.resolve(serviceRoot, rawAuthDir),
  internalSecret: required("INTERNAL_API_SECRET"),
  backendInternalUrl: process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000",
};
