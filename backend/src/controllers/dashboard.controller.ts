import { LeadStatus } from "@prisma/client";
import type { Request, Response } from "express";

import { bucketByMonth, dec, lastMonths, startOfDay, startOfNextDay } from "../lib/dates.js";
import { sendData } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

// GET /api/dashboard — KPIs globales calculados en vivo desde la BD.
export async function getDashboard(_req: Request, res: Response) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = startOfNextDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  // Ventana de 12 meses para revenue_by_month.
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Pipeline "actual" = el primero por posición (el que ve el usuario por defecto).
  const currentPipeline = await prisma.pipeline.findFirst({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { stages: { orderBy: { position: "asc" } } },
  });

  const [
    wonAgg,
    openAgg,
    wonCount,
    lostCount,
    tasksToday,
    messagesToday,
    newLeadsToday,
    newLeadsYesterday,
    wonLeads,
    leadsByStageRaw,
  ] = await Promise.all([
    // revenue_total = suma de value de leads ganados.
    prisma.lead.aggregate({ where: { status: LeadStatus.won }, _sum: { value: true } }),
    // deals_in_pipeline = count + valor de leads abiertos.
    prisma.lead.aggregate({
      where: { status: LeadStatus.open },
      _count: true,
      _sum: { value: true },
    }),
    prisma.lead.count({ where: { status: LeadStatus.won } }),
    prisma.lead.count({ where: { status: LeadStatus.lost } }),
    // activities_today = tareas que vencen hoy + mensajes de hoy.
    prisma.task.count({ where: { dueAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.message.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.lead.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.lead.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    // Para revenue_by_month: ganados con fecha de cierre en la ventana.
    prisma.lead.findMany({
      where: { status: LeadStatus.won, closedAt: { gte: windowStart } },
      select: { value: true, closedAt: true },
    }),
    // leads_by_stage del pipeline actual.
    currentPipeline
      ? prisma.lead.groupBy({
          by: ["stageId"],
          where: { pipelineId: currentPipeline.id },
          _count: { _all: true },
          _sum: { value: true },
        })
      : Promise.resolve([] as { stageId: string; _count: { _all: number }; _sum: { value: unknown } }[]),
  ]);

  const won = wonCount;
  const lost = lostCount;
  const closeRate = won + lost > 0 ? won / (won + lost) : 0;

  const revenueByMonth = bucketByMonth(
    wonLeads.map((l) => ({ date: l.closedAt, amount: dec(l.value) })),
    lastMonths(12, now),
  );

  // Mapea los conteos por etapa al orden real del pipeline (incluye etapas vacías con 0).
  const countByStage = new Map(
    (leadsByStageRaw as { stageId: string; _count: { _all: number }; _sum: { value: unknown } }[]).map(
      (r) => [r.stageId, { count: r._count._all, value: dec(r._sum.value as number | null) }],
    ),
  );
  const leadsByStage = (currentPipeline?.stages ?? []).map((s) => ({
    stageId: s.id,
    name: s.name,
    color: s.color,
    type: s.type,
    count: countByStage.get(s.id)?.count ?? 0,
    value: countByStage.get(s.id)?.value ?? 0,
  }));

  sendData(res, {
    revenue_total: dec(wonAgg._sum.value),
    deals_in_pipeline: { count: openAgg._count, value: dec(openAgg._sum.value) },
    close_rate: closeRate,
    activities_today: {
      total: tasksToday + messagesToday,
      tasks: tasksToday,
      messages: messagesToday,
    },
    revenue_by_month: revenueByMonth,
    leads_by_stage: {
      pipelineId: currentPipeline?.id ?? null,
      pipelineName: currentPipeline?.name ?? null,
      stages: leadsByStage,
    },
    new_leads_today_yesterday: { today: newLeadsToday, yesterday: newLeadsYesterday },
  });
}
