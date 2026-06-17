import { Outlet } from "react-router-dom";

// Sidebar placeholder — la navegación real llega en una tarea posterior (frontend = CODEX).
export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card px-4 py-5">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="h-7 w-7 rounded-md bg-primary" />
          <span className="text-sm font-semibold tracking-tight">CRM by Juanma</span>
        </div>
        <nav className="flex flex-col gap-1 text-sm text-muted-foreground">
          {/* TODO: navegación (Leads, Contactos, Chat, Reportes, Bots…) */}
          <span className="rounded-md px-2 py-1.5">Navegación (placeholder)</span>
        </nav>
      </aside>

      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
