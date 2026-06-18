import {
  BotSessionStatus,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
  SenderType,
  TaskType,
} from "@prisma/client";
import { z } from "zod";

import { actionSchema, graphSchema, type BotGraph } from "./botGraph.js";
import { prisma } from "./prisma.js";
import { sendViaService } from "./waService.js";

// ─────────────────────── Tipos auxiliares ───────────────────────

type Action = z.infer<typeof actionSchema>;
type Node = BotGraph["nodes"][number];
type Ctx = Record<string, unknown>;

// Tope de transiciones por invocación: evita bucles infinitos (condition/goto cíclicos).
const MAX_TRANSITIONS = 50;

// Nodos que detienen el avance a la espera de la próxima respuesta del cliente.
const WAITING_TYPES = new Set(["message", "list_message", "validation", "pause"]);

// Resultado de "alcanzar" un nodo durante el avance.
type Reach =
  | { kind: "next"; nodeId: string | null }
  | { kind: "wait" }
  | { kind: "stop" };

// ─────────────────────── Helpers de grafo ───────────────────────

function nodeById(graph: BotGraph, id: string | null | undefined): Node | undefined {
  if (!id) return undefined;
  return graph.nodes.find((n) => n.id === id);
}

function startNode(graph: BotGraph): Node | undefined {
  return graph.nodes.find((n) => n.type === "start_salesbot") ?? graph.nodes[0];
}

// Elige el destino de un nodo: primero por sourceHandle; si no hay, el edge sin handle (default).
function pickTarget(graph: BotGraph, nodeId: string, handle?: string | null): string | null {
  const edges = graph.edges.filter((e) => e.source === nodeId);
  if (handle != null) {
    const exact = edges.find((e) => e.sourceHandle === handle);
    if (exact) return exact.target;
  }
  const def = edges.find((e) => e.sourceHandle == null || e.sourceHandle === "");
  if (def) return def.target;
  return edges[0]?.target ?? null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// Opciones de un nodo (botones de message o filas de list_message), normalizadas a {id,title}.
type Option = { id: string; title: string };
function readOptions(data: Record<string, unknown>): Option[] {
  const raw: unknown[] = Array.isArray(data.buttons)
    ? data.buttons
    : Array.isArray(data.options)
      ? data.options
      : Array.isArray(data.rows)
        ? data.rows
        : Array.isArray(data.sections)
          ? data.sections.flatMap((s) =>
              s && typeof s === "object" && Array.isArray((s as { rows?: unknown[] }).rows)
                ? ((s as { rows: unknown[] }).rows as unknown[])
                : [],
            )
          : [];
  return raw
    .map((o, i) => {
      if (o && typeof o === "object") {
        const obj = o as Record<string, unknown>;
        const title = str(obj.title) ?? str(obj.label) ?? str(obj.text);
        if (title) return { id: str(obj.id) ?? String(i), title };
      }
      if (typeof o === "string") return { id: String(i), title: o };
      return null;
    })
    .filter((o): o is Option => o !== null);
}

// Empareja la respuesta del cliente con una opción: por número (1-based), id o título.
function matchOption(options: Option[], reply: string | null | undefined): Option | undefined {
  const text = (reply ?? "").trim();
  if (!text) return undefined;
  const asNum = Number(text);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= options.length) return options[asNum - 1];
  const low = text.toLowerCase();
  return (
    options.find((o) => o.id.toLowerCase() === low) ??
    options.find((o) => o.title.toLowerCase() === low) ??
    options.find((o) => o.title.toLowerCase().includes(low) || low.includes(o.title.toLowerCase()))
  );
}

function renderWithOptions(text: string, options: Option[]): string {
  if (options.length === 0) return text;
  const list = options.map((o, i) => `${i + 1}. ${o.title}`).join("\n");
  return `${text}\n\n${list}`;
}

// ─────────────────────── Envío + persistencia de mensajes del bot ───────────────────────

async function sendBotMessage(
  conversation: { id: string; externalThreadId: string | null },
  botName: string,
  text: string,
): Promise<void> {
  let externalMessageId: string | undefined;
  if (conversation.externalThreadId) {
    try {
      externalMessageId = await sendViaService({ to: conversation.externalThreadId, text });
    } catch (err) {
      console.error("[bot] No se pudo enviar el mensaje por WhatsApp:", err);
    }
  }
  const now = new Date();
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.outbound,
      senderType: SenderType.bot,
      senderName: botName || "Bot",
      body: text,
      externalMessageId: externalMessageId ?? null,
      status: externalMessageId ? MessageStatus.sent : MessageStatus.failed,
      createdAt: now,
    },
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
}

// ─────────────────────── Acciones (nodo actions) ───────────────────────

async function resolveTagId(nameOrId: string): Promise<string> {
  const byId = await prisma.tag.findUnique({ where: { id: nameOrId } });
  if (byId) return byId.id;
  const byName = await prisma.tag.findUnique({ where: { name: nameOrId } });
  if (byName) return byName.id;
  const created = await prisma.tag.create({ data: { name: nameOrId } });
  return created.id;
}

async function executeAction(
  action: Action,
  scope: {
    leadId: string;
    contactId: string | null;
    conversationId: string;
    context: Ctx;
  },
): Promise<void> {
  const { leadId, contactId, conversationId } = scope;

  switch (action.type) {
    case "manage_tags": {
      for (const t of action.add) {
        const tagId = await resolveTagId(t);
        await prisma.leadTag.upsert({
          where: { leadId_tagId: { leadId, tagId } },
          update: {},
          create: { leadId, tagId },
        });
      }
      for (const t of action.remove) {
        const tag =
          (await prisma.tag.findUnique({ where: { id: t } })) ??
          (await prisma.tag.findUnique({ where: { name: t } }));
        if (tag) {
          await prisma.leadTag
            .delete({ where: { leadId_tagId: { leadId, tagId: tag.id } } })
            .catch(() => undefined);
        }
      }
      break;
    }
    case "add_note":
      await prisma.note.create({ data: { leadId, body: action.body } });
      break;
    case "add_task":
      await prisma.task.create({
        data: {
          leadId,
          type: action.taskType as TaskType,
          title: action.title,
          dueAt: new Date(Date.now() + action.dueInMinutes * 60_000),
          assignedToUserId: action.assignedToUserId ?? null,
        },
      });
      break;
    case "change_lead_stage": {
      const stage = await prisma.stage.findFirst({
        where: { id: action.stageId, pipelineId: action.pipelineId },
      });
      if (stage) {
        await prisma.lead.update({
          where: { id: leadId },
          data: { pipelineId: action.pipelineId, stageId: action.stageId },
        });
      } else {
        console.warn("[bot] change_lead_stage: la etapa no pertenece al pipeline; omito.");
      }
      break;
    }
    case "change_conv_stage":
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: action.status as ConversationStatus },
      });
      break;
    case "change_responsible":
      await prisma.lead.update({
        where: { id: leadId },
        data: { responsibleUserId: action.userId },
      });
      break;
    case "complete_task": {
      if (action.taskId) {
        await prisma.task
          .update({ where: { id: action.taskId }, data: { completedAt: new Date() } })
          .catch(() => undefined);
      } else {
        const latest = await prisma.task.findFirst({
          where: { leadId, completedAt: null },
          orderBy: { createdAt: "desc" },
        });
        if (latest) {
          await prisma.task.update({ where: { id: latest.id }, data: { completedAt: new Date() } });
        }
      }
      break;
    }
    case "create_lead":
      // Replica el contacto en otro pipeline SIN sacarlo del actual (nuevo lead independiente).
      await prisma.lead.create({
        data: {
          name: action.name,
          pipelineId: action.pipelineId,
          stageId: action.stageId,
          contactId: action.copyContact ? contactId : null,
          source: "salesbot",
        },
      });
      break;
    case "send_email":
      // TODO: integrar proveedor de email. Por ahora se registra como no-op.
      console.warn(`[bot] send_email (no-op): to=${action.to} subject=${action.subject}`);
      break;
    case "send_webhook":
      try {
        await fetch(action.url, {
          method: action.method,
          headers: { "content-type": "application/json" },
          body:
            action.method === "GET" ? undefined : JSON.stringify(action.payload ?? scope.context),
        });
      } catch (err) {
        console.error("[bot] send_webhook falló:", err);
      }
      break;
    case "set_field": {
      const def = await prisma.customFieldDefinition.findUnique({
        where: { entity_code: { entity: "lead", code: action.fieldCode } },
      });
      if (def) {
        await prisma.leadCustomFieldValue.upsert({
          where: { leadId_fieldId: { leadId, fieldId: def.id } },
          update: { value: action.value },
          create: { leadId, fieldId: def.id, value: action.value },
        });
      } else {
        console.warn(`[bot] set_field: no existe el campo '${action.fieldCode}'; omito.`);
      }
      break;
    }
    case "generate_form":
      // TODO: generación real de formulario. Guardamos los campos solicitados en el contexto.
      scope.context._form = action.fields;
      console.warn(`[bot] generate_form (no-op): ${action.fields.length} campos.`);
      break;
  }
}

// ─────────────────────── Evaluación de condition/validation ───────────────────────

function evalCondition(data: Record<string, unknown>, ctx: Ctx, lastMessage: string | null): boolean {
  const source = str(data.source) ?? "lastMessage";
  const subject =
    source === "lastMessage" ? (lastMessage ?? "") : String(ctx[str(data.key) ?? ""] ?? "");
  const op = str(data.operator) ?? "contains";
  const value = str(data.value) ?? "";
  const a = subject.toLowerCase();
  const b = value.toLowerCase();
  switch (op) {
    case "equals":
      return a === b;
    case "not_equals":
      return a !== b;
    case "contains":
      return a.includes(b);
    case "exists":
      return subject.trim().length > 0;
    case "empty":
      return subject.trim().length === 0;
    default:
      return false;
  }
}

function evalValidation(data: Record<string, unknown>, value: string): boolean {
  const rule = str(data.rule) ?? "nonempty";
  const v = value.trim();
  switch (rule) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    case "phone":
      return /^\+?\d[\d\s-]{6,}$/.test(v);
    case "number":
      return v.length > 0 && !Number.isNaN(Number(v));
    case "regex": {
      const pattern = str(data.pattern);
      if (!pattern) return v.length > 0;
      try {
        return new RegExp(pattern).test(v);
      } catch {
        return false;
      }
    }
    case "nonempty":
    default:
      return v.length > 0;
  }
}

// ─────────────────────── Núcleo del motor ───────────────────────

interface RunArgs {
  bot: { id: string; name: string; flow: { graph: Prisma.JsonValue } | null };
  conversation: { id: string; externalThreadId: string | null; contactId: string | null };
  lead: { id: string };
  incomingMessage: { body: string | null };
}

export async function runBotForMessage({
  bot,
  conversation,
  lead,
  incomingMessage,
}: RunArgs): Promise<void> {
  try {
    if (!bot.flow) {
      console.warn(`[bot] El bot ${bot.id} no tiene flujo configurado.`);
      return;
    }
    const parsed = graphSchema.safeParse(bot.flow.graph);
    if (!parsed.success) {
      console.error(`[bot] Grafo inválido del bot ${bot.id}:`, parsed.error.issues);
      return;
    }
    const graph = parsed.data;
    const start = startNode(graph);
    if (!start) return;

    // ── Sesión: reutiliza la activa o crea una nueva (cuenta launch). ──
    let session = await prisma.botSession.findFirst({
      where: { conversationId: conversation.id, botId: bot.id, status: BotSessionStatus.active },
      orderBy: { updatedAt: "desc" },
    });
    let isNew = false;
    if (!session) {
      session = await prisma.botSession.create({
        data: {
          botId: bot.id,
          leadId: lead.id,
          conversationId: conversation.id,
          currentNodeId: start.id,
          context: {},
          status: BotSessionStatus.active,
        },
      });
      isNew = true;
      await prisma.bot.update({
        where: { id: bot.id },
        data: { launches: { increment: 1 }, activeSessions: { increment: 1 } },
      });
    }

    const context: Ctx = (session.context as Ctx) ?? {};
    context._lastMessage = incomingMessage.body ?? "";

    const scope = {
      leadId: lead.id,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      context,
    };

    // ── Punto de partida ──
    let currentId: string | null = session.currentNodeId ?? start.id;

    // Si retomamos en un nodo que esperaba respuesta, procesamos la respuesta y saltamos a su rama.
    if (!isNew) {
      const node = nodeById(graph, currentId);
      if (node && WAITING_TYPES.has(node.type)) {
        currentId = resumeWaitingNode(graph, node, incomingMessage.body ?? "", context);
      }
    }

    // ── Bucle de avance ──
    let transitions = 0;
    let ended = false;
    while (currentId && transitions++ < MAX_TRANSITIONS) {
      const node = nodeById(graph, currentId);
      if (!node) break;
      const result = await reachNode(graph, node, bot, conversation, scope, incomingMessage.body ?? "");
      if (result.kind === "stop") {
        ended = true;
        break;
      }
      if (result.kind === "wait") {
        await prisma.botSession.update({
          where: { id: session.id },
          data: { currentNodeId: node.id, context: context as Prisma.InputJsonValue },
        });
        return;
      }
      currentId = result.nodeId;
    }

    // Sin más nodos (o stop, o se agotó el tope) -> sesión completada.
    await completeSession(session.id, bot.id, context, ended || !currentId);
  } catch (err) {
    // Nunca propagamos ni reintentamos en bucle.
    console.error("[bot] Error ejecutando el flujo:", err);
  }
}

// Procesa la respuesta del cliente en un nodo que estaba esperando; devuelve el siguiente nodo.
function resumeWaitingNode(graph: BotGraph, node: Node, reply: string, ctx: Ctx): string | null {
  const data = node.data as Record<string, unknown>;
  switch (node.type) {
    case "message":
    case "list_message": {
      const options = readOptions(data);
      if (options.length === 0) return pickTarget(graph, node.id, null);
      const chosen = matchOption(options, reply);
      if (chosen) ctx[str(data.saveAs) ?? "_lastChoice"] = chosen.id;
      return pickTarget(graph, node.id, chosen?.id ?? null);
    }
    case "validation": {
      const ok = evalValidation(data, reply);
      if (ok && str(data.saveAs)) ctx[str(data.saveAs) as string] = reply.trim();
      return pickTarget(graph, node.id, ok ? "valid" : "invalid");
    }
    case "pause":
    default:
      return pickTarget(graph, node.id, null);
  }
}

// Ejecuta un nodo durante el avance. Para nodos de espera, realiza su "pregunta" y devuelve wait.
async function reachNode(
  graph: BotGraph,
  node: Node,
  bot: { id: string; name: string },
  conversation: { id: string; externalThreadId: string | null; contactId: string | null },
  scope: { leadId: string; contactId: string | null; conversationId: string; context: Ctx },
  lastMessage: string,
): Promise<Reach> {
  const data = node.data as Record<string, unknown>;

  switch (node.type) {
    case "start_salesbot":
      return { kind: "next", nodeId: pickTarget(graph, node.id, null) };

    case "message": {
      const text = str(data.text) ?? "";
      const options = readOptions(data);
      if (text || options.length > 0) {
        await sendBotMessage(conversation, bot.name, renderWithOptions(text, options));
      }
      // Con opciones espera la elección; sin opciones continúa.
      if (options.length > 0) return { kind: "wait" };
      return { kind: "next", nodeId: pickTarget(graph, node.id, null) };
    }

    case "list_message": {
      const text = str(data.text) ?? "";
      const options = readOptions(data);
      await sendBotMessage(conversation, bot.name, renderWithOptions(text, options));
      return { kind: "wait" };
    }

    case "validation":
    case "pause":
      // Se detiene a esperar la próxima respuesta del cliente.
      return { kind: "wait" };

    case "condition": {
      const truthy = evalCondition(data, scope.context, lastMessage);
      return { kind: "next", nodeId: pickTarget(graph, node.id, truthy ? "true" : "false") };
    }

    case "actions": {
      const actions = z.array(actionSchema).safeParse(data.actions);
      if (actions.success) {
        for (const action of actions.data) {
          await executeAction(action, scope);
        }
      } else {
        console.warn("[bot] Nodo actions con data.actions inválido; omito.");
      }
      return { kind: "next", nodeId: pickTarget(graph, node.id, null) };
    }

    case "goto":
      return { kind: "next", nodeId: str(data.targetNodeId) ?? pickTarget(graph, node.id, null) };

    case "stop":
      return { kind: "stop" };

    // Nodos aún no implementados: se comportan como paso a través.
    case "reaction":
    case "comment":
    case "internal_message":
    case "subscribe_meta":
    case "custom_code":
    case "widget":
    case "round_robin":
    default:
      return { kind: "next", nodeId: pickTarget(graph, node.id, null) };
  }
}

async function completeSession(
  sessionId: string,
  botId: string,
  context: Ctx,
  reachedStop: boolean,
): Promise<void> {
  await prisma.botSession.update({
    where: { id: sessionId },
    data: {
      status: reachedStop ? BotSessionStatus.completed : BotSessionStatus.abandoned,
      context: context as Prisma.InputJsonValue,
    },
  });
  await prisma.bot.update({
    where: { id: botId },
    data: { activeSessions: { decrement: 1 } },
  });
  // conversion_rate = sesiones completadas / lanzamientos.
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (bot) {
    const completed = await prisma.botSession.count({
      where: { botId, status: BotSessionStatus.completed },
    });
    const rate = bot.launches > 0 ? completed / bot.launches : 0;
    await prisma.bot.update({ where: { id: botId }, data: { conversionRate: rate } });
  }
}

// ─────────────────────── Resolución de disparadores ───────────────────────

function triggerMatches(
  bot: { triggerType: string | null; triggerConfig: Prisma.JsonValue },
  text: string | null,
): boolean {
  const t = bot.triggerType;
  if (!t || t === "manual" || t === "any" || t === "first_message") return true;
  if (t === "keyword") {
    const cfg = (bot.triggerConfig ?? {}) as { keywords?: unknown };
    const kws = Array.isArray(cfg.keywords) ? (cfg.keywords as unknown[]) : [];
    if (kws.length === 0) return true;
    const low = (text ?? "").toLowerCase();
    return kws.some((k) => typeof k === "string" && low.includes(k.toLowerCase()));
  }
  return true;
}

// Gancho desde POST /api/internal/whatsapp/incoming cuando conversation.mode === 'bot'.
export async function runBotForConversation({
  conversationId,
}: {
  conversationId: string;
}): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.mode !== "bot" || !conversation.leadId) return;

    const last = await prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });
    // Salvaguarda anti-bucle: sólo reaccionamos a mensajes del contacto.
    if (!last || last.senderType !== SenderType.contact) return;

    // Bot a usar: el de la sesión activa, o el primer bot activo cuyo disparador coincida.
    const active = await prisma.botSession.findFirst({
      where: { conversationId, status: BotSessionStatus.active },
      orderBy: { updatedAt: "desc" },
    });

    let bot = active
      ? await prisma.bot.findUnique({ where: { id: active.botId }, include: { flow: true } })
      : null;

    if (!bot) {
      const candidates = await prisma.bot.findMany({
        where: { status: "active" },
        include: { flow: true },
        orderBy: { createdAt: "asc" },
      });
      bot = candidates.find((b) => b.flow && triggerMatches(b, last.body)) ?? null;
    }
    if (!bot) return;

    await runBotForMessage({
      bot,
      conversation: {
        id: conversation.id,
        externalThreadId: conversation.externalThreadId,
        contactId: conversation.contactId,
      },
      lead: { id: conversation.leadId },
      incomingMessage: { body: last.body },
    });
  } catch (err) {
    console.error("[bot] Error en runBotForConversation:", err);
  }
}
