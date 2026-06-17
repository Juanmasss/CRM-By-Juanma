# CONTEXTO MAESTRO — CRM by Juanma (DOS agentes en paralelo)

Trabajas junto a OTRO agente de IA en el mismo repo, al mismo tiempo. Para no pisarse,
respeta estrictamente la división de carpetas y el contrato de API. Si algo no está aquí,
PREGUNTA antes de inventar.

## Producto
"CRM by Juanma": CRM propio para e-commerce en Colombia, estilo Kommo. Gestiona leads en un
embudo Kanban, contactos, empresas, actividades, reportes, un salesbot tipo Kommo y el chat
de WhatsApp. La mensajería usa Baileys (WhatsApp Web por QR), NO la API oficial de Meta.
Las respuestas automáticas de texto usan la API de Perplexity (Sonar). NO uses la marca "Flux"
en ningún lado.

## Stack fijo (no cambiar)
- frontend/ : React + Vite + TypeScript, Tailwind + shadcn/ui (tema oscuro, acento violeta),
              TanStack Query, React Router, recharts, dnd-kit, @xyflow/react.
- backend/  : Express + TypeScript + Prisma ORM. Postgres en Supabase. Es el cerebro.
- whatsapp-service/ : proceso Node con @whiskeysockets/baileys (7.x estable o 6.7.22 legacy;
              NUNCA < 6.7.22). Mantiene viva la conexión WA Web. Puerto 4100.
- Modo IA: Perplexity (openai SDK con baseURL=PERPLEXITY_BASE_URL, modelo PERPLEXITY_MODEL).
- Secretos SIEMPRE en .env. Si necesitas una variable nueva, decláralo en el commit.

## Dueños de carpetas (regla anti-conflicto)
- OPUS: backend/ y whatsapp-service/. CODEX: frontend/.
- Nadie edita la carpeta del otro. Si necesitas un cambio allí, déjalo como TODO comentado
  y descríbelo en el mensaje de commit.

## Modelo de datos (Prisma = única fuente de verdad)
Tablas: users, pipelines, stages, companies, contacts, leads, tags, lead_tags,
custom_field_definitions, lead_custom_field_values, channels, conversations, messages,
notes, tasks, bots, bot_flows, bot_sessions.
Claves de mensajería:
- channels.type: 'whatsapp'|'instagram'|'facebook'|'tiktok' (por ahora solo whatsapp activo).
- conversations: { id, lead_id, contact_id, channel_id, external_thread_id (wa jid),
  status 'open'|'closed', mode 'bot'|'ai'|'human', last_message_at }.
  -> bot = salesbot de flujo; ai = asistente Perplexity; human = la persona responde.
- messages: { id, conversation_id, direction 'inbound'|'outbound',
  sender_type 'contact'|'agent'|'bot', sender_name, body, message_type, media_url,
  external_message_id, status 'sent'|'delivered'|'read'|'failed', created_at }.
  -> contact = cliente; agent = humano del CRM; bot = respuesta automática. Diferéncialos SIEMPRE.

## Contrato de API (ambos agentes lo respetan al pie de la letra)

### whatsapp-service (4100) — lo construye OPUS. Todo exige header x-internal-secret.
- GET  /status   -> { connected, phoneNumber }
- GET  /qr       -> { connected, qrPng }   // qrPng = PNG Data URL o null si ya conectado
- POST /send     -> { to, text } -> { ok, externalMessageId }
- POST /disconnect -> borra ./auth y cierra sesión -> { ok }
- Al recibir un mensaje entrante, hace POST a BACKEND_INTERNAL_URL/api/internal/whatsapp/incoming
  con { from, pushName, text, externalMessageId, timestamp } (header x-internal-secret).

### backend (4000)
Internos (exigen x-internal-secret):
- POST /api/internal/whatsapp/incoming -> crea/identifica contact, lead, conversation y guarda
  el message (sender_type='contact'); luego, según conversation.mode, dispara bot o IA.
Públicos (frontend):
- GET   /api/pipelines | POST | PATCH/:id | DELETE/:id
- POST  /api/pipelines/:id/stages | PATCH /api/stages/:id | DELETE /api/stages/:id
- PATCH /api/pipelines/:id/stages/reorder  (array {stageId, position})
- GET   /api/leads?pipelineId=&stageId=&channel=&search= | GET /api/leads/:id | POST | PATCH/:id | DELETE/:id
- PATCH /api/leads/:id/custom-fields | POST/DELETE /api/leads/:id/tags
- CRUD /api/contacts, /api/companies, /api/tasks
- GET   /api/dashboard | GET /api/reports?from=&to=&pipelineId=
- GET   /api/bots | GET /api/bots/:id | POST | PATCH/:id | DELETE/:id | PUT /api/bots/:id/flow
- GET   /api/whatsapp/connection (proxy de /status+/qr) | POST /api/whatsapp/disconnect
- GET   /api/conversations | GET /api/conversations/:id/messages
- POST  /api/conversations/:id/messages ({ body }: agente humano; sender_type='agent' + /send)
- PATCH /api/conversations/:id/mode ({ mode: 'bot'|'ai'|'human' })
- DELETE /api/conversations/:id

## Convenciones
- TypeScript estricto. Código en inglés; UI en español.
- Antes de codificar, da en 3-5 líneas el plan de archivos a tocar.
- Un commit por tarea: "feat(scope): ...". No uses "latest" en dependencias críticas (sobre
  todo Baileys: fija versión). Para Baileys, básate en la doc oficial (baileys.wiki), no de memoria.
