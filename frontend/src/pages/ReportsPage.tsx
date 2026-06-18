import { useQuery } from "@tanstack/react-query";
import { Award, BarChart3, RefreshCw, Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type ReactNode, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPipelines,
  getReports,
  type ReportsMonthPoint,
  type ReportsResponse,
  type ReportsSalesRankingPoint,
  type ReportsStagePoint,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const WIN_LOSS_COLORS = {
  won: "#22c55e",
  lost: "#ef4444",
};

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(normalized)}%`;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultFromDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 11);
  date.setDate(1);
  return isoDate(date);
}

function getRevenueSeries(data: ReportsResponse) {
  const points = data.revenue_by_month ?? data.revenueByMonth ?? [];
  return points.map((point: ReportsMonthPoint) => ({
    month: point.label ?? point.month ?? "",
    revenue: toNumber(point.revenue ?? point.amount ?? point.value),
  }));
}

function getConversionSeries(data: ReportsResponse) {
  const points = data.conversion_by_stage ?? data.conversionByStage ?? [];
  const maxCount = Math.max(...points.map((point) => toNumber(point.count)), 1);
  return points.map((point: ReportsStagePoint, index) => ({
    name: point.name,
    count: toNumber(point.count),
    conversion: toNumber(point.conversion),
    fill: index % 2 === 0 ? "#8b5cf6" : "#a78bfa",
    displayValue: Math.max(toNumber(point.count), maxCount * 0.06),
  }));
}

function getRanking(data: ReportsResponse) {
  return [...(data.sales_ranking ?? data.salesRanking ?? [])]
    .map((item: ReportsSalesRankingPoint) => ({
      id: item.userId ?? item.user_id ?? item.name,
      name: item.name,
      wonLeads: toNumber(item.wonLeads ?? item.won_leads),
      revenue: toNumber(item.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.wonLeads - a.wonLeads);
}

function getWinLoss(data: ReportsResponse) {
  const winLoss = data.win_loss ?? data.winLoss ?? {};
  const won = toNumber(winLoss.won);
  const lost = toNumber(winLoss.lost);
  return {
    won,
    lost,
    winRate: toNumber(winLoss.winRate ?? winLoss.win_rate),
    reasons: winLoss.reasons ?? [],
    chart: [
      { name: "Ganados", status: "won", value: won },
      { name: "Perdidos", status: "lost", value: lost },
    ].filter((item) => item.value > 0),
  };
}

function getAvgCycle(data: ReportsResponse) {
  const cycle = data.avg_cycle_time ?? data.avgCycleTime;
  return {
    days: toNumber(cycle?.days),
    sample: toNumber(cycle?.sample),
  };
}

function CustomTooltip({
  active,
  payload,
  label,
  valueFormatter = formatNumber,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string }>;
  label?: string;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-xl shadow-black/30">
      {label ? <p className="mb-1 text-xs text-muted-foreground">{label}</p> : null}
      {payload.map((item) => (
        <p key={`${item.name}-${item.value}`} className="text-sm font-medium">
          {item.name ?? "Valor"}: {valueFormatter(toNumber(item.value))}
        </p>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  helper,
  children,
  className,
}: {
  title: string;
  helper?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-h-80 p-0", className)}>
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      <div className="h-72 p-4">{children}</div>
    </Card>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

export function ReportsPage() {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [pipelineId, setPipelineId] = useState("");

  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines"],
    queryFn: getPipelines,
    staleTime: 60_000,
  });

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["reports", from, to, pipelineId],
    queryFn: () => getReports({ from, to, pipelineId: pipelineId || undefined }),
    refetchInterval: 30_000,
  });

  const revenueSeries = data ? getRevenueSeries(data) : [];
  const conversionSeries = data ? getConversionSeries(data) : [];
  const ranking = data ? getRanking(data) : [];
  const winLoss = data ? getWinLoss(data) : { won: 0, lost: 0, winRate: 0, reasons: [], chart: [] };
  const avgCycle = data ? getAvgCycle(data) : { days: 0, sample: 0 };

  const totalRevenue = useMemo(
    () => revenueSeries.reduce((sum, item) => sum + item.revenue, 0),
    [revenueSeries],
  );
  const totalStageLeads = useMemo(
    () => conversionSeries.reduce((sum, item) => sum + item.count, 0),
    [conversionSeries],
  );
  const bestSeller = ranking[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Análisis interactivo de ventas por periodo y pipeline"
        actions={
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Actualizar
          </Button>
        }
      />

      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Desde</span>
          <input
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Hasta</span>
          <input
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Pipeline</span>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={pipelineId}
            onChange={(event) => setPipelineId(event.target.value)}
          >
            <option value="">Pipeline principal</option>
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            setFrom(defaultFromDate());
            setTo(isoDate(new Date()));
            setPipelineId("");
          }}
        >
          Limpiar
        </Button>
      </Card>

      {isLoading ? (
        <ReportsSkeleton />
      ) : isError || !data ? (
        <EmptyState title="No se pudieron cargar los reportes" description="Revisa la API e intenta de nuevo." />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Revenue del periodo"
              value={formatMoney(totalRevenue)}
              helper={`${revenueSeries.length} meses analizados`}
              trend="Ventas ganadas"
            />
            <StatCard
              label="Conversión ganados"
              value={formatPercent(winLoss.winRate)}
              helper={`${formatNumber(winLoss.won)} ganados · ${formatNumber(winLoss.lost)} perdidos`}
              trend="Cerrados"
            />
            <StatCard
              label="Leads en embudo"
              value={formatNumber(totalStageLeads)}
              helper={`${conversionSeries.length} etapas`}
              trend="Distribución"
            />
            <StatCard
              label="Ciclo promedio"
              value={`${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(avgCycle.days)} d`}
              helper={`${formatNumber(avgCycle.sample)} cierres en muestra`}
              trend="Promedio"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <ChartCard title="Revenue por mes" helper="Leads ganados cerrados en el periodo">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueSeries} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                  <YAxis
                    tickFormatter={formatMoney}
                    tickLine={false}
                    axisLine={false}
                    width={78}
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  />
                  <Tooltip content={<CustomTooltip valueFormatter={formatMoney} />} />
                  <Bar dataKey="revenue" name="Revenue" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Ganados vs perdidos" helper="Resultado de deals cerrados">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomTooltip />} />
                  <Pie
                    data={winLoss.chart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="56%"
                    outerRadius="82%"
                    paddingAngle={4}
                    stroke="hsl(var(--card))"
                    strokeWidth={3}
                  >
                    {winLoss.chart.map((item) => (
                      <Cell
                        key={item.status}
                        fill={item.status === "won" ? WIN_LOSS_COLORS.won : WIN_LOSS_COLORS.lost}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <ChartCard title="Embudo de conversión" helper="Distribución actual por etapa">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip content={<CustomTooltip />} />
                  <Funnel data={conversionSeries} dataKey="displayValue" nameKey="name" isAnimationActive>
                    <LabelList
                      position="right"
                      dataKey="name"
                      fill="#d4d4d8"
                      stroke="none"
                      fontSize={12}
                    />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card className="p-0">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold">Ranking comercial</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Asesores ordenados por revenue ganado</p>
                </div>
                <Award className="h-5 w-5 text-primary" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-medium">Asesor</th>
                      <th className="px-5 py-3 text-right font-medium">Ganados</th>
                      <th className="px-5 py-3 text-right font-medium">Revenue</th>
                      <th className="px-5 py-3 text-right font-medium">Participación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ranking.map((row) => (
                      <tr key={row.id}>
                        <td className="px-5 py-3 font-medium">{row.name}</td>
                        <td className="px-5 py-3 text-right">{formatNumber(row.wonLeads)}</td>
                        <td className="px-5 py-3 text-right">{formatMoney(row.revenue)}</td>
                        <td className="px-5 py-3 text-right">
                          {totalRevenue > 0 ? formatPercent(row.revenue / totalRevenue) : "0%"}
                        </td>
                      </tr>
                    ))}
                    {ranking.length === 0 ? (
                      <tr>
                        <td className="px-5 py-8 text-center text-muted-foreground" colSpan={4}>
                          Sin ventas ganadas en el periodo.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Pérdidas por etapa</h2>
              </div>
              <div className="space-y-3">
                {winLoss.reasons.map((reason) => {
                  const count = toNumber(reason.count);
                  const width = winLoss.lost > 0 ? Math.max((count / winLoss.lost) * 100, 4) : 0;
                  return (
                    <div key={reason.reason}>
                      <div className="mb-1 flex justify-between gap-3 text-sm">
                        <span>{reason.reason}</span>
                        <span className="text-muted-foreground">{formatNumber(count)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary">
                        <div className="h-2 rounded-full bg-destructive" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
                {winLoss.reasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin pérdidas registradas en el periodo.</p>
                ) : null}
              </div>
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Resumen ejecutivo</h2>
              </div>
              <div className="grid gap-3 text-sm">
                <SummaryRow label="Mejor asesor" value={bestSeller?.name ?? "Sin datos"} />
                <SummaryRow label="Revenue mejor asesor" value={bestSeller ? formatMoney(bestSeller.revenue) : "$0"} />
                <SummaryRow label="Deals cerrados" value={formatNumber(winLoss.won + winLoss.lost)} />
                <SummaryRow label="Pipeline analizado" value={pipelineId ? "Seleccionado" : "Principal"} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
