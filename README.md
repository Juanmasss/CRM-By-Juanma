# CRM by Juanma

CRM propio para e-commerce en Colombia, estilo Kommo. Embudo Kanban de leads, contactos,
empresas, actividades, reportes, salesbot y chat de WhatsApp (vía Baileys, no la API oficial
de Meta). Respuestas automáticas de texto con la API de Perplexity (Sonar).

> Antes de tocar el repo, lee [`docs/CONTEXT.md`](docs/CONTEXT.md).

## Estructura

| Carpeta             | Stack                                              | Puerto |
| ------------------- | -------------------------------------------------- | ------ |
| `backend/`          | Express + TypeScript + Prisma (Postgres/Supabase)  | 4000   |
| `frontend/`         | React + Vite + TS, Tailwind + shadcn/ui            | 5173   |
| `whatsapp-service/` | Node + @whiskeysockets/baileys (WhatsApp Web)      | 4100   |

## Puesta en marcha

Cada paquete se instala y corre por separado. Copia las variables de entorno antes de arrancar.

```bash
# backend
cd backend && npm install && cp .env.example ../.env   # rellena los valores
npm run dev

# frontend
cd frontend && npm install && npm run dev

# whatsapp-service
cd whatsapp-service && npm install && npm run dev
```

> Los secretos viven en `.env` (no versionado). Nunca subas `.env` al repo.
