import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardPlus,
  Hash,
  Mail,
  Phone,
  Plus,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { ChatConversationPanel } from "@/components/ChatInbox";
import { Badge, Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addLeadTag,
  createTask,
  deleteLeadTag,
  getLead,
  type ContactSummary,
  type CustomFieldDefinition,
  type Lead,
  type LeadCustomFieldValue,
  type LeadTag,
  type LeadUpdateInput,
  type Pipeline,
  type Stage,
  updateContact,
  updateLead,
  updateLeadCustomField,
} from "@/lib/api";

const FALLBACK_CUSTOM_FIELDS: CustomFieldDefinition[] = [
  { id: "producto", code: "producto", label: "Producto", type: "text", position: 0 },
  { id: "talla", code: "talla", label: "Talla", type: "select", options: ["XS", "S", "M", "L", "XL", "XXL"], position: 1 },
  { id: "cantidad", code: "cantidad", label: "Cantidad", type: "number", position: 2 },
  { id: "ciudad", code: "ciudad", label: "Ciudad", type: "text", position: 3 },
  {
    id: "linea_producto",
    code: "linea_producto",
    label: "Línea",
    type: "select",
    options: ["Ropa", "Calzado", "Accesorios", "Tecnología", "Hogar"],
    position: 4,
  },
  {
    id: "intencion",
    code: "intencion",
    label: "Intención",
    type: "select",
    options: ["Alta", "Media", "Baja"],
    position: 5,
  },
  {
    id: "fuente",
    code: "fuente",
    label: "Fuente",
    type: "select",
    options: ["WhatsApp", "Instagram", "Facebook", "TikTok", "Orgánico", "Pauta"],
    position: 6,
  },
  {
    id: "metodo_pago",
    code: "metodo_pago",
    label: "Método de pago",
    type: "select",
    options: ["Contraentrega", "Transferencia", "Tarjeta", "Nequi", "Daviplata"],
    position: 7,
  },
  { id: "direccion_entrega", code: "direccion_entrega", label: "Dirección", type: "text", position: 8 },
];

function getLeadStageId(lead: Lead) {
  return lead.stage_id ?? lead.stageId ?? lead.stage?.id ?? "";
}

function getLeadPipelineId(lead: Lead) {
  return lead.pipelineId ?? lead.pipeline_id ?? lead.pipeline?.id ?? lead.stage?.pipeline_id ?? lead.stage?.pipelineId ?? "";
}

function getLeadValue(lead: Lead) {
  const rawValue = lead.amount ?? lead.value ?? 0;
  return typeof rawValue === "string" ? rawValue : String(rawValue);
}

function getLeadTags(lead: Lead): LeadTag[] {
  return (lead.tags ?? []).reduce<LeadTag[]>((tags, item) => {
    const tag = "tag" in item ? item.tag : (item as LeadTag);
    if (tag?.name) {
      tags.push(tag);
    }
    return tags;
  }, []);
}

function getCustomValues(lead?: Lead) {
  return lead?.customFieldVals ?? lead?.custom_field_vals ?? [];
}

function getFieldId(value: LeadCustomFieldValue) {
  return value.fieldId ?? value.field_id ?? value.field.id;
}

export function LeadDetailPanel({
  leadId,
  pipelines,
  onClose,
}: {
  leadId: string;
  pipelines: Pipeline[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState("");
  const selectedPipeline = pipelines[0] ?? null;

  const {
    data: lead,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => getLead(leadId),
  });

  const pipelineId = lead ? getLeadPipelineId(lead) || selectedPipeline?.id || "" : "";
  const pipeline = pipelines.find((item) => item.id === pipelineId) ?? selectedPipeline;
  const stages = useMemo(
    () => [...(pipeline?.stages ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [pipeline?.stages],
  );
  const conversations = lead?.conversations ?? [];
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null;

  useEffect(() => {
    setActiveConversationId((currentId) => {
      if (currentId && conversations.some((conversation) => conversation.id === currentId)) {
        return currentId;
      }
      return conversations[0]?.id ?? "";
    });
  }, [conversations]);

  const invalidateLead = () => {
    void queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const leadMutation = useMutation({
    mutationFn: (input: Partial<Lead>) => updateLead(leadId, input),
    onSuccess: invalidateLead,
  });

  const contactMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ContactSummary> }) => updateContact(id, input),
    onSuccess: invalidateLead,
  });

  const customFieldMutation = useMutation({
    mutationFn: (input: { fieldId: string; value: string | null }) => updateLeadCustomField(leadId, input),
    onSuccess: invalidateLead,
  });

  const addTagMutation = useMutation({
    mutationFn: (name: string) => addLeadTag(leadId, { name }),
    onSuccess: invalidateLead,
  });

  const deleteTagMutation = useMutation({
    mutationFn: (tagId: string) => deleteLeadTag(leadId, { tagId }),
    onSuccess: invalidateLead,
  });

  const createTaskMutation = useMutation({
    mutationFn: () => createTask({ leadId, title: "Seguimiento pendiente" }),
    onSuccess: invalidateLead,
  });

  function saveLeadField(input: LeadUpdateInput) {
    leadMutation.mutate(input);
  }

  function saveContactField(input: Partial<ContactSummary>) {
    const contactId = lead?.contact?.id;
    if (!contactId) {
      return;
    }
    contactMutation.mutate({ id: contactId, input });
  }

  function handleAddTag() {
    const name = window.prompt("Nombre del tag");
    if (!name?.trim()) {
      return;
    }
    addTagMutation.mutate(name.trim());
  }

  function handlePipelineChange(nextPipelineId: string) {
    const nextPipeline = pipelines.find((item) => item.id === nextPipelineId);
    const nextStage = [...(nextPipeline?.stages ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
    if (!nextPipeline || !nextStage) {
      return;
    }
    saveLeadField({ pipelineId: nextPipeline.id, stageId: nextStage.id });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{lead?.name ?? "Detalle del lead"}</h2>
            <p className="text-sm text-muted-foreground">{lead ? `#${lead.id}` : "Cargando información"}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="grid flex-1 gap-4 p-5 lg:grid-cols-[minmax(22rem,0.95fr)_minmax(28rem,1.25fr)]">
            <Skeleton className="h-full min-h-96" />
            <Skeleton className="h-full min-h-96" />
          </div>
        ) : isError || !lead ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState title="No se pudo cargar el lead" description="Revisa la API e intenta de nuevo." />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(22rem,0.95fr)_minmax(28rem,1.25fr)]">
            <LeadInfoColumn
              lead={lead}
              pipelines={pipelines}
              stages={stages}
              pipelineId={pipelineId}
              onLeadSave={saveLeadField}
              onPipelineChange={handlePipelineChange}
              onContactSave={saveContactField}
              onCustomFieldSave={(fieldId, value) => customFieldMutation.mutate({ fieldId, value })}
              onAddTag={handleAddTag}
              onDeleteTag={(tagId) => deleteTagMutation.mutate(tagId)}
              onCreateTask={() => createTaskMutation.mutate()}
              isSaving={
                leadMutation.isPending ||
                contactMutation.isPending ||
                customFieldMutation.isPending ||
                addTagMutation.isPending ||
                deleteTagMutation.isPending ||
                createTaskMutation.isPending
              }
            />

            <ChatConversationPanel
              conversation={activeConversation}
              conversations={conversations}
              onConversationChange={setActiveConversationId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LeadInfoColumn({
  lead,
  pipelines,
  stages,
  pipelineId,
  onLeadSave,
  onPipelineChange,
  onContactSave,
  onCustomFieldSave,
  onAddTag,
  onDeleteTag,
  onCreateTask,
  isSaving,
}: {
  lead: Lead;
  pipelines: Pipeline[];
  stages: Stage[];
  pipelineId: string;
  onLeadSave: (input: LeadUpdateInput) => void;
  onPipelineChange: (pipelineId: string) => void;
  onContactSave: (input: Partial<ContactSummary>) => void;
  onCustomFieldSave: (fieldId: string, value: string | null) => void;
  onAddTag: () => void;
  onDeleteTag: (tagId: string) => void;
  onCreateTask: () => void;
  isSaving: boolean;
}) {
  const tags = getLeadTags(lead);
  const customFields = buildCustomFields(lead);
  const contact = lead.contact ?? {};
  const stageId = getLeadStageId(lead);

  return (
    <section className="min-h-0 overflow-y-auto rounded-lg border border-border bg-background/40 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Información</h3>
        {isSaving ? <Badge>Guardando</Badge> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <EditableField label="Nombre" value={lead.name ?? ""} onSave={(value) => onLeadSave({ name: value })} />
        <ReadOnlyField label="#ID" value={lead.id} icon={<Hash className="h-4 w-4" />} />
        <SelectField label="Pipeline" value={pipelineId} onSave={onPipelineChange}>
          {pipelines.map((pipeline) => (
            <option key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Etapa" value={stageId} onSave={(value) => onLeadSave({ stageId: value })}>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </SelectField>
        <EditableField
          label="Responsable"
          value={lead.responsibleUserId ?? lead.responsible_user_id ?? lead.responsible?.id ?? ""}
          onSave={(value) => onLeadSave({ responsibleUserId: value || null })}
        />
        <EditableField
          label="Valor"
          type="number"
          value={getLeadValue(lead)}
          onSave={(value) => onLeadSave({ value: Number(value || 0) })}
        />
        <EditableField label="Fuente" value={lead.source ?? ""} onSave={(value) => onLeadSave({ source: value || null })} />
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <TagIcon className="h-4 w-4" />
            Tags
          </h4>
          <Button size="sm" variant="outline" onClick={onAddTag}>
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Tag key={tag.id ?? tag.name} className="gap-1.5 border-border bg-secondary text-muted-foreground">
                {tag.name}
                {tag.id ? (
                  <button type="button" aria-label={`Quitar ${tag.name}`} onClick={() => onDeleteTag(tag.id ?? "")}>
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </Tag>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin tags</p>
        )}
      </div>

      <DetailSection title="Campos personalizados">
        <div className="grid gap-3 sm:grid-cols-2">
          {customFields.map(({ field, value }) => (
            <CustomFieldEditor
              key={field.id}
              field={field}
              value={value}
              onSave={(nextValue) => onCustomFieldSave(field.id, nextValue)}
            />
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Contacto">
        <div className="grid gap-3 sm:grid-cols-2">
          <EditableField label="Nombre" value={contact.name ?? ""} onSave={(value) => onContactSave({ name: value })} />
          <EditableField
            label="Teléfono"
            value={contact.phone ?? ""}
            onSave={(value) => onContactSave({ phone: value || null })}
            icon={<Phone className="h-4 w-4" />}
          />
          <EditableField
            label="Email"
            type="email"
            value={contact.email ?? ""}
            onSave={(value) => onContactSave({ email: value || null })}
            icon={<Mail className="h-4 w-4" />}
          />
          <EditableField
            label="Usuario canal"
            value={contact.channelUserId ?? contact.channel_user_id ?? ""}
            onSave={(value) => onContactSave({ channelUserId: value || null })}
          />
        </div>
      </DetailSection>

      <DetailSection title="Tareas">
        {(lead.tasks ?? []).length > 0 ? (
          <div className="space-y-2">
            {(lead.tasks ?? []).map((task) => (
              <div key={task.id} className="rounded-md border border-border bg-card/50 p-3">
                <p className="text-sm font-medium">{task.title}</p>
                {task.description ? <p className="mt-1 text-xs text-muted-foreground">{task.description}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <Button variant="outline" onClick={onCreateTask}>
            <ClipboardPlus className="h-4 w-4" />
            Crear tarea
          </Button>
        )}
      </DetailSection>
    </section>
  );
}

function buildCustomFields(lead: Lead) {
  const values = getCustomValues(lead);
  const byFieldId = new Map(values.map((item) => [getFieldId(item), item]));
  const byCode = new Map(values.map((item) => [item.field.code, item]));
  const definitions = new Map<string, CustomFieldDefinition>();

  FALLBACK_CUSTOM_FIELDS.forEach((field) => definitions.set(field.id, field));
  values.forEach((item) => definitions.set(item.field.id, item.field));

  return [...definitions.values()]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((field) => ({
      field,
      value: byFieldId.get(field.id)?.value ?? byCode.get(field.code)?.value ?? "",
    }));
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5 rounded-lg border border-border bg-card/50 p-4">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 text-sm">
        {icon}
        <span className="truncate">{value}</span>
      </span>
    </label>
  );
}

function EditableField({
  label,
  value,
  onSave,
  type = "text",
  icon,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  type?: "text" | "number" | "email" | "date";
  icon?: ReactNode;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit() {
    if (draft !== value) {
      onSave(draft);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
        {icon}
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          type={type}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      </span>
    </label>
  );
}

function SelectField({
  label,
  value,
  onSave,
  children,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(event) => onSave(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function CustomFieldEditor({
  field,
  value,
  onSave,
}: {
  field: CustomFieldDefinition;
  value: string | null;
  onSave: (value: string | null) => void;
}) {
  if (field.type === "select") {
    return (
      <SelectField label={field.label} value={value ?? ""} onSave={(nextValue) => onSave(nextValue || null)}>
        <option value="">Sin valor</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectField>
    );
  }

  return (
    <EditableField
      label={field.label}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={value ?? ""}
      onSave={(nextValue) => onSave(nextValue || null)}
    />
  );
}
