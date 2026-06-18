import { useQuery } from "@tanstack/react-query";
import { Activity, BadgePercent, CircleDollarSign, RefreshCw, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDashboard,
  type DashboardMonthPoint,
  type DashboardResponse,
  type DashboardStagePoint,
  type DashboardStatusPoint,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  won: "#22c55e",
  open: "#8b5cf6",
  lost: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  won: "Ganados",
  open: "Abiertos",
  lost: "Perdidos",
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

function getMetricValue(metric: unknown, keys: string[] = ["value", "total", "count"]) {
  if (typeof metric !== "object" || metric === null) {
    return toNumber(metric);
  }
  const record = metric as Record<string, unknown>;
  const key = keys.find((item) => record[item] !== undefined);
  return key ? toNumber(record[key]) : 0;
}

function getMetricChange(metric: unknown) {
  if (typeof metric !== "object" || metric === null) {
    return null;
  }
  const record = metric as Record<string, unknown>;
  const value =
    record.change ?? record.variation ?? record.variationPercent ?? record.variation_percent ?? null;
  return value === null || value === undefined ? null : toNumber(value);
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
  return `${normalized >= 0 ? "+" : ""}${new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 1,
  }).format(normalized)}%`;
}

function formatCloseRate(value: number) {
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(normalized)}%`;
}

function trendLabel(change: number | null) {
  return change === null ? "En vivo" : formatPercent(change);
}

function getRevenueTotal(data: DashboardResponse) {
  return getMetricValue(data.revenue_total ?? data.revenueTotal);
}

function getDealsCount(data: DashboardResponse) {
  return getMetricValue(data.deals_in_pipeline ?? data.dealsInPipeline, ["count", "total", "value"]);
}

function getDealsValue(data: DashboardResponse) {
  return getMetricValue(data.deals_in_pipeline ?? data.dealsInPipeline, ["value", "total", "count"]);
}

function getCloseRate(data: DashboardResponse) {
  return getMetricValue(data.close_rate ?? data.closeRate);
}

function getActivitiesToday(data: DashboardResponse) {
  return getMetricValue(data.activities_today ?? data.activitiesToday, ["total", "count", "value"]);
}

function getActivitiesHelper(data: DashboardResponse) {
  const source = data.activities_today ?? data.activitiesToday;
  if (typeof source !== "object" || source === null) {
    return "Tareas y mensajes de hoy";
  }
  const record = source as Record<string, unknown>;
  return `${formatNumber(toNumber(record.tasks))} tareas · ${formatNumber(toNumber(record.messages))} mensajes`;
}

function getRevenueSeries(data: DashboardResponse) {
  const points = data.revenue_by_month ?? data.revenueByMonth ?? [];
  return points.map((point: DashboardMonthPoint) => ({
    month: point.label ?? point.month ?? "",
    revenue: toNumber(point.revenue ?? point.amount ?? point.value),
  }));
}

function getStageSeries(data: DashboardResponse) {
  const source = data.leads_by_stage ?? data.leadsByStage ?? [];
  const stages = Array.isArray(source) ? source : source.stages ?? [];
  return stages.map((stage: DashboardStagePoint) => ({
    name: stage.name ?? stage.stage ?? "Etapa",
    leads: toNumber(stage.count ?? stage.leads),
    value: toNumber(stage.value),
    color: stage.color ?? "#8b5cf6",
  }));
}

function getStatusSeries(data: DashboardResponse) {
  const source =
    data.lead_status ?? data.leadStatus ?? data.status_breakdown ?? data.statusBreakdown ?? null;
  if (source?.length) {
    return source.map((item: DashboardStatusPoint) => {
      const status = item.status ?? item.name ?? "open";
      return {
        name: STATUS_LABELS[status] ?? item.name ?? status,
        status,
        value: toNumber(item.count ?? item.value),
      };
    });
  }

  const open = toNumber(data.open ?? getDealsCount(data));
  const won = toNumber(data.won);
  const lost = toNumber(data.lost);
  return [
    { name: STATUS_LABELS.won, status: "won", value: won },
    { name: STATUS_LABELS.open, status: "open", value: open },
    { name: STATUS_LABELS.lost, status: "lost", value: lost },
  ].filter((item) => item.value > 0);
}

function chartMoneyTick(value: number) {
  return formatMoney(value).replace(",00", "");
}

function CustomTooltip({
  active,
  payload,
  label,
  valueFormatter = formatNumber,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string; payload?: Record<string, unknown> }>;
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
  children: React.ReactNode;
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

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.9fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export function HomePage() {
  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    refetchInterval: 15_000,
  });

  const revenueSeries = data ? getRevenueSeries(data) : [];
  const stageSeries = data ? getStageSeries(data) : [];
  const statusSeries = data ? getStatusSeries(data) : [];
  const statusTotal = statusSeries.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        description="Indicadores comerciales en tiempo real"
        actions={
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Actualizar
          </Button>
        }
      />

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar el dashboard" description="Revisa la API e intenta de nuevo." />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Revenue total"
              value={formatMoney(getRevenueTotal(data))}
              helper="Ventas ganadas acumuladas"
              trend={trendLabel(getMetricChange(data.revenue_total ?? data.revenueTotal))}
            />
            <StatCard
              label="Deals en pipeline"
              value={formatNumber(getDealsCount(data))}
              helper={`${formatMoney(getDealsValue(data))} abiertos`}
              trend={trendLabel(getMetricChange(data.deals_in_pipeline ?? data.dealsInPipeline))}
            />
            <StatCard
              label="Tasa de cierre"
              value={formatCloseRate(getCloseRate(data))}
              helper="Ganados sobre cerrados"
              trend={trendLabel(getMetricChange(data.close_rate ?? data.closeRate))}
            />
            <StatCard
              label="Actividades del día"
              value={formatNumber(getActivitiesToday(data))}
              helper={getActivitiesHelper(data)}
              trend={trendLabel(getMetricChange(data.activities_today ?? data.activitiesToday))}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_0.9fr]">
            <ChartCard title="Revenue por mes" helper="Ingresos de leads ganados">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                  <YAxis
                    tickFormatter={chartMoneyTick}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  />
                  <Tooltip content={<CustomTooltip valueFormatter={formatMoney} />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#a78bfa"
                    strokeWidth={3}
                    fill="url(#revenueGradient)"
                    dot={{ r: 3, fill: "#a78bfa" }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Estado de deals" helper={`${formatNumber(statusTotal)} leads`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomTooltip />} />
                  <Pie
                    data={statusSeries}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={3}
                    stroke="hsl(var(--card))"
                    strokeWidth={3}
                  >
                    {statusSeries.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#8b5cf6"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Leads por etapa" helper="Distribución del pipeline principal">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageSeries} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  height={64}
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="leads" name="Leads" radius={[6, 6, 0, 0]}>
                  {stageSeries.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-3">
            {statusSeries.map((item) => (
              <Card key={item.status} className="flex items-center gap-4">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${STATUS_COLORS[item.status] ?? "#8b5cf6"}22` }}
                >
                  {item.status === "won" ? (
                    <CircleDollarSign className="h-5 w-5" style={{ color: STATUS_COLORS[item.status] }} />
                  ) : item.status === "lost" ? (
                    <BadgePercent className="h-5 w-5" style={{ color: STATUS_COLORS[item.status] }} />
                  ) : (
                    <TrendingUp className="h-5 w-5" style={{ color: STATUS_COLORS[item.status] ?? "#8b5cf6" }} />
                  )}
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">{item.name}</p>
                  <p className="mt-1 text-2xl font-semibold">{formatNumber(item.value)}</p>
                </div>
              </Card>
            ))}
            {statusSeries.length === 0 ? (
              <Card className="md:col-span-3">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span className="text-sm">Sin datos de estado todavía.</span>
                </div>
              </Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
