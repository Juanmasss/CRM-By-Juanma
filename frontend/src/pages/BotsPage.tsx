import "@xyflow/react/dist/style.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Bell,
  Bot,
  CheckCircle2,
  CircleStop,
  Code2,
  GitBranch,
  GripVertical,
  List,
  MessageCircle,
  MousePointer2,
  Pause,
  Plus,
  Route,
  Save,
  Send,
  Shuffle,
  Smile,
  StickyNote,
  Workflow,
} from "lucide-react";
import { type DragEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createBot,
  getBot,
  getBots,
  saveBotFlow,
  type BotFlowEdge,
  type BotFlowGraph,
  type BotFlowNode,
  type BotNodeType,
  type BotSummary,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type FlowNodeData = Record<string, unknown> & {
  nodeType: BotNodeType;
  label?: string;
  text?: string;
  buttons?: BotButton[];
  actions?: BotAction[];
};

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge;

interface BotButton {
  id: string;
  title: string;
}

type BotAction =
  | { type: "manage_tags"; add: string[]; remove: string[] }
  | { type: "add_note"; body: string }
  | { type: "add_task"; taskType: "task" | "call" | "email" | "meeting" | "whatsapp"; title: string; dueInMinutes: number; assignedToUserId?: string | null }
  | { type: "change_lead_stage"; pipelineId: string; stageId: string }
  | { type: "change_conv_stage"; status: "open" | "closed" }
  | { type: "change_responsible"; userId: string }
  | { type: "complete_task"; taskId?: string; latest?: true }
  | { type: "create_lead"; pipelineId: string; stageId: string; name: string; copyContact: boolean }
  | { type: "send_email"; to: string; subject: string; body: string }
  | { type: "send_webhook"; url: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; payload?: unknown }
  | { type: "set_field"; fieldCode: string; value: string | null }
  | { type: "generate_form"; fields: Array<{ name: string; label: string; type: string; required?: boolean }> };

const NODE_CATALOG: Array<{
  type: BotNodeType;
  label: string;
  color: string;
  icon: ReactNode;
}> = [
  { type: "message", label: "Mensaje", color: "#22c55e", icon: <MessageCircle className="h-4 w-4" /> },
  { type: "reaction", label: "Reacción", color: "#f59e0b", icon: <Smile className="h-4 w-4" /> },
  { type: "comment", label: "Comentario", color: "#38bdf8", icon: <StickyNote className="h-4 w-4" /> },
  { type: "internal_message", label: "Enviar mensaje interno", color: "#a855f7", icon: <Send className="h-4 w-4" /> },
  { type: "list_message", label: "List Message (WhatsApp)", color: "#14b8a6", icon: <List className="h-4 w-4" /> },
  { type: "pause", label: "Pausa", color: "#64748b", icon: <Pause className="h-4 w-4" /> },
  { type: "subscribe_meta", label: "Suscribirse (Meta)", color: "#0ea5e9", icon: <Bell className="h-4 w-4" /> },
  { type: "actions", label: "Acciones", color: "#ef4444", icon: <Workflow className="h-4 w-4" /> },
  { type: "condition", label: "Condición", color: "#eab308", icon: <GitBranch className="h-4 w-4" /> },
  { type: "validation", label: "Validación", color: "#84cc16", icon: <CheckCircle2 className="h-4 w-4" /> },
  { type: "goto", label: "Ir a otro paso", color: "#f97316", icon: <Route className="h-4 w-4" /> },
  { type: "start_salesbot", label: "Iniciar Salesbot", color: "#8b5cf6", icon: <Bot className="h-4 w-4" /> },
  { type: "custom_code", label: "Paso personalizado (código)", color: "#06b6d4", icon: <Code2 className="h-4 w-4" /> },
  { type: "widget", label: "Widgets", color: "#ec4899", icon: <MousePointer2 className="h-4 w-4" /> },
  { type: "round_robin", label: "Round Robin", color: "#10b981", icon: <Shuffle className="h-4 w-4" /> },
  { type: "stop", label: "Parar Salesbot", color: "#f43f5e", icon: <CircleStop className="h-4 w-4" /> },
];

const ACTION_LABELS: Record<BotAction["type"], string> = {
  manage_tags: "Administrar etiquetas",
  add_note: "Agregar nota",
  add_task: "Agregar tarea",
  change_lead_stage: "Cambiar etapa del lead",
  change_conv_stage: "Cambiar etapa de la conversación",
  change_responsible: "Cambiar usuario responsable",
  complete_task: "Completar tarea",
  create_lead: "Crear lead",
  send_email: "Enviar correo",
  send_webhook: "Enviar un webhook",
  set_field: "Establecer campo",
  generate_form: "Generar formulario",
};

const nodeTypes = Object.fromEntries(NODE_CATALOG.map((item) => [item.type, FlowNodeCard]));

function getNodeMeta(type: BotNodeType) {
  return NODE_CATALOG.find((item) => item.type === type) ?? NODE_CATALOG[0];
}

function getTriggerLabel(bot: BotSummary) {
  const trigger = bot.triggerType ?? bot.trigger_type ?? "manual";
  const config = (bot.triggerConfig ?? bot.trigger_config) as { keywords?: string[] } | null | undefined;
  if (trigger === "keyword" && config?.keywords?.length) {
    return `Keyword: ${config.keywords.join(", ")}`;
  }
  const labels: Record<string, string> = {
    manual: "Manual",
    first_message: "Primer mensaje",
    any: "Cualquier mensaje",
  };
  return labels[trigger] ?? trigger;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentValue(value: number | string | null | undefined) {
  const parsed = numberValue(value);
  return `${parsed > 1 ? parsed.toFixed(0) : (parsed * 100).toFixed(0)}%`;
}

function defaultData(type: BotNodeType): FlowNodeData {
  const meta = getNodeMeta(type);
  const base: FlowNodeData = { nodeType: type, label: meta.label };
  if (type === "start_salesbot") {
    return { ...base, label: "Iniciar Salesbot" };
  }
  if (type === "message") {
    return { ...base, text: "Escribe el mensaje para el cliente", buttons: [{ id: "opcion_1", title: "Opción 1" }] };
  }
  if (type === "list_message") {
    return { ...base, text: "Elige una opción", rows: [{ id: "fila_1", title: "Fila 1" }] };
  }
  if (type === "condition") {
    return { ...base, source: "lastMessage", operator: "contains", value: "" };
  }
  if (type === "validation") {
    return { ...base, rule: "nonempty", saveAs: "" };
  }
  if (type === "actions") {
    return { ...base, actions: [{ type: "add_note", body: "Pendiente por configurar" }] };
  }
  if (type === "pause") {
    return { ...base, label: "Pausa", duration: "Esperar respuesta" };
  }
  return base;
}

function initialGraph(): BotFlowGraph {
  return {
    nodes: [{ id: "start", type: "start_salesbot", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  };
}

function toFlowNodes(nodes: BotFlowNode[]): FlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...defaultData(node.type), ...node.data, nodeType: node.type },
  }));
}

function toFlowEdges(edges: BotFlowEdge[]): FlowEdge[] {
  return edges.map((edge) => ({
    ...edge,
    markerEnd: { type: MarkerType.ArrowClosed },
    type: "smoothstep",
  }));
}

function stripNodeData(data: FlowNodeData) {
  const { nodeType: _nodeType, label: _label, ...rest } = data;
  return rest;
}

function buildGraph(nodes: FlowNode[], edges: FlowEdge[]): BotFlowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type as BotNodeType,
      position: node.position,
      data: stripNodeData(node.data),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      label: typeof edge.label === "string" ? edge.label : undefined,
    })),
  };
}

function getEdgeLabel(source: FlowNode | undefined, sourceHandle?: string | null) {
  if (!sourceHandle) {
    return undefined;
  }
  if (sourceHandle === "true") {
    return "Sí";
  }
  if (sourceHandle === "false") {
    return "No";
  }
  if (sourceHandle === "valid") {
    return "Válido";
  }
  if (sourceHandle === "invalid") {
    return "Inválido";
  }
  const buttons = source?.data.buttons;
  const rows = source?.data.rows as BotButton[] | undefined;
  return [...(buttons ?? []), ...(rows ?? [])].find((item) => item.id === sourceHandle)?.title ?? sourceHandle;
}

export function BotsPage() {
  return (
    <ReactFlowProvider>
      <BotsWorkspace />
    </ReactFlowProvider>
  );
}

function BotsWorkspace() {
  const queryClient = useQueryClient();
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);

  const botsQuery = useQuery({
    queryKey: ["bots"],
    queryFn: getBots,
    refetchInterval: 20_000,
  });

  const selectedBotQuery = useQuery({
    queryKey: ["bots", selectedBotId],
    queryFn: () => getBot(selectedBotId),
    enabled: Boolean(selectedBotId),
  });

  useEffect(() => {
    if (!selectedBotId && botsQuery.data?.[0]) {
      setSelectedBotId(botsQuery.data[0].id);
    }
  }, [botsQuery.data, selectedBotId]);

  useEffect(() => {
    const graph = selectedBotQuery.data?.flow?.graph ?? initialGraph();
    setNodes(toFlowNodes(graph.nodes));
    setEdges(toFlowEdges(graph.edges));
    setSelectedNodeId(graph.nodes[0]?.id ?? null);
  }, [selectedBotQuery.data, setEdges, setNodes]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const createMutation = useMutation({
    mutationFn: () => createBot({ name: `Salesbot ${botsQuery.data ? botsQuery.data.length + 1 : 1}` }),
    onSuccess: (bot) => {
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
      setSelectedBotId(bot.id);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedBotId) {
        throw new Error("No bot selected");
      }
      return saveBotFlow(selectedBotId, buildGraph(nodes, edges));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bots", selectedBotId] });
    },
  });

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = nodes.find((node) => node.id === connection.source);
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `e-${connection.source}-${connection.sourceHandle ?? "default"}-${connection.target}-${Date.now()}`,
            label: getEdgeLabel(source, connection.sourceHandle),
            markerEnd: { type: MarkerType.ArrowClosed },
            type: "smoothstep",
          },
          current,
        ),
      );
    },
    [nodes, setEdges],
  );

  function addNode(type: BotNodeType, position = { x: 220 + nodes.length * 30, y: 120 + nodes.length * 24 }) {
    const id = `${type}_${Date.now()}`;
    const node: FlowNode = {
      id,
      type,
      position,
      data: defaultData(type),
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(id);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/crm-bot-node") as BotNodeType;
    if (!type || !reactFlow) {
      return;
    }
    addNode(type, reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function updateSelectedNode(data: Partial<FlowNodeData>) {
    if (!selectedNodeId) {
      return;
    }
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, ...data } } : node,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bots"
        description="Salesbots visuales para WhatsApp y seguimiento comercial"
        actions={
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4" />
            + Crear bot
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Disparadores</th>
                <th className="px-4 py-3 font-medium">Tasa de conversión</th>
                <th className="px-4 py-3 font-medium">Lanzamientos</th>
                <th className="px-4 py-3 font-medium">Sesiones activas</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {botsQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))
              ) : botsQuery.isError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <EmptyState title="No se pudieron cargar los bots" description="Revisa la API e intenta de nuevo." />
                  </td>
                </tr>
              ) : botsQuery.data?.length ? (
                botsQuery.data.map((bot) => (
                  <tr
                    key={bot.id}
                    className={cn(
                      "cursor-pointer transition hover:bg-secondary/35",
                      selectedBotId === bot.id && "bg-primary/10",
                    )}
                    onClick={() => setSelectedBotId(bot.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                          <Bot className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{bot.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{getTriggerLabel(bot)}</td>
                    <td className="px-4 py-3">{percentValue(bot.conversionRate ?? bot.conversion_rate)}</td>
                    <td className="px-4 py-3">{numberValue(bot.launches).toLocaleString("es-CO")}</td>
                    <td className="px-4 py-3">{numberValue(bot.activeSessions ?? bot.active_sessions).toLocaleString("es-CO")}</td>
                    <td className="px-4 py-3">
                      <Badge
                        className={cn(
                          "capitalize",
                          (bot.status ?? "active") !== "active" &&
                            "border-slate-500/30 bg-slate-500/10 text-slate-300",
                        )}
                      >
                        {bot.status === "inactive" ? "Inactivo" : "Activo"}
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <EmptyState title="Sin bots" description="Crea tu primer Salesbot para empezar." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid min-h-[760px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)_330px]">
        <Palette onAddNode={addNode} />

        <Card className="overflow-hidden p-0">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {selectedBotQuery.data?.name ?? "Selecciona un bot"}
              </p>
              <p className="text-xs text-muted-foreground">{nodes.length} pasos · {edges.length} conexiones</p>
            </div>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!selectedBotId || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Guardando" : "Guardar"}
            </Button>
          </div>
          <div
            className="h-[708px]"
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlow}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              fitView
            >
              <Background gap={18} color="hsl(var(--border))" />
              <MiniMap pannable zoomable nodeStrokeWidth={3} />
              <Controls />
            </ReactFlow>
          </div>
        </Card>

        <Inspector node={selectedNode} onChange={updateSelectedNode} />
      </div>
    </div>
  );
}

function Palette({ onAddNode }: { onAddNode: (type: BotNodeType) => void }) {
  return (
    <Card className="h-full overflow-hidden p-0">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">Agrega el siguiente paso</h2>
      </div>
      <div className="grid max-h-[704px] gap-2 overflow-y-auto p-3">
        {NODE_CATALOG.map((item) => (
          <button
            key={item.type}
            className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-primary/50 hover:bg-secondary"
            type="button"
            draggable
            onClick={() => onAddNode(item.type)}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/crm-bot-node", item.type);
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: item.color }}
            >
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </Card>
  );
}

function FlowNodeCard({ data }: NodeProps<FlowNode>) {
  const meta = getNodeMeta(data.nodeType);
  const buttons = data.buttons ?? ((data.rows as BotButton[] | undefined) ?? []);
  const branchHandles =
    data.nodeType === "condition"
      ? [
          { id: "true", label: "Sí" },
          { id: "false", label: "No" },
        ]
      : data.nodeType === "validation"
        ? [
            { id: "valid", label: "Válido" },
            { id: "invalid", label: "Inválido" },
          ]
        : [];
  return (
    <div className="min-w-56 rounded-lg border border-border bg-card shadow-xl shadow-black/20">
      <Handle className="!h-3 !w-3 !border-2 !border-background" type="target" position={Position.Left} />
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ backgroundColor: meta.color }}>
          {meta.icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{String(data.label ?? meta.label)}</p>
          <p className="text-[11px] text-muted-foreground">{data.nodeType}</p>
        </div>
      </div>
      <div className="space-y-2 px-3 py-2 text-xs text-muted-foreground">
        {data.text ? <p className="line-clamp-3 text-foreground">{String(data.text)}</p> : null}
        {data.actions?.length ? (
          <p>{data.actions.length} acción{data.actions.length === 1 ? "" : "es"}</p>
        ) : null}
        {buttons.length ? (
          <div className="space-y-1">
            {buttons.map((button) => (
              <div key={button.id} className="relative rounded-md border border-border bg-secondary px-2 py-1 pr-7 text-foreground">
                {button.title}
                <Handle
                  id={button.id}
                  className="!right-1 !h-3 !w-3 !border-2 !border-background"
                  type="source"
                  position={Position.Right}
                />
              </div>
            ))}
          </div>
        ) : null}
        {branchHandles.length ? (
          <div className="space-y-1">
            {branchHandles.map((branch) => (
              <div key={branch.id} className="relative rounded-md border border-border bg-secondary px-2 py-1 pr-7 text-foreground">
                {branch.label}
                <Handle
                  id={branch.id}
                  className="!right-1 !h-3 !w-3 !border-2 !border-background"
                  type="source"
                  position={Position.Right}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {branchHandles.length || buttons.length ? null : (
        <Handle
          id="default"
          className="!h-3 !w-3 !border-2 !border-background"
          type="source"
          position={Position.Right}
        />
      )}
    </div>
  );
}

function Inspector({
  node,
  onChange,
}: {
  node: FlowNode | null;
  onChange: (data: Partial<FlowNodeData>) => void;
}) {
  if (!node) {
    return (
      <Card className="p-5">
        <EmptyState title="Selecciona un nodo" description="Edita el paso activo desde este panel." />
      </Card>
    );
  }

  const type = node.type as BotNodeType;
  const meta = getNodeMeta(type);

  return (
    <Card className="h-full overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-md text-white" style={{ backgroundColor: meta.color }}>
          {meta.icon}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{meta.label}</h2>
          <p className="text-xs text-muted-foreground">{node.id}</p>
        </div>
      </div>

      <div className="max-h-[704px] space-y-4 overflow-y-auto p-4">
        <Field label="Nombre del paso">
          <input
            className="input"
            value={String(node.data.label ?? meta.label)}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </Field>

        {type === "message" ? (
          <MessageEditor node={node} onChange={onChange} />
        ) : type === "actions" ? (
          <ActionsEditor node={node} onChange={onChange} />
        ) : type === "list_message" ? (
          <ListEditor node={node} onChange={onChange} />
        ) : type === "condition" ? (
          <ConditionEditor node={node} onChange={onChange} />
        ) : type === "validation" ? (
          <ValidationEditor node={node} onChange={onChange} />
        ) : type === "goto" ? (
          <Field label="ID del paso destino">
            <input className="input" value={String(node.data.targetNodeId ?? "")} onChange={(event) => onChange({ targetNodeId: event.target.value })} />
          </Field>
        ) : (
          <GenericEditor node={node} onChange={onChange} />
        )}
      </div>
    </Card>
  );
}

function MessageEditor({ node, onChange }: { node: FlowNode; onChange: (data: Partial<FlowNodeData>) => void }) {
  const buttons = node.data.buttons ?? [];
  return (
    <>
      <Field label="Texto">
        <textarea
          className="input min-h-28 resize-none py-2"
          value={String(node.data.text ?? "")}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      </Field>
      <Field label="Guardar respuesta en">
        <input className="input" value={String(node.data.saveAs ?? "")} onChange={(event) => onChange({ saveAs: event.target.value })} placeholder="contextKey" />
      </Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Botones de respuesta</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ buttons: [...buttons, { id: `opcion_${buttons.length + 1}`, title: `Opción ${buttons.length + 1}` }] })}
          >
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </div>
        {buttons.map((button, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input className="input" value={button.id} onChange={(event) => onChange({ buttons: replaceAt(buttons, index, { ...button, id: event.target.value }) })} />
            <input className="input" value={button.title} onChange={(event) => onChange({ buttons: replaceAt(buttons, index, { ...button, title: event.target.value }) })} />
            <Button size="icon" variant="ghost" onClick={() => onChange({ buttons: buttons.filter((_, i) => i !== index) })}>
              ×
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

function ListEditor({ node, onChange }: { node: FlowNode; onChange: (data: Partial<FlowNodeData>) => void }) {
  const rows = ((node.data.rows as BotButton[] | undefined) ?? []);
  return (
    <>
      <Field label="Texto">
        <textarea className="input min-h-24 resize-none py-2" value={String(node.data.text ?? "")} onChange={(event) => onChange({ text: event.target.value })} />
      </Field>
      <Field label="Guardar selección en">
        <input className="input" value={String(node.data.saveAs ?? "")} onChange={(event) => onChange({ saveAs: event.target.value })} />
      </Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Filas</span>
          <Button size="sm" variant="outline" onClick={() => onChange({ rows: [...rows, { id: `fila_${rows.length + 1}`, title: `Fila ${rows.length + 1}` }] })}>
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </div>
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input className="input" value={row.id} onChange={(event) => onChange({ rows: replaceAt(rows, index, { ...row, id: event.target.value }) })} />
            <input className="input" value={row.title} onChange={(event) => onChange({ rows: replaceAt(rows, index, { ...row, title: event.target.value }) })} />
            <Button size="icon" variant="ghost" onClick={() => onChange({ rows: rows.filter((_, i) => i !== index) })}>×</Button>
          </div>
        ))}
      </div>
    </>
  );
}

function ActionsEditor({ node, onChange }: { node: FlowNode; onChange: (data: Partial<FlowNodeData>) => void }) {
  const actions = node.data.actions ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Acciones</span>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none"
          value=""
          onChange={(event) => {
            if (event.target.value) {
              onChange({ actions: [...actions, createDefaultAction(event.target.value as BotAction["type"])] });
            }
          }}
        >
          <option value="">Agregar acción</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      {actions.map((action, index) => (
        <ActionBlock
          key={index}
          action={action}
          onRemove={() => onChange({ actions: actions.filter((_, i) => i !== index) })}
          onUpdate={(next) => onChange({ actions: replaceAt(actions, index, next) })}
        />
      ))}
    </div>
  );
}

function ActionBlock({
  action,
  onUpdate,
  onRemove,
}: {
  action: BotAction;
  onUpdate: (action: BotAction) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{ACTION_LABELS[action.type]}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}>×</Button>
      </div>
      {action.type === "manage_tags" ? (
        <>
          <Field label="Agregar etiquetas"><input className="input" value={action.add.join(", ")} onChange={(event) => onUpdate({ ...action, add: splitList(event.target.value) })} /></Field>
          <Field label="Remover etiquetas"><input className="input" value={action.remove.join(", ")} onChange={(event) => onUpdate({ ...action, remove: splitList(event.target.value) })} /></Field>
        </>
      ) : action.type === "add_note" ? (
        <Field label="Nota"><textarea className="input min-h-20 resize-none py-2" value={action.body} onChange={(event) => onUpdate({ ...action, body: event.target.value })} /></Field>
      ) : action.type === "add_task" ? (
        <>
          <Field label="Título"><input className="input" value={action.title} onChange={(event) => onUpdate({ ...action, title: event.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tipo"><select className="input" value={action.taskType} onChange={(event) => onUpdate({ ...action, taskType: event.target.value as BotAction & "task" })}><option value="task">Tarea</option><option value="call">Llamada</option><option value="email">Email</option><option value="meeting">Reunión</option><option value="whatsapp">WhatsApp</option></select></Field>
            <Field label="Minutos"><input className="input" type="number" value={action.dueInMinutes} onChange={(event) => onUpdate({ ...action, dueInMinutes: Number(event.target.value) })} /></Field>
          </div>
          <Field label="Responsable"><input className="input" value={action.assignedToUserId ?? ""} onChange={(event) => onUpdate({ ...action, assignedToUserId: event.target.value || null })} /></Field>
        </>
      ) : action.type === "change_lead_stage" || action.type === "create_lead" ? (
        <>
          <Field label="Pipeline ID"><input className="input" value={action.pipelineId} onChange={(event) => onUpdate({ ...action, pipelineId: event.target.value })} /></Field>
          <Field label="Stage ID"><input className="input" value={action.stageId} onChange={(event) => onUpdate({ ...action, stageId: event.target.value })} /></Field>
          {action.type === "create_lead" ? (
            <>
              <Field label="Nombre"><input className="input" value={action.name} onChange={(event) => onUpdate({ ...action, name: event.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={action.copyContact} onChange={(event) => onUpdate({ ...action, copyContact: event.target.checked })} /> Copiar contacto</label>
            </>
          ) : null}
        </>
      ) : action.type === "change_conv_stage" ? (
        <Field label="Estado"><select className="input" value={action.status} onChange={(event) => onUpdate({ ...action, status: event.target.value as "open" | "closed" })}><option value="open">Abierta</option><option value="closed">Cerrada</option></select></Field>
      ) : action.type === "change_responsible" ? (
        <Field label="Usuario responsable"><input className="input" value={action.userId} onChange={(event) => onUpdate({ ...action, userId: event.target.value })} /></Field>
      ) : action.type === "complete_task" ? (
        <Field label="Task ID"><input className="input" value={action.taskId ?? ""} onChange={(event) => onUpdate(event.target.value ? { type: "complete_task", taskId: event.target.value } : { type: "complete_task", latest: true })} /></Field>
      ) : action.type === "send_email" ? (
        <>
          <Field label="Para"><input className="input" value={action.to} onChange={(event) => onUpdate({ ...action, to: event.target.value })} /></Field>
          <Field label="Asunto"><input className="input" value={action.subject} onChange={(event) => onUpdate({ ...action, subject: event.target.value })} /></Field>
          <Field label="Mensaje"><textarea className="input min-h-20 resize-none py-2" value={action.body} onChange={(event) => onUpdate({ ...action, body: event.target.value })} /></Field>
        </>
      ) : action.type === "send_webhook" ? (
        <>
          <Field label="URL"><input className="input" value={action.url} onChange={(event) => onUpdate({ ...action, url: event.target.value })} /></Field>
          <Field label="Método"><select className="input" value={action.method} onChange={(event) => onUpdate({ ...action, method: event.target.value as BotAction & "POST" })}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></Field>
          <Field label="Payload JSON"><textarea className="input min-h-20 resize-none py-2" value={JSON.stringify(action.payload ?? {}, null, 2)} onChange={(event) => onUpdate({ ...action, payload: parseJson(event.target.value) })} /></Field>
        </>
      ) : action.type === "set_field" ? (
        <>
          <Field label="Campo"><input className="input" value={action.fieldCode} onChange={(event) => onUpdate({ ...action, fieldCode: event.target.value })} /></Field>
          <Field label="Valor"><input className="input" value={action.value ?? ""} onChange={(event) => onUpdate({ ...action, value: event.target.value || null })} /></Field>
        </>
      ) : (
        <Field label="Campos del formulario"><textarea className="input min-h-24 resize-none py-2" value={action.fields.map((field) => `${field.name}:${field.label}:${field.type}:${field.required ? "required" : ""}`).join("\n")} onChange={(event) => onUpdate({ ...action, fields: parseFormFields(event.target.value) })} /></Field>
      )}
    </div>
  );
}

function ConditionEditor({ node, onChange }: { node: FlowNode; onChange: (data: Partial<FlowNodeData>) => void }) {
  return (
    <>
      <Field label="Fuente"><select className="input" value={String(node.data.source ?? "lastMessage")} onChange={(event) => onChange({ source: event.target.value })}><option value="lastMessage">Último mensaje</option><option value="context">Contexto</option></select></Field>
      <Field label="Key"><input className="input" value={String(node.data.key ?? "")} onChange={(event) => onChange({ key: event.target.value })} /></Field>
      <Field label="Operador"><select className="input" value={String(node.data.operator ?? "contains")} onChange={(event) => onChange({ operator: event.target.value })}><option value="equals">equals</option><option value="not_equals">not_equals</option><option value="contains">contains</option><option value="exists">exists</option><option value="empty">empty</option></select></Field>
      <Field label="Valor"><input className="input" value={String(node.data.value ?? "")} onChange={(event) => onChange({ value: event.target.value })} /></Field>
      <p className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">Conecta ramas con handles <strong>true</strong> y <strong>false</strong> editando el edge desde el canvas.</p>
    </>
  );
}

function ValidationEditor({ node, onChange }: { node: FlowNode; onChange: (data: Partial<FlowNodeData>) => void }) {
  return (
    <>
      <Field label="Regla"><select className="input" value={String(node.data.rule ?? "nonempty")} onChange={(event) => onChange({ rule: event.target.value })}><option value="email">email</option><option value="phone">phone</option><option value="number">number</option><option value="regex">regex</option><option value="nonempty">nonempty</option></select></Field>
      <Field label="Patrón"><input className="input" value={String(node.data.pattern ?? "")} onChange={(event) => onChange({ pattern: event.target.value })} /></Field>
      <Field label="Guardar como"><input className="input" value={String(node.data.saveAs ?? "")} onChange={(event) => onChange({ saveAs: event.target.value })} /></Field>
    </>
  );
}

function GenericEditor({ node, onChange }: { node: FlowNode; onChange: (data: Partial<FlowNodeData>) => void }) {
  return (
    <>
      <Field label="Texto / descripción">
        <textarea className="input min-h-28 resize-none py-2" value={String(node.data.text ?? "")} onChange={(event) => onChange({ text: event.target.value })} />
      </Field>
      <Field label="Clave de contexto">
        <input className="input" value={String(node.data.saveAs ?? "")} onChange={(event) => onChange({ saveAs: event.target.value })} />
      </Field>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function replaceAt<T>(items: T[], index: number, next: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseFormFields(value: string) {
  const fields = value
    .split("\n")
    .map((line) => {
      const [name, label, type, required] = line.split(":").map((item) => item.trim());
      return { name, label, type, required: required === "required" };
    })
    .filter((field) => field.name && field.label && field.type);
  return fields.length ? fields : [{ name: "email", label: "Email", type: "email", required: true }];
}

function createDefaultAction(type: BotAction["type"]): BotAction {
  const defaults: Record<BotAction["type"], BotAction> = {
    manage_tags: { type: "manage_tags", add: ["interesado"], remove: [] },
    add_note: { type: "add_note", body: "Nota del salesbot" },
    add_task: { type: "add_task", taskType: "task", title: "Dar seguimiento", dueInMinutes: 60 },
    change_lead_stage: { type: "change_lead_stage", pipelineId: "pipeline_id", stageId: "stage_id" },
    change_conv_stage: { type: "change_conv_stage", status: "open" },
    change_responsible: { type: "change_responsible", userId: "user_id" },
    complete_task: { type: "complete_task", latest: true },
    create_lead: { type: "create_lead", pipelineId: "pipeline_id", stageId: "stage_id", name: "Nuevo lead", copyContact: true },
    send_email: { type: "send_email", to: "cliente@email.com", subject: "Seguimiento", body: "Hola" },
    send_webhook: { type: "send_webhook", url: "https://example.com/webhook", method: "POST", payload: {} },
    set_field: { type: "set_field", fieldCode: "campo", value: "" },
    generate_form: { type: "generate_form", fields: [{ name: "email", label: "Email", type: "email", required: true }] },
  };
  return defaults[type];
}
