import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Avatar } from "@/components/ui/avatar";
import { Badge, Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LeadDetailPanel } from "@/components/LeadDetailPanel";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createPipeline,
  createStage,
  deleteStage,
  getLeads,
  getPipelines,
  type ChannelType,
  type Lead,
  type LeadTag,
  reorderStages,
  type Stage,
  updateLead,
  updateStage,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "IG",
  facebook: "FB",
  tiktok: "TikTok",
};

const STAGE_TYPES = ["active", "won", "lost"] as const;

type StageDraft = Stage & {
  isNew?: boolean;
};

function getLeadStageId(lead: Lead) {
  return lead.stage_id ?? lead.stageId ?? "";
}

function getLeadName(lead: Lead) {
  return lead.name ?? lead.title ?? lead.contact?.name ?? "Lead sin nombre";
}

function getLeadValue(lead: Lead) {
  const rawValue = lead.amount ?? lead.value ?? 0;
  const value = typeof rawValue === "string" ? Number(rawValue) : rawValue;
  return Number.isFinite(value) ? Number(value) : 0;
}

function getLeadChannel(lead: Lead): ChannelType | null {
  if (!lead.channel) {
    return null;
  }
  if (typeof lead.channel === "string") {
    return lead.channel;
  }
  return lead.channel.type ?? null;
}

function getTagFromItem(item: LeadTag | { tag?: LeadTag | null }): LeadTag | null {
  if ("tag" in item) {
    return item.tag ?? null;
  }

  return item as LeadTag;
}

function getLeadTags(lead: Lead): LeadTag[] {
  if (!lead.tags) {
    return [];
  }

  return lead.tags.reduce<LeadTag[]>((tags, item) => {
    const tag = getTagFromItem(item);
    if (tag?.name) {
      tags.push(tag);
    }
    return tags;
  }, []);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatActivity(lead: Lead) {
  const rawDate = lead.last_activity_at ?? lead.lastActivityAt ?? lead.updated_at ?? lead.updatedAt;
  if (!rawDate) {
    return "Sin actividad";
  }

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return "Sin actividad";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sortStages(stages: Stage[] = []) {
  return [...stages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function normalizeColor(color?: string | null) {
  return color && color.startsWith("#") ? color : "#8b5cf6";
}

export function LeadsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const pipelineFromUrl = searchParams.get("pipelineId") ?? "";
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { data: pipelines = [], isLoading: isLoadingPipelines } = useQuery({
    queryKey: ["pipelines"],
    queryFn: getPipelines,
    staleTime: 30_000,
  });

  const selectedPipeline = useMemo(() => {
    return pipelines.find((pipeline) => pipeline.id === pipelineFromUrl) ?? pipelines[0] ?? null;
  }, [pipelineFromUrl, pipelines]);

  const selectedPipelineId = selectedPipeline?.id ?? "";
  const stages = useMemo(() => sortStages(selectedPipeline?.stages), [selectedPipeline?.stages]);

  const {
    data: leads = [],
    isLoading: isLoadingLeads,
    isError,
  } = useQuery({
    queryKey: ["leads", selectedPipelineId],
    queryFn: () => getLeads({ pipelineId: selectedPipelineId }),
    enabled: Boolean(selectedPipelineId),
    refetchInterval: 5_000,
  });

  const moveLeadMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      updateLead(leadId, { stage_id: stageId }),
    onMutate: async ({ leadId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ["leads", selectedPipelineId] });
      const previousLeads = queryClient.getQueryData<Lead[]>(["leads", selectedPipelineId]);

      queryClient.setQueryData<Lead[]>(["leads", selectedPipelineId], (currentLeads = []) =>
        currentLeads.map((lead) =>
          lead.id === leadId ? { ...lead, stage_id: stageId, stageId } : lead,
        ),
      );

      return { previousLeads };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(["leads", selectedPipelineId], context?.previousLeads);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads", selectedPipelineId] });
    },
  });

  const groupedLeads = useMemo(() => {
    const groups = new Map<string, Lead[]>();
    stages.forEach((stage) => groups.set(stage.id, []));

    leads.forEach((lead) => {
      const stageId = getLeadStageId(lead) || stages[0]?.id;
      if (!stageId) {
        return;
      }
      groups.set(stageId, [...(groups.get(stageId) ?? []), lead]);
    });

    return groups;
  }, [leads, stages]);

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    setActiveLeadId(activeId.replace("lead:", ""));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLeadId(null);

    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!activeId.startsWith("lead:") || !overId.startsWith("stage:")) {
      return;
    }

    const leadId = activeId.replace("lead:", "");
    const nextStageId = overId.replace("stage:", "");
    const currentLead = leads.find((lead) => lead.id === leadId);
    if (!currentLead || getLeadStageId(currentLead) === nextStageId) {
      return;
    }

    moveLeadMutation.mutate({ leadId, stageId: nextStageId });
  }

  if (isLoadingPipelines) {
    return (
      <div className="space-y-6">
        <PageHeader title="Leads" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-96" />
          ))}
        </div>
      </div>
    );
  }

  if (!selectedPipeline) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Leads"
          actions={<CreatePipelineButton />}
        />
        <EmptyState title="No hay pipelines" description="Crea un pipeline para empezar a organizar leads." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={selectedPipeline.name}
        actions={
          <>
            <CreatePipelineButton />
            <Button variant="outline" onClick={() => setIsEditorOpen(true)}>
              <Pencil className="h-4 w-4" />
              Editar etapas
            </Button>
          </>
        }
      />

      {isError ? (
        <EmptyState title="No se pudo cargar el tablero" description="Revisa la API e intenta de nuevo." />
      ) : stages.length === 0 ? (
        <EmptyState
          title="Este pipeline no tiene etapas"
          description="Agrega etapas desde el editor del pipeline."
          action={
            <Button onClick={() => setIsEditorOpen(true)}>
              <Pencil className="h-4 w-4" />
              Editar etapas
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveLeadId(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-3">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={groupedLeads.get(stage.id) ?? []}
                isLoading={isLoadingLeads}
                activeLeadId={activeLeadId}
                onOpenLead={setSelectedLeadId}
              />
            ))}
          </div>
        </DndContext>
      )}

      {isEditorOpen ? (
        <StageEditorModal pipeline={selectedPipeline} stages={stages} onClose={() => setIsEditorOpen(false)} />
      ) : null}

      {selectedLeadId ? (
        <LeadDetailPanel
          leadId={selectedLeadId}
          pipelines={pipelines}
          onClose={() => setSelectedLeadId(null)}
        />
      ) : null}
    </div>
  );
}

function KanbanColumn({
  stage,
  leads,
  isLoading,
  activeLeadId,
  onOpenLead,
}: {
  stage: Stage;
  leads: Lead[];
  isLoading: boolean;
  activeLeadId: string | null;
  onOpenLead: (leadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  const total = leads.reduce((sum, lead) => sum + getLeadValue(lead), 0);
  const color = normalizeColor(stage.color);

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex h-[calc(100vh-13rem)] w-80 shrink-0 flex-col rounded-lg border border-border bg-card/70",
        isOver && "border-primary/70 ring-2 ring-primary/25",
      )}
    >
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{formatMoney(total)}</p>
          </div>
          <Badge>{leads.length}</Badge>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32" />)
        ) : leads.length > 0 ? (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              isDragging={activeLeadId === lead.id}
              onOpen={() => onOpenLead(lead.id)}
            />
          ))
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Sin leads
          </div>
        )}
      </div>
    </section>
  );
}

function LeadCard({ lead, isDragging, onOpen }: { lead: Lead; isDragging: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `lead:${lead.id}` });
  const channel = getLeadChannel(lead);
  const tags = getLeadTags(lead);
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab touch-none space-y-4 p-4 transition active:cursor-grabbing",
        isDragging && "opacity-70 ring-2 ring-primary/40",
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onOpen();
        }
      }}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start gap-3">
        <Avatar
          name={getLeadName(lead)}
          src={lead.contact?.avatar_url ?? lead.contact?.avatarUrl ?? undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{getLeadName(lead)}</p>
          <p className="mt-1 text-xs text-muted-foreground">#{lead.id}</p>
        </div>
        {channel ? <Badge>{CHANNEL_LABELS[channel]}</Badge> : null}
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.slice(0, 3).map((tag) => (
            <Tag
              key={`${lead.id}-${tag.id ?? tag.name}`}
              className="border-border bg-secondary text-muted-foreground"
            >
              {tag.name}
            </Tag>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Ultima actividad</span>
        <span className="truncate text-foreground">{formatActivity(lead)}</span>
      </div>
    </Card>
  );
}

function CreatePipelineButton() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createPipeline,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });

  function handleCreatePipeline() {
    const name = window.prompt("Nombre del pipeline");
    if (!name?.trim()) {
      return;
    }
    mutation.mutate({ name: name.trim() });
  }

  return (
    <Button variant="secondary" onClick={handleCreatePipeline} disabled={mutation.isPending}>
      <Plus className="h-4 w-4" />
      Nuevo pipeline
    </Button>
  );
}

function StageEditorModal({
  pipeline,
  stages,
  onClose,
}: {
  pipeline: { id: string; name: string };
  stages: Stage[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<StageDraft[]>([]);
  const [deletedStageIds, setDeletedStageIds] = useState<string[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setDrafts(stages.map((stage) => ({ ...stage })));
    setDeletedStageIds([]);
  }, [stages]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const savedStages: Stage[] = [];

      for (const stageId of deletedStageIds) {
        await deleteStage(stageId);
      }

      for (const draft of drafts) {
        const input = {
          name: draft.name.trim(),
          color: normalizeColor(draft.color),
          type: draft.type ?? "active",
        };

        if (draft.isNew) {
          savedStages.push(await createStage(pipeline.id, input));
        } else {
          savedStages.push(await updateStage(draft.id, input));
        }
      }

      await reorderStages(
        pipeline.id,
        savedStages.map((stage, position) => ({ stageId: stage.id, position })),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      onClose();
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setDrafts((currentDrafts) => {
      const oldIndex = currentDrafts.findIndex((stage) => stage.id === active.id);
      const newIndex = currentDrafts.findIndex((stage) => stage.id === over.id);
      return arrayMove(currentDrafts, oldIndex, newIndex);
    });
  }

  function updateDraft(id: string, input: Partial<StageDraft>) {
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) => (draft.id === id ? { ...draft, ...input } : draft)),
    );
  }

  function addStage() {
    setDrafts((currentDrafts) => [
      ...currentDrafts,
      {
        id: `new-${crypto.randomUUID()}`,
        name: "Nueva etapa",
        color: "#8b5cf6",
        type: "active",
        isNew: true,
      },
    ]);
  }

  function removeStage(stage: StageDraft) {
    setDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== stage.id));
    if (!stage.isNew) {
      setDeletedStageIds((currentIds) => [...currentIds, stage.id]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Editor del pipeline</h2>
            <p className="text-sm text-muted-foreground">{pipeline.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
            <SortableContext items={drafts.map((draft) => draft.id)} strategy={verticalListSortingStrategy}>
              {drafts.map((draft) => (
                <SortableStageRow
                  key={draft.id}
                  stage={draft}
                  onChange={updateDraft}
                  onRemove={removeStage}
                />
              ))}
            </SortableContext>
          </DndContext>

          <Button variant="outline" onClick={addStage}>
            <Plus className="h-4 w-4" />
            Agregar etapa
          </Button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Guardando" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableStageRow({
  stage,
  onChange,
  onRemove,
}: {
  stage: StageDraft;
  onChange: (id: string, input: Partial<StageDraft>) => void;
  onRemove: (stage: StageDraft) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_8rem_9rem_auto] items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3"
    >
      <button
        className="cursor-grab rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
        type="button"
        aria-label="Reordenar etapa"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <input
        className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={stage.name}
        onChange={(event) => onChange(stage.id, { name: event.target.value })}
      />

      <input
        className="h-9 w-full rounded-md border border-input bg-background px-2"
        type="color"
        value={normalizeColor(stage.color)}
        onChange={(event) => onChange(stage.id, { color: event.target.value })}
        aria-label="Color"
      />

      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={stage.type ?? "active"}
        onChange={(event) => onChange(stage.id, { type: event.target.value })}
        aria-label="Tipo"
      >
        {STAGE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      <Button variant="ghost" size="icon" onClick={() => onRemove(stage)} aria-label="Eliminar etapa">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
