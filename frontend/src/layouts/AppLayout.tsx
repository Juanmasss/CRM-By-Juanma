import {
  BarChart3,
  Bot,
  Building2,
  CalendarCheck2,
  Home,
  MessageSquare,
  Plus,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { NavLink, Outlet, useSearchParams } from "react-router-dom";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { createLead, getPipelines, type Pipeline, type Stage } from "@/lib/api";
import { cn } from "@/lib/utils";

const routes = [
  { label: "Inicio", to: "/", icon: Home },
  { label: "Leads", to: "/leads", icon: UsersRound },
  { label: "Contactos", to: "/contacts", icon: UserRound },
  { label: "Empresas", to: "/companies", icon: Building2 },
  { label: "Actividades", to: "/activities", icon: CalendarCheck2 },
  { label: "Reportes", to: "/reports", icon: BarChart3 },
  { label: "Bots", to: "/bots", icon: Bot },
  { label: "Chat", to: "/chat", icon: MessageSquare },
];

export function AppLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPipelineId = searchParams.get("pipelineId") ?? "";
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ["pipelines"],
    queryFn: getPipelines,
    staleTime: 30_000,
  });

  function handlePipelineChange(pipelineId: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("pipelineId", pipelineId);
    setSearchParams(nextParams);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border/80 bg-card/95 px-4 py-5 backdrop-blur">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30">
            CJ
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">CRM by Juanma</p>
            <p className="text-xs text-muted-foreground">Analitica comercial</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 text-sm">
          {routes.map((route) => (
            <NavLink
              key={route.to}
              to={route.to}
              end={route.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-primary/15 text-primary ring-1 ring-primary/20",
                )
              }
            >
              <route.icon className="h-4 w-4" />
              <span>{route.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="rounded-lg border border-border bg-secondary/40 p-3">
          <div className="flex items-center gap-3">
            <Avatar name="Juanma" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Juanma</p>
              <p className="truncate text-xs text-muted-foreground">Administrador</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/70 bg-background/85 px-6 backdrop-blur">
          <select
            className="h-9 rounded-md border border-input bg-secondary px-3 text-sm text-foreground outline-none ring-offset-background transition focus:ring-2 focus:ring-ring"
            value={selectedPipelineId}
            onChange={(event) => handlePipelineChange(event.target.value)}
            aria-label="Pipeline"
            disabled={isLoading || pipelines.length === 0}
          >
            <option value="">
              {isLoading ? "Cargando pipelines" : "Pipeline"}
            </option>
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>

          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-input bg-secondary pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              placeholder="Buscar leads, contactos o empresas"
              type="search"
            />
          </div>

          <Button className="ml-auto" onClick={() => setIsCreateLeadOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo lead
          </Button>
        </header>

        <main className="min-h-[calc(100vh-4rem)] overflow-auto p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      {isCreateLeadOpen ? (
        <CreateLeadModal
          pipelines={pipelines}
          defaultPipelineId={selectedPipelineId || pipelines[0]?.id || ""}
          onClose={() => setIsCreateLeadOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CreateLeadModal({
  pipelines,
  defaultPipelineId,
  onClose,
}: {
  pipelines: Pipeline[];
  defaultPipelineId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [pipelineId, setPipelineId] = useState(defaultPipelineId);

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0] ?? null;
  const stages: Stage[] = selectedPipeline?.stages ?? [];
  const defaultStage = stages.find((s) => s.type === "incoming") ?? stages[0] ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      createLead({
        name: name.trim(),
        pipelineId,
        stageId: defaultStage?.id,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !pipelineId) return;
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Nuevo lead</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Nombre del lead *</span>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ej: Juan García — Cotización ropa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Pipeline *</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              required
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          {defaultStage ? (
            <p className="text-xs text-muted-foreground">
              Se creará en la etapa <span className="font-medium text-foreground">{defaultStage.name}</span>.
            </p>
          ) : null}

          {mutation.isError ? (
            <p className="text-sm text-destructive">Error al crear el lead. Intenta de nuevo.</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!name.trim() || !pipelineId || mutation.isPending}>
              {mutation.isPending ? "Creando…" : "Crear lead"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
