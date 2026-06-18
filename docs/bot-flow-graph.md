# Formato del grafo del salesbot (`bot_flows.graph`)

El flujo de un salesbot se guarda como JSON en la columna `bot_flows.graph`. Lo construye el
editor visual del frontend (`@xyflow/react`) y lo valida el backend con zod en
`PUT /api/bots/:id/flow` (schema: `backend/src/lib/botGraph.ts`).

## Estructura raíz

```jsonc
{
  "nodes": [ /* Node[] (mínimo 1) */ ],
  "edges": [ /* Edge[] */ ]
}
```

Reglas que valida el backend al guardar:
- Debe haber **al menos un nodo**.
- Los **IDs de nodo son únicos**.
- Cada edge debe referenciar nodos (`source`/`target`) que **existan** en `nodes`.
- En los nodos `type:"actions"`, `data.actions` debe ser una lista válida (ver abajo).

## Node

```jsonc
{
  "id": "n1",
  "type": "message",            // uno de los tipos de abajo
  "position": { "x": 0, "y": 0 },
  "data": { /* libre según el tipo */ }
}
```

### Tipos de nodo (`type`)

`message` · `reaction` · `comment` · `internal_message` · `list_message` · `pause` ·
`subscribe_meta` · `actions` · `condition` · `validation` · `goto` · `start_salesbot` ·
`custom_code` · `widget` · `round_robin` · `stop`

`data` es libre por tipo (el backend sólo valida en profundidad el tipo `actions`). El
significado de cada `data` lo definen el editor y el motor de ejecución del salesbot.

## Edge

```jsonc
{
  "id": "e1",
  "source": "n1",
  "target": "n2",
  "sourceHandle": "yes",   // opcional: rama de salida (p. ej. en condition/validation)
  "label": "Sí"           // opcional
}
```

## Nodo `actions`

`data.actions` es un **array** donde cada elemento se discrimina por su campo `type`:

| `type`              | Campos                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `manage_tags`       | `add: string[]`, `remove: string[]`                                    |
| `add_note`          | `body: string`                                                         |
| `add_task`          | `taskType: task\|call\|email\|meeting\|whatsapp`, `title: string`, `dueInMinutes: number`, `assignedToUserId?: string\|null` |
| `change_lead_stage` | `pipelineId: string`, `stageId: string`                                |
| `change_conv_stage` | `status: open\|closed`                                                 |
| `change_responsible`| `userId: string`                                                       |
| `complete_task`     | `taskId?: string` **o** `latest: true`                                 |
| `create_lead`       | `pipelineId: string`, `stageId: string`, `name: string`, `copyContact: boolean` |
| `send_email`        | `to: string`, `subject: string`, `body: string`                        |
| `send_webhook`      | `url: string`, `method: GET\|POST\|PUT\|PATCH\|DELETE`, `payload?: any` |
| `set_field`         | `fieldCode: string`, `value: string\|null`                             |
| `generate_form`     | `fields: { name, label, type, required? }[]`                           |

Ejemplo de nodo `actions`:

```jsonc
{
  "id": "a1",
  "type": "actions",
  "position": { "x": 240, "y": 120 },
  "data": {
    "actions": [
      { "type": "manage_tags", "add": ["interesado"], "remove": [] },
      { "type": "add_note", "body": "Lead creado por el salesbot" },
      { "type": "change_lead_stage", "pipelineId": "pl_1", "stageId": "st_2" }
    ]
  }
}
```

## Grafo inicial

`POST /api/bots` crea el bot con un grafo mínimo de un solo nodo de arranque:

```jsonc
{
  "nodes": [{ "id": "start", "type": "start_salesbot", "position": { "x": 0, "y": 0 }, "data": {} }],
  "edges": []
}
```

## Ejecución del flujo (motor del "modo bot")

El motor (`backend/src/lib/botEngine.ts`) recorre el grafo nodo a nodo siguiendo los `edges`
hasta llegar a un nodo que **espera respuesta** (`message` con opciones, `list_message`,
`validation`, `pause`) o a un `stop`. El estado se guarda en `bot_sessions`
(`current_node_id`, `context`).

> **Botones/listas como texto.** El `whatsapp-service` envía sólo texto y los mensajes
> interactivos nativos de WhatsApp vía Baileys son poco fiables. Por eso las opciones se
> renderizan como una lista numerada (`1. …`, `2. …`) y la respuesta del cliente se empareja por
> número, por `id` o por título.

### Convenciones de `data` que lee el motor

| Tipo            | `data` esperado                                                                                  | Ramas (`sourceHandle`) |
| --------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| `start_salesbot`| —                                                                                                | edge por defecto       |
| `message`       | `{ text, buttons?: [{id,title}] }` (también admite `options`)                                     | el `id` del botón elegido; sin botones, edge por defecto |
| `list_message`  | `{ text, rows?: [{id,title}] }` o `{ text, sections:[{rows:[{id,title}]}] }`                       | el `id` de la fila      |
| `condition`     | `{ source?: "lastMessage"\|"context", key?, operator: equals\|not_equals\|contains\|exists\|empty, value? }` | `"true"` / `"false"` |
| `validation`    | `{ rule: email\|phone\|number\|regex\|nonempty, pattern?, saveAs? }` (valida el siguiente mensaje) | `"valid"` / `"invalid"` |
| `pause`         | —                                                                                                | edge por defecto (al recibir respuesta) |
| `goto`          | `{ targetNodeId }` (o edge por defecto)                                                          | —                      |
| `actions`       | `{ actions: Action[] }` (ver tabla de acciones)                                                  | edge por defecto       |
| `stop`          | —                                                                                                | termina la sesión      |

`saveAs` (en `message`/`list_message`/`validation`) guarda el valor elegido/escrito en
`context[saveAs]`, accesible luego desde `condition` con `source:"context"`.

Los tipos `reaction`, `comment`, `internal_message`, `subscribe_meta`, `custom_code`, `widget` y
`round_robin` aún no tienen comportamiento propio: el motor los trata como paso a través.

### Disparadores (`bots.trigger_type` / `trigger_config`)

- `manual` / `first_message` / `any` / vacío → el bot puede arrancar con cualquier mensaje.
- `keyword` → arranca sólo si el texto entrante contiene alguna de `trigger_config.keywords[]`.

### Contadores

Al crear una sesión se incrementan `launches` y `active_sessions`. Al terminar (`stop`) se
decrementa `active_sessions`, la sesión queda `completed` y `conversion_rate` se recalcula como
`sesiones completadas / launches`.
