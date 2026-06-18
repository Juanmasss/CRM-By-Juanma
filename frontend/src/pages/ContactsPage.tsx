import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Mail, Phone, Search, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getContact,
  getContacts,
  type ChannelType,
  type ContactSummary,
  type Lead,
  updateContact,
} from "@/lib/api";

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

function getAvatar(contact: ContactSummary) {
  return contact.avatarUrl ?? contact.avatar_url ?? undefined;
}

function getContactDate(contact: ContactSummary) {
  return contact.updatedAt ?? contact.updated_at ?? contact.createdAt ?? contact.created_at ?? "";
}

function getLeadDate(lead: Lead) {
  return lead.updatedAt ?? lead.updated_at ?? lead.lastActivityAt ?? lead.last_activity_at ?? "";
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Sin actividad";
  }
  const date = new Date(value);
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

function formatMoney(value: Lead["value"]) {
  const amount = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? Number(amount) : 0);
}

function getLeadName(lead: Lead) {
  return lead.name ?? lead.title ?? "Lead sin nombre";
}

function countLeads(contact: ContactSummary) {
  return contact._count?.leads ?? contact.leads?.length ?? 0;
}

function getLastActivity(contact: ContactSummary) {
  const dates = [
    getContactDate(contact),
    ...(contact.leads ?? []).map(getLeadDate),
    ...(contact.conversations ?? []).map((conversation) => conversation.lastMessageAt ?? conversation.last_message_at ?? ""),
  ].filter(Boolean);
  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? "";
}

function buildTimeline(contact: ContactSummary) {
  return [
    ...(contact.conversations ?? []).map((conversation) => ({
      id: `conversation-${conversation.id}`,
      title: `Conversación ${conversation.channel?.name ?? "sin canal"}`,
      description: conversation.mode ? `Modo ${conversation.mode}` : conversation.status ?? "open",
      at: conversation.lastMessageAt ?? conversation.last_message_at ?? "",
    })),
    ...(contact.leads ?? []).map((lead) => ({
      id: `lead-${lead.id}`,
      title: getLeadName(lead),
      description: `${lead.stage?.name ?? "Sin etapa"} · ${formatMoney(lead.value)}`,
      at: getLeadDate(lead),
    })),
  ]
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function ContactsPage() {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<ChannelType | "all">("all");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const {
    data: contacts = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["contacts", search],
    queryFn: () => getContacts({ search }),
    refetchInterval: 15_000,
  });

  const filteredContacts = useMemo(() => {
    if (channel === "all") {
      return contacts;
    }
    return contacts.filter((contact) => contact.channel === channel);
  }, [channel, contacts]);

  return (
    <div className="space-y-6">
      <PageHeader title="Contactos" description="Directorio de clientes y conversaciones" />

      <Card className="space-y-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, teléfono o email"
            />
          </label>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={channel}
            onChange={(event) => setChannel(event.target.value as ChannelType | "all")}
          >
            <option value="all">Todos los canales</option>
            {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState title="No se pudieron cargar los contactos" description="Revisa la API e intenta de nuevo." />
        ) : filteredContacts.length === 0 ? (
          <EmptyState title="Sin contactos" description="Ajusta la búsqueda o el filtro de canal." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-medium">Contacto</th>
                  <th className="px-3 py-3 font-medium">Teléfono</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Canal</th>
                  <th className="px-3 py-3 font-medium">Empresa</th>
                  <th className="px-3 py-3 text-right font-medium">Leads</th>
                  <th className="px-3 py-3 font-medium">Última actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="cursor-pointer hover:bg-accent/40"
                    onClick={() => contact.id && setSelectedContactId(contact.id)}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={contact.name ?? "Contacto"} src={getAvatar(contact)} />
                        <span className="font-medium">{contact.name ?? "Sin nombre"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{contact.phone ?? "Sin teléfono"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{contact.email ?? "Sin email"}</td>
                    <td className="px-3 py-3">
                      {contact.channel ? <Badge>{CHANNEL_LABELS[contact.channel]}</Badge> : "Sin canal"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{contact.company?.name ?? "Sin empresa"}</td>
                    <td className="px-3 py-3 text-right font-medium">{countLeads(contact)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(getLastActivity(contact))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedContactId ? (
        <ContactDetailPanel contactId={selectedContactId} onClose={() => setSelectedContactId(null)} />
      ) : null}
    </div>
  );
}

function ContactDetailPanel({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: contact, isLoading, isError } = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => getContact(contactId),
  });
  const updateMutation = useMutation({
    mutationFn: (input: Partial<ContactSummary>) => updateContact(contactId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4">
      <div className="ml-auto flex h-full w-full max-w-5xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/60">
        <PanelHeader title={contact?.name ?? "Detalle del contacto"} subtitle={contact?.company?.name} onClose={onClose} />
        {isLoading ? (
          <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[0.8fr_1.2fr]">
            <Skeleton className="h-full" />
            <Skeleton className="h-full" />
          </div>
        ) : isError || !contact ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState title="No se pudo cargar el contacto" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[0.8fr_1.2fr]">
            <section className="overflow-y-auto rounded-lg border border-border bg-background/40 p-4">
              <div className="mb-4 flex items-center gap-3">
                <Avatar name={contact.name ?? "Contacto"} src={getAvatar(contact)} className="h-12 w-12" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{contact.name ?? "Sin nombre"}</p>
                  <p className="text-xs text-muted-foreground">#{contact.id}</p>
                </div>
              </div>
              <div className="grid gap-3">
                <EditableField label="Nombre" value={contact.name ?? ""} onSave={(name) => updateMutation.mutate({ name })} />
                <EditableField label="Teléfono" value={contact.phone ?? ""} icon={<Phone className="h-4 w-4" />} onSave={(phone) => updateMutation.mutate({ phone: phone || null })} />
                <EditableField label="Email" type="email" value={contact.email ?? ""} icon={<Mail className="h-4 w-4" />} onSave={(email) => updateMutation.mutate({ email: email || null })} />
                <SelectField label="Canal" value={contact.channel ?? ""} onSave={(value) => updateMutation.mutate({ channel: (value || null) as ChannelType | null })}>
                  <option value="">Sin canal</option>
                  {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </SelectField>
                <EditableField label="Usuario canal" value={contact.channelUserId ?? contact.channel_user_id ?? ""} onSave={(channelUserId) => updateMutation.mutate({ channelUserId: channelUserId || null })} />
              </div>
            </section>

            <section className="min-h-0 overflow-y-auto rounded-lg border border-border bg-background/40 p-4">
              <DetailBlock title="Timeline de actividades" icon={<Clock3 className="h-4 w-4" />}>
                <Timeline items={buildTimeline(contact)} />
              </DetailBlock>
              <DetailBlock title="Leads asociados">
                <div className="space-y-2">
                  {(contact.leads ?? []).map((lead) => (
                    <div key={lead.id} className="rounded-md border border-border bg-card/50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{getLeadName(lead)}</p>
                        <Badge>{lead.stage?.name ?? "Sin etapa"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{formatMoney(lead.value)}</p>
                    </div>
                  ))}
                  {(contact.leads ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Sin leads asociados.</p> : null}
                </div>
              </DetailBlock>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelHeader({ title, subtitle, onClose }: { title: string; subtitle?: string | null; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function DetailBlock({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3>
      {children}
    </div>
  );
}

function Timeline({ items }: { items: Array<{ id: string; title: string; description: string; at: string }> }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin actividades recientes.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="border-l border-primary/40 pl-3">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
          <p className="mt-1 text-xs text-primary">{formatDate(item.at)}</p>
        </div>
      ))}
    </div>
  );
}

function EditableField({ label, value, onSave, type = "text", icon }: { label: string; value: string; onSave: (value: string) => void; type?: "text" | "email"; icon?: ReactNode }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
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
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" type={type} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={handleKeyDown} />
      </span>
    </label>
  );
}

function SelectField({ label, value, onSave, children }: { label: string; value: string; onSave: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onSave(event.target.value)}>
        {children}
      </select>
    </label>
  );
}
