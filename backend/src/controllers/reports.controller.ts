import { LeadStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";

import { bucketByMonth, dec, monthKey, startOfMonth } from "../lib/dates.js";
import { sendData, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  pipelineId: z.string().optional(),
});

// Lista de claves "YYYY-MM" desde el mes de `from` hasta el de `to` (inclusive).
function monthRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = startOfMonth(from);
  const end = startOfMonth(to);
  while (cursor <= end) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

// GET /api/reports?from=&to=&pipelineId= — métricas de ventas calculadas desde la BD.
export async function getReports(req: Request, res: Response) {
  const q = validate(querySchema, req.query);

  const now = new Date();
  // Por defecto: últimos 12 meses.
  const to = q.to ?? now;
  const from = q.from ?? new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const closedRange = { gte: from, lte: to };

  // Pipeline objetivo: el indicado o el primero por posición.
  const pipeline = q.pipelineId
    ? await prisma.pipeline.findUnique({
        where: { id: q.pipelineId },
        include: { stages: { orderBy: { position: "asc" } } },
      })
    : await prisma.pipeline.findFirst({
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { stages: { orderBy: { position: "asc" } } },
      });

  const pipelineFilter = pipeline ? { pipelineId: pipeline.id } : {};

  const [wonLeads, stageGroups, rankingGroups, wonCount, lostCount, lostByStage, cycleLeads] =
    await Promise.all([
      // revenue_by_month: ganados cerrados dentro del rango.
      prisma.lead.findMany({
        where: { ...pipelineFilter, status: LeadStatus.won, closedAt: closedRange },
        select: { value: true, closedAt: true },
      }),
      // conversion_by_stage: distribución actual de leads creados en el rango.
      prisma.lead.groupBy({
        by: ["stageId"],
        where: { ...pipelineFilter, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
        _sum: { value: true },
      }),
      // sales_ranking: ganados por agente.
      prisma.lead.groupBy({
        by: ["responsibleUserId"],
        where: { ...pipelineFilter, status: LeadStatus.won, closedAt: closedRange },
        _count: { _all: true },
        _sum: { value: true },
      }),
      prisma.lead.count({ where: { ...pipelineFilter, status: LeadStatus.won, closedAt: closedRange } }),
      prisma.lead.count({ where: { ...pipelineFilter, status: LeadStatus.lost, closedAt: closedRange } }),
      // win_loss "razones": agrupa los perdidos por la etapa en la que quedaron.
      prisma.lead.groupBy({
        by: ["stageId"],
        where: { ...pipelineFilter, status: LeadStatus.lost, closedAt: closedRange },
        _count: { _all: true },
      }),
      // avg_cycle_time: creación -> cierre de los ganados.
      prisma.lead.findMany({
        where: { ...pipelineFilter, status: LeadStatus.won, closedAt: closedRange },
        select: { createdAt: true, closedAt: true },
      }),
    ]);

  // revenue_by_month
  const revenueByMonth = bucketByMonth(
    wonLeads.map((l) => ({ date: l.closedAt, amount: dec(l.value) })),
    monthRange(from, to),
  );

  // conversion_by_stage (sin historial de etapas: aproximación con la distribución actual).
  const countByStage = new Map(stageGroups.map((g) => [g.stageId, g._count._all]));
  const totalLeads = stageGroups.reduce((acc, g) => acc + g._count._all, 0);
  const conversionByStage = (pipeline?.stages ?? []).map((s) => {
    const count = countByStage.get(s.id) ?? 0;
    return {
      stageId: s.id,
      name: s.name,
      type: s.type,
      count,
      conversion: totalLeads > 0 ? count / totalLeads : 0,
    };
  });

  // sales_ranking (resuelve nombres de agentes; "Sin asignar" para null).
  const userIds = rankingGroups.map((g) => g.responsibleUserId).filter((id): id is string => !!id);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const salesRanking = rankingGroups
    .map((g) => ({
      userId: g.responsibleUserId,
      name: g.responsibleUserId ? (userName.get(g.responsibleUserId) ?? "Desconocido") : "Sin asignar",
      wonLeads: g._count._all,
      revenue: dec(g._sum.value),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.wonLeads - a.wonLeads);

  // win_loss con razones (nombre de la etapa donde se perdió).
  const stageName = new Map((pipeline?.stages ?? []).map((s) => [s.id, s.name]));
  const reasons = lostByStage
    .map((g) => ({ reason: stageName.get(g.stageId) ?? "Otra", count: g._count._all }))
    .sort((a, b) => b.count - a.count);
  const closedTotal = wonCount + lostCount;

  // avg_cycle_time en días (promedio de cierre - creación).
  const cycleDays = cycleLeads
    .filter((l) => l.closedAt)
    .map((l) => (l.closedAt!.getTime() - l.createdAt.getTime()) / 86_400_000);
  const avgCycleTime =
    cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : 0;

  sendData(res, {
    range: { from, to },
    pipelineId: pipeline?.id ?? null,
    revenue_by_month: revenueByMonth,
    conversion_by_stage: conversionByStage,
    sales_ranking: salesRanking,
    win_loss: {
      won: wonCount,
      lost: lostCount,
      winRate: closedTotal > 0 ? wonCount / closedTotal : 0,
      reasons,
    },
    avg_cycle_time: { days: avgCycleTime, sample: cycleDays.length },
  });
}
