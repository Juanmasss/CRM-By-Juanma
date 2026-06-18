import { z } from "zod";

// ─────────────────────── Tipos de nodo del salesbot ───────────────────────
// Formato documentado en docs/bot-flow-graph.md. El grafo vive en bot_flows.graph (JSON).

export const NODE_TYPES = [
  "message",
  "reaction",
  "comment",
  "internal_message",
  "list_message",
  "pause",
  "subscribe_meta",
  "actions",
  "condition",
  "validation",
  "goto",
  "start_salesbot",
  "custom_code",
  "widget",
  "round_robin",
  "stop",
] as const;

const taskTypeEnum = z.enum(["task", "call", "email", "meeting", "whatsapp"]);
const httpMethodEnum = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

// ─────────────────────── Acciones (nodo type="actions") ───────────────────────
// data.actions[] es una unión discriminada por `type`.

const manageTags = z.object({
  type: z.literal("manage_tags"),
  add: z.array(z.string()).default([]),
  remove: z.array(z.string()).default([]),
});

const addNote = z.object({
  type: z.literal("add_note"),
  body: z.string().min(1),
});

const addTask = z.object({
  type: z.literal("add_task"),
  taskType: taskTypeEnum.default("task"),
  title: z.string().min(1),
  dueInMinutes: z.number().int().nonnegative(),
  assignedToUserId: z.string().nullable().optional(),
});

const changeLeadStage = z.object({
  type: z.literal("change_lead_stage"),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
});

const changeConvStage = z.object({
  type: z.literal("change_conv_stage"),
  status: z.enum(["open", "closed"]),
});

const changeResponsible = z.object({
  type: z.literal("change_responsible"),
  userId: z.string().min(1),
});

const completeTask = z
  .object({
    type: z.literal("complete_task"),
    taskId: z.string().optional(),
    latest: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.taskId) || v.latest === true, {
    message: "complete_task requiere taskId o latest:true",
  });

const createLead = z.object({
  type: z.literal("create_lead"),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  name: z.string().min(1),
  copyContact: z.boolean().default(true),
});

const sendEmail = z.object({
  type: z.literal("send_email"),
  to: z.string().min(1),
  subject: z.string(),
  body: z.string(),
});

const sendWebhook = z.object({
  type: z.literal("send_webhook"),
  url: z.string().url(),
  method: httpMethodEnum.default("POST"),
  payload: z.unknown().optional(),
});

const setField = z.object({
  type: z.literal("set_field"),
  fieldCode: z.string().min(1),
  value: z.string().nullable(),
});

const formField = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
});

const generateForm = z.object({
  type: z.literal("generate_form"),
  fields: z.array(formField).min(1),
});

// union (no discriminatedUnion) porque complete_task usa .refine (ZodEffects).
export const actionSchema = z.union([
  manageTags,
  addNote,
  addTask,
  changeLeadStage,
  changeConvStage,
  changeResponsible,
  completeTask,
  createLead,
  sendEmail,
  sendWebhook,
  setField,
  generateForm,
]);

// ─────────────────────── Nodos y edges ───────────────────────

const positionSchema = z.object({ x: z.number(), y: z.number() });

const baseNode = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES),
  position: positionSchema,
  // data es libre por tipo; sólo "actions" se valida en profundidad (ver superRefine).
  data: z.record(z.unknown()).default({}),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});

export const graphSchema = z
  .object({
    nodes: z.array(baseNode).min(1, "El grafo debe tener al menos un nodo"),
    edges: z.array(edgeSchema).default([]),
  })
  .superRefine((graph, ctx) => {
    const ids = new Set<string>();
    graph.nodes.forEach((node, i) => {
      // IDs de nodo únicos.
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "id"],
          message: `ID de nodo duplicado: ${node.id}`,
        });
      }
      ids.add(node.id);

      // Validación profunda de las acciones.
      if (node.type === "actions") {
        const parsed = z.array(actionSchema).min(1).safeParse(node.data.actions);
        if (!parsed.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", i, "data", "actions"],
            message: "Lista de acciones inválida",
          });
        }
      }
    });

    // Los edges deben referenciar nodos existentes.
    graph.edges.forEach((edge, i) => {
      if (!ids.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "source"],
          message: `El edge referencia un nodo source inexistente: ${edge.source}`,
        });
      }
      if (!ids.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "target"],
          message: `El edge referencia un nodo target inexistente: ${edge.target}`,
        });
      }
    });
  });

export type BotGraph = z.infer<typeof graphSchema>;

// Grafo inicial mínimo: un único nodo de arranque.
export function initialGraph(): BotGraph {
  return {
    nodes: [{ id: "start", type: "start_salesbot", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  };
}
