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
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
            defaultValue=""
            aria-label="Pipeline"
          >
            <option value="" disabled>
              Pipeline
            </option>
          </select>

          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-input bg-secondary pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              placeholder="Buscar leads, contactos o empresas"
              type="search"
            />
          </div>

          <Button className="ml-auto">
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
    </div>
  );
}
