import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { getHealth } from "@/lib/api";

export function HomePage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: false,
  });

  const connected = data?.ok === true;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CRM by Juanma</h1>
        <p className="mt-1 text-sm text-muted-foreground">Estado de la conexión con la API.</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Comprobando la API…</p>
        ) : connected ? (
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="text-base font-medium">API conectada</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            <span className="text-base font-medium">
              {isError ? "No se pudo conectar con la API" : "API sin respuesta"}
            </span>
          </div>
        )}
      </div>

      <div>
        <Button onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Comprobando…" : "Reintentar"}
        </Button>
      </div>
    </div>
  );
}
