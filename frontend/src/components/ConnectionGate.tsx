import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, LogOut, MessageCircle, QrCode, RefreshCw } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { connectWhatsapp, disconnectWhatsapp, getWhatsappConnection } from "@/lib/api";

export function ConnectionGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isFetching } = useQuery({
    queryKey: ["whatsapp-connection"],
    queryFn: getWhatsappConnection,
    // Mientras no esté conectado, refrescamos rápido (para ver el QR / estado al instante);
    // ya conectado, no hace falta machacar tan seguido.
    refetchInterval: (query) => (query.state.data?.connected ? 10_000 : 2_000),
  });

  const connection = data ?? { connected: false, phoneNumber: null, qrPng: null, awaitingQr: false };

  const connectMutation = useMutation({
    mutationFn: connectWhatsapp,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectWhatsapp,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
  });

  function handleDisconnect() {
    if (!window.confirm("¿Desconectar WhatsApp de este CRM?")) {
      return;
    }
    disconnectMutation.mutate();
  }

  if (!connection.connected) {
    const hasQr = Boolean(connection.qrPng);
    const generating = connection.awaitingQr || connectMutation.isPending;

    return (
      <div className="space-y-6">
        <ConnectionHeader isFetching={isFetching} />
        <Card className="mx-auto grid max-w-5xl gap-8 p-6 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(22rem,1.1fr)] lg:p-8">
          <div className="flex min-h-96 items-center justify-center rounded-lg border border-border bg-background/60 p-5">
            {hasQr ? (
              <img
                className="aspect-square w-full max-w-sm rounded-lg border border-border bg-white p-4"
                src={connection.qrPng ?? undefined}
                alt="QR para conectar WhatsApp"
              />
            ) : generating ? (
              <div className="flex aspect-square w-full max-w-sm flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
                <Loader2 className="h-14 w-14 animate-spin text-primary" />
                <p className="mt-4 text-sm font-medium">Generando QR…</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  En unos segundos aparecerá el código para escanear.
                </p>
              </div>
            ) : (
              <div className="flex aspect-square w-full max-w-sm flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
                <QrCode className="h-14 w-14 text-primary" />
                <p className="mt-4 text-sm font-medium">Sin QR activo</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pulsa «Generar QR» para iniciar la vinculación.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Conectar WhatsApp</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Escanea el QR desde la cuenta de WhatsApp que atenderá las conversaciones del CRM.
            </p>
            <ol className="mt-6 space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  1
                </span>
                Abre WhatsApp en tu teléfono.
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  2
                </span>
                Ve a WhatsApp &gt; Dispositivos vinculados &gt; Vincular dispositivo.
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  3
                </span>
                Escanea este código. El chat abrirá automáticamente cuando la conexión esté lista.
              </li>
            </ol>

            <div className="mt-6">
              <Button onClick={() => connectMutation.mutate()} disabled={generating}>
                <RefreshCw className={generating ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {hasQr ? "Generar nuevo QR" : generating ? "Generando…" : "Generar QR"}
              </Button>
            </div>

            <div className="mt-4 rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
              {hasQr
                ? "El QR es válido por unos 5 minutos. Si caduca, pulsa «Generar nuevo QR»."
                : "El código se genera solo cuando lo pides, para no consumir recursos."}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/85 px-4 py-3 shadow-2xl shadow-black/20 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">WhatsApp conectado</p>
            <p className="truncate text-xs text-muted-foreground">
              {connection.phoneNumber ? `Número: ${connection.phoneNumber}` : "Número conectado no disponible"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleDisconnect}
          disabled={disconnectMutation.isPending}
        >
          <LogOut className="h-4 w-4" />
          Desconectar
        </Button>
      </div>
      {children}
    </div>
  );
}

function ConnectionHeader({ isFetching }: { isFetching: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conexión de WhatsApp Web por QR</p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
        Polling 2s
      </div>
    </div>
  );
}
