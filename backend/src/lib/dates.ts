import type { Prisma } from "@prisma/client";

// Convierte un Decimal de Prisma (o null) en number plano para el JSON de respuesta.
export function dec(value: Prisma.Decimal | number | null | undefined): number {
  return value ? Number(value) : 0;
}

// Inicio del día (00:00:00.000) en hora local del servidor.
export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Inicio del día siguiente: límite superior exclusivo para "hoy".
export function startOfNextDay(d = new Date()): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

// Clave de mes "YYYY-MM" a partir de una fecha.
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Primer día del mes que contiene a `d`.
export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Lista de las claves de los últimos `count` meses (incluido el actual), del más antiguo al más nuevo.
export function lastMonths(count: number, ref = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(ref.getFullYear(), ref.getMonth() - i, 1)));
  }
  return keys;
}

// Agrega importes por mes y los proyecta sobre un conjunto fijo de claves (rellena con 0).
export function bucketByMonth(
  rows: { date: Date | null; amount: number }[],
  monthKeys: string[],
): { month: string; revenue: number }[] {
  const totals = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  for (const row of rows) {
    if (!row.date) continue;
    const key = monthKey(row.date);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }
  return monthKeys.map((month) => ({ month, revenue: totals.get(month) ?? 0 }));
}
