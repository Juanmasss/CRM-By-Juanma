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
