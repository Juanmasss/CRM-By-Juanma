# whatsapp-service

Proceso Node independiente que mantiene viva la conexión a **WhatsApp Web** mediante
[Baileys](https://baileys.wiki) (`@whiskeysockets/baileys`, 7.x estable o 6.7.22 legacy —
**nunca** < 6.7.22; aquí fijado a `6.7.23`). No usa la API oficial de Meta: se conecta
escaneando un QR como WhatsApp Web. La sesión se persiste en `./auth/` (no versionado).

- **Puerto:** `4100`
- **Autenticación entre servicios:** todas las rutas exigen el header `x-internal-secret`
  (valor = `INTERNAL_API_SECRET` del `.env` raíz).

## Contrato HTTP

| Método | Ruta          | Respuesta                                                        |
| ------ | ------------- | --------------------------------------------------------------- |
| GET    | `/status`     | `{ connected, phoneNumber }`                                    |
| GET    | `/qr`         | `{ connected, qrPng }` — `qrPng` = PNG Data URL o `null`         |
| POST   | `/send`       | body `{ to, text }` → `{ ok, externalMessageId }`               |
| POST   | `/disconnect` | borra `./auth` y cierra sesión → `{ ok }`                       |

Al recibir un mensaje entrante hace `POST` a
`BACKEND_INTERNAL_URL/api/internal/whatsapp/incoming` (header `x-internal-secret`) con:

```jsonc
{
  "from": "573001112233@s.whatsapp.net",
  "pushName": "Juan",
  "text": "hola",          // texto real o caption de la media; puede ser null
  "messageType": "text",   // text | image | audio | video | file
  "externalMessageId": "ABCD1234",
  "timestamp": 1718600000  // unix en segundos
}
```

## Reconexión robusta (backoff exponencial)

La conexión a WhatsApp Web se cae a menudo (red, reinicios de Meta, sesión movida a otro
dispositivo). El servicio reacciona al evento `connection.update`:

- **Cierre normal** (no logout): reintenta con **backoff exponencial** — 1s, 2s, 4s, 8s… con
  tope de **30s**. Un único `reconnectTimer` actúa de guarda anti-doble-reintento.
- **`loggedOut`** (sesión cerrada desde el teléfono): las credenciales ya no sirven, así que se
  **borra `./auth`** y se reconecta para emitir un **QR nuevo**.
- **Conexión abierta** (`open`): se **reinicia el contador** de backoff a 0.
- Cada socket lleva su `generation`; los handlers de un socket reemplazado se ignoran, evitando
  reconexiones duplicadas al recrearlo.

`POST /disconnect` hace `logout()`, cierra el socket, borra `./auth`, pone `connected=false` y
reconstruye el socket (que, sin credenciales, generará un QR nuevo).

## Tipos de mensaje (texto + media)

`classifyMessage()` clasifica cada entrante en `{ messageType, text }`:

| Entrante WhatsApp                         | `messageType` | `text`                          |
| ----------------------------------------- | ------------- | ------------------------------- |
| `conversation` / `extendedTextMessage`    | `text`        | el texto                        |
| `imageMessage`                            | `image`       | caption o `null`                |
| `stickerMessage`                          | `image`       | `null`                          |
| `videoMessage`                            | `video`       | caption o `null`                |
| `audioMessage` (incl. notas de voz)       | `audio`       | `null`                          |
| `documentMessage`                         | `file`        | caption / nombre de archivo     |
| reacciones, ubicación, contacto, encuesta | —             | se ignoran (sin romper el chat) |

Desenvuelve envoltorios habituales (efímeros, ver-una-vez, documento con caption). El backend,
si no llega caption, guarda un **placeholder** según el tipo (`[imagen]`, `[audio]`, `[video]`,
`[archivo]`) junto con `message_type`, de modo que el chat no se rompe.

> **TODO (descarga de media):** todavía **no descargamos el binario**. Falta usar
> `downloadMediaMessage` de Baileys, subir el archivo (p. ej. a Supabase Storage) y rellenar
> `media_url` del mensaje. Hoy sólo persistimos tipo + caption/placeholder.

## Idempotencia

Baileys puede reentregar el mismo mensaje (reconexiones, sincronización de historial). El backend
(`POST /api/internal/whatsapp/incoming`) busca un mensaje **entrante** previo con el mismo
`externalMessageId` y, si existe, responde `200 { deduped: true }` **sin** duplicar ni redisparar
bot/IA. Así una doble entrega no genera mensajes ni respuestas repetidas.

## Desarrollo

```bash
npm install
npm run dev   # arranca el proceso en el puerto 4100 (tsx watch)
# o, sin watch (como en el orquestador raíz):
npm run start:bot
```

Desde la **raíz del repo** se levantan los tres procesos a la vez (ver `package.json` raíz):

```bash
npm run install:all   # instala raíz + whatsapp-service + backend + frontend
npm run dev           # concurrently: bot (4100) + backend (4000) + frontend (5173)
```

> La versión de Baileys se fija explícitamente (sin `latest`). Consultar siempre la doc
> oficial en baileys.wiki antes de implementar.

## Prueba E2E (teléfono real)

Requiere un teléfono real con WhatsApp; **no se puede automatizar** (depende de escanear un QR).
Con los tres procesos arriba (`npm run dev` en la raíz):

1. **Conectar QR:** abre el dashboard → pantalla de conexión muestra el QR (`GET /qr`). Escanéalo
   desde *WhatsApp → Dispositivos vinculados*. Al vincular, `GET /status` pasa a
   `connected:true` con tu `phoneNumber`.
2. **El cliente escribe:** desde otro teléfono envía un mensaje al número vinculado. En ≤2s
   aparece en la bandeja del dashboard (polling, ver abajo). Prueba también enviar una **imagen**:
   debe mostrarse el placeholder `[imagen]` sin romper el chat.
3. **Bot / IA responde:** pon la conversación en modo **Bot** o **IA** y vuelve a escribir desde el
   cliente; debe llegar la respuesta automática al teléfono del cliente.
4. **Cambias a Humano:** togglea la conversación a **Humano** y responde **desde el dashboard**;
   el mensaje sale por `POST /send` y llega al teléfono del cliente (`sender_type='agent'`).
5. **Idempotencia:** fuerza una reconexión (apaga/enciende el Wi-Fi del teléfono o reinicia el
   servicio) — los mensajes ya recibidos **no se duplican** en la bandeja.
6. **Borrar conversación:** elimínala desde el dashboard (`DELETE /api/conversations/:id`).
7. **Desconectar número:** pulsa desconectar (`POST /disconnect`); `./auth` se borra y vuelve a
   aparecer un QR nuevo.

## Tiempo real en el frontend (polling → Supabase Realtime)

Hoy el frontend ve los mensajes nuevos por **polling con TanStack Query** (`refetchInterval: 2000`
en `ChatInbox`), lo que cumple el requisito de **≤2s**. Para eliminar el polling y pasar a
**Supabase Realtime** (push) cuando se quiera:

1. En Supabase, habilitar Realtime para la tabla `messages` (y `conversations` si quieres reordenar
   la bandeja en vivo): `ALTER PUBLICATION supabase_realtime ADD TABLE messages, conversations;`.
2. En el **frontend**, suscribirse con `supabase.channel(...).on('postgres_changes', { event:
   'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.<id>' }, ...)` e
   invalidar/empujar a la query de mensajes en el callback; quitar el `refetchInterval`.
3. Como las escrituras pasan por el **backend** (no por el cliente), Realtime sólo necesita permiso
   de lectura; revisar las **RLS** para que el `anon`/`authenticated` pueda leer pero no escribir
   directamente, manteniendo el backend como única vía de escritura.

> Nota de propiedad de carpetas: la suscripción Realtime vive en `frontend/` (dueño: CODEX). Este
> servicio y el backend ya dejan los datos listos; el cambio en el cliente es el paso 2.
