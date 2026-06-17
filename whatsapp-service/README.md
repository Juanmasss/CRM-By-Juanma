# whatsapp-service

Proceso Node independiente que mantiene viva la conexión a **WhatsApp Web** mediante
[Baileys](https://baileys.wiki) (`@whiskeysockets/baileys`, 7.x estable o 6.7.22 legacy —
**nunca** < 6.7.22). No usa la API oficial de Meta: se conecta escaneando un QR como
WhatsApp Web. La sesión se persiste en `./auth/` (no versionado).

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
`BACKEND_INTERNAL_URL/api/internal/whatsapp/incoming` con
`{ from, pushName, text, externalMessageId, timestamp }` (header `x-internal-secret`).

## Desarrollo

```bash
npm install
npm run dev   # arranca el proceso en el puerto 4100
```

> La versión de Baileys se fija explícitamente (sin `latest`). Consultar siempre la doc
> oficial en baileys.wiki antes de implementar.
