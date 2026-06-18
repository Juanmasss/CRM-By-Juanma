import OpenAI from "openai";

// Cliente OpenRouter (compatible con el SDK de OpenAI vía baseURL).
// Se construye perezosamente para que el dotenv del index.ts ya haya cargado el .env raíz
// (en ESM los imports se evalúan antes que el cuerpo de index.ts).
let client: OpenAI | null = null;

export function getOpenRouter(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Falta OPENROUTER_API_KEY");
  client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    // Cabeceras opcionales para el ranking de OpenRouter.
    defaultHeaders: {
      "HTTP-Referer": process.env.WEB_URL ?? "http://localhost:5173",
      "X-Title": "CRM by Juanma",
    },
  });
  return client;
}

export function openRouterModel(): string {
  return process.env.OPENROUTER_MODEL ?? "nex-agi/nex-n2-pro:free";
}
