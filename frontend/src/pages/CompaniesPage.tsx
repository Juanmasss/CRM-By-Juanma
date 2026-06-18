import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Clock3, Mail, Phone, Search, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCompanies,
  getCompany,
  type CompanySummary,
  type ContactSummary,
  type Lead,
  updateCompany,
} from "@/lib/api";

function toAmount(value: Lead["value"]) {
  const amount = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(amount) ? Number(amount) : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
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

function getLeadName(lead: Lead) {
  return lead.name ?? lead.title ?? "Lead sin nombre";
}

function getLeadDate(lead: Lead) {
  return lead.updatedAt ?? lead.updated_at ?? lead.lastActivityAt ?? lead.last_activity_at ?? "";
}

function getCompanyDate(company: CompanySummary) {
  return company.updatedAt ?? company.updated_at ?? company.createdAt ?? company.created_at ?? "";
}

function countContacts(company: CompanySummary) {
  return company._count?.contacts ?? company.contacts?.length ?? 0;
}

function countDeals(company: CompanySummary) {
  return company._count?.leads ?? company.leads?.length ?? 0;
}

function getTotalValue(company: CompanySummary) {
  const aggregateValue = company.totalValue ?? company.total_value ?? company.dealsValue ?? company.deals_value;
  if (aggregateValue !== undefined && aggregateValue !== null) {
    const value = typeof aggregateValue === "string" ? Number(aggregateValue) : aggregateValue;
    return Number.isFinite(value) ? Number(value) : 0;
  }
  return (company.leads ?? []).reduce((sum, lead) => sum + toAmount(lead.value), 0);
}

function getLastActivity(company: CompanySummary) {
  const dates = [
    getCompanyDate(company),
    ...(company.leads ?? []).map(getLeadDate),
    ...(company.contacts ?? []).map((contact) => contact.updatedAt ?? contact.updated_at ?? contact.createdAt ?? contact.created_at ?? ""),
  ].filter(Boolean);
  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? "";
}

function buildTimeline(company: CompanySummary) {
  return [
    ...(company.contacts ?? []).map((contact) => ({
      id: `contact-${contact.id}`,
      title: contact.name ?? "Contacto sin nombre",
      description: contact.email ?? contact.phone ?? "Contacto asociado",
      at: contact.updatedAt ?? contact.updated_at ?? contact.createdAt ?? contact.created_at ?? "",
    })),
    ...(company.leads ?? []).map((lead) => ({
      id: `lead-${lead.id}`,
      title: getLeadName(lead),
      description: `${lead.stage?.name ?? "Sin etapa"} · ${formatMoney(toAmount(lead.value))}`,
      at: getLeadDate(lead),
    })),
  ]
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const { data: companies = [], isLoading, isError } = useQuery({
    queryKey: ["companies", search],
    queryFn: () => getCompanies({ search }),
    refetchInterval: 15_000,
  });

  const sortedCompanies = useMemo(() => companies, [companies]);

  return (
    <div className="space-y-6">
      <PageHeader title="Empresas" description="Cuentas, contactos y valor comercial asociado" />

      <Card className="space-y-4 p-4">
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, teléfono o email"
          />
        </label>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState title="No se pudieron cargar las empresas" description="Revisa la API e intenta de nuevo." />
        ) : sortedCompanies.length === 0 ? (
          <EmptyState title="Sin empresas" description="Ajusta la búsqueda para ver más resultados." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-medium">Empresa</th>
                  <th className="px-3 py-3 text-right font-medium">Contactos</th>
                  <th className="px-3 py-3 text-right font-medium">Deals</th>
                  <th className="px-3 py-3 text-right font-medium">Valor total</th>
                  <th className="px-3 py-3 font-medium">Última actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedCompanies.map((company) => (
                  <tr
                    key={company.id}
                    className="cursor-pointer hover:bg-accent/40"
                    onClick={() => setSelectedCompanyId(company.id)}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-medium">{company.name}</p>
                          <p className="text-xs text-muted-foreground">{company.email ?? company.phone ?? "Sin contacto"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium">{countContacts(company)}</td>
                    <td className="px-3 py-3 text-right font-medium">{countDeals(company)}</td>
                    <td className="px-3 py-3 text-right font-medium">{formatMoney(getTotalValue(company))}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(getLastActivity(company))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedCompanyId ? (
        <CompanyDetailPanel companyId={selectedCompanyId} onClose={() => setSelectedCompanyId(null)} />
      ) : null}
    </div>
  );
}

function CompanyDetailPanel({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: company, isLoading, isError } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => getCompany(companyId),
  });
  const updateMutation = useMutation({
    mutationFn: (input: Partial<CompanySummary>) => updateCompany(companyId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4">
      <div className="ml-auto flex h-full w-full max-w-6xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{company?.name ?? "Detalle de empresa"}</h2>
            <p className="text-sm text-muted-foreground">{company ? `${countContacts(company)} contactos · ${countDeals(company)} deals` : "Cargando"}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[0.75fr_1.25fr]">
            <Skeleton className="h-full" />
            <Skeleton className="h-full" />
          </div>
        ) : isError || !company ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState title="No se pudo cargar la empresa" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[0.75fr_1.25fr]">
            <section className="overflow-y-auto rounded-lg border border-border bg-background/40 p-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{company.name}</p>
                  <p className="text-xs text-muted-foreground">#{company.id}</p>
                </div>
              </div>
              <div className="grid gap-3">
                <EditableField label="Nombre" value={company.name} onSave={(name) => updateMutation.mutate({ name })} />
                <EditableField label="Teléfono" value={company.phone ?? ""} icon={<Phone className="h-4 w-4" />} onSave={(phone) => updateMutation.mutate({ phone: phone || null })} />
                <EditableField label="Email" type="email" value={company.email ?? ""} icon={<Mail className="h-4 w-4" />} onSave={(email) => updateMutation.mutate({ email: email || null })} />
                <EditableField label="Sitio web" value={company.website ?? ""} onSave={(website) => updateMutation.mutate({ website: website || null })} />
                <EditableField label="Dirección" value={company.address ?? ""} onSave={(address) => updateMutation.mutate({ address: address || null })} />
              </div>
            </section>

            <section className="min-h-0 overflow-y-auto rounded-lg border border-border bg-background/40 p-4">
              <DetailBlock title="Contactos">
                <div className="grid gap-2 md:grid-cols-2">
                  {(company.contacts ?? []).map((contact) => (
                    <ContactCard key={contact.id ?? contact.name} contact={contact} />
                  ))}
                  {(company.contacts ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Sin contactos asociados.</p> : null}
                </div>
              </DetailBlock>
              <DetailBlock title="Leads">
                <div className="space-y-2">
                  {(company.leads ?? []).map((lead) => (
                    <div key={lead.id} className="rounded-md border border-border bg-card/50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{getLeadName(lead)}</p>
                        <Badge>{lead.stage?.name ?? "Sin etapa"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{formatMoney(toAmount(lead.value))}</p>
                    </div>
                  ))}
                  {(company.leads ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Sin leads asociados.</p> : null}
                </div>
              </DetailBlock>
              <DetailBlock title="Actividades" icon={<Clock3 className="h-4 w-4" />}>
                <Timeline items={buildTimeline(company)} />
              </DetailBlock>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactCard({ contact }: { contact: ContactSummary }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="flex items-center gap-3">
        <Avatar name={contact.name ?? "Contacto"} src={contact.avatarUrl ?? contact.avatar_url ?? undefined} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{contact.name ?? "Sin nombre"}</p>
          <p className="truncate text-xs text-muted-foreground">{contact.email ?? contact.phone ?? "Sin datos"}</p>
        </div>
      </div>
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
