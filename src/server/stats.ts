import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { Decimal, dec } from "@/lib/money";
import { addDays, resolvePeriod, startOfDayBR, startOfMonthBR, ymdBR, type Period } from "@/lib/dates";
import { PAYMENT_ORDER } from "@/lib/utils";
import { assertAdmin, type Ctx } from "./context";

// Todas as consultas de faturamento consideram APENAS vendas COMPLETED (canceladas são ignoradas).

async function totals(tenantId: string, start: Date, end: Date) {
  const r = await db.sale.aggregate({
    where: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
    _sum: { total: true },
    _count: true,
  });
  const revenue = r._sum.total ?? new Decimal(0);
  const count = r._count;
  return { revenue, count, avgTicket: count > 0 ? revenue.div(count).toDecimalPlaces(2) : new Decimal(0) };
}

export async function revenueByPayment(tenantId: string, start: Date, end: Date) {
  const rows = await db.sale.groupBy({
    by: ["paymentMethod"],
    where: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
    _sum: { total: true },
    _count: true,
  });
  return PAYMENT_ORDER.map((m) => {
    const r = rows.find((x) => x.paymentMethod === m);
    return { method: m as PaymentMethod, total: dec(r?._sum.total), count: r?._count ?? 0 };
  });
}

export async function revenueBySeller(tenantId: string, start: Date, end: Date) {
  const rows = await db.sale.groupBy({
    by: ["sellerId"],
    where: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
    _sum: { total: true },
    _count: true,
  });
  const users = await db.user.findMany({ where: { tenantId, id: { in: rows.map((r) => r.sellerId) } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows
    .map((r) => ({ sellerId: r.sellerId, name: names.get(r.sellerId) ?? "—", total: r._sum.total ?? new Decimal(0), count: r._count }))
    .sort((a, b) => b.total.comparedTo(a.total))
    .map((r) => ({ ...r, total: dec(r.total) }));
}

export async function revenueByDay(tenantId: string, start: Date, end: Date) {
  // createdAt é gravado em UTC (timestamp sem fuso): converte UTC -> Brasília antes de agrupar por dia.
  const rows = await db.$queryRaw<{ day: string; total: Decimal; count: number }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
           SUM(total) AS total, COUNT(*)::int AS count
    FROM "Sale"
    WHERE "tenantId" = ${tenantId} AND status = 'COMPLETED'
      AND "createdAt" >= ${start} AND "createdAt" < ${end}
    GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; total: number; count: number }[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) {
    const key = ymdBR(d);
    const r = map.get(key);
    out.push({ day: key, total: r ? Number(new Decimal(r.total).toFixed(2)) : 0, count: r?.count ?? 0 });
  }
  return out;
}

export async function topProducts(tenantId: string, start: Date, end: Date, limit = 10) {
  const rows = await db.$queryRaw<{ name: string; qty: number; total: Decimal }[]>`
    SELECT (array_agg(si.description ORDER BY s."createdAt" DESC))[1] AS name, SUM(si.quantity)::int AS qty, SUM(si.total) AS total
    FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId"
    WHERE s."tenantId" = ${tenantId} AND si."tenantId" = ${tenantId} AND s.status = 'COMPLETED'
      AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
    GROUP BY COALESCE(si."productId", 'd:' || lower(si.description))
    ORDER BY qty DESC, total DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ name: r.name, qty: r.qty, total: dec(new Decimal(r.total)) }));
}

export async function getDashboard(ctx: Ctx, periodKey?: string, now: Date = new Date()) {
  assertAdmin(ctx);
  const period = resolvePeriod(periodKey, { now, fallback: "7dias" });
  const today = startOfDayBR(now);
  const tomorrow = addDays(today, 1);
  const [day, month, chart, payments, sellers, recent] = await Promise.all([
    totals(ctx.tenantId, today, tomorrow),
    totals(ctx.tenantId, startOfMonthBR(now), tomorrow),
    revenueByDay(ctx.tenantId, period.start, period.end),
    revenueByPayment(ctx.tenantId, period.start, period.end),
    revenueBySeller(ctx.tenantId, period.start, period.end),
    db.sale.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, number: true, createdAt: true, total: true, paymentMethod: true, status: true, seller: { select: { name: true } } },
    }),
  ]);
  return { period, day, month, chart, payments, sellers, recent };
}

export async function getReport(ctx: Ctx, period: Period) {
  assertAdmin(ctx);
  const [summary, canceled, payments, sellers, products, expenses] = await Promise.all([
    totals(ctx.tenantId, period.start, period.end),
    db.sale.aggregate({
      where: { tenantId: ctx.tenantId, status: "CANCELED", createdAt: { gte: period.start, lt: period.end } },
      _sum: { total: true },
      _count: true,
    }),
    revenueByPayment(ctx.tenantId, period.start, period.end),
    revenueBySeller(ctx.tenantId, period.start, period.end),
    topProducts(ctx.tenantId, period.start, period.end, 10),
    db.expense.aggregate({ where: { tenantId: ctx.tenantId, createdAt: { gte: period.start, lt: period.end } }, _sum: { amount: true }, _count: true }),
  ]);
  const expensesTotal = expenses._sum.amount ?? new Decimal(0);
  return { expensesTotal, expensesCount: expenses._count, result: summary.revenue.minus(expensesTotal), summary, canceledCount: canceled._count, canceledTotal: canceled._sum.total ?? new Decimal(0), payments, sellers, products };
}

export async function salesForExport(ctx: Ctx, period: Period) {
  assertAdmin(ctx);
  return db.sale.findMany({
    where: { tenantId: ctx.tenantId, createdAt: { gte: period.start, lt: period.end } },
    orderBy: { createdAt: "asc" },
    take: 20000,
    select: { number: true, createdAt: true, subtotal: true, discount: true, total: true, paymentMethod: true, status: true, cancelReason: true, seller: { select: { name: true } } },
  });
}

export async function sellersRanking(ctx: Ctx, period: Period) {
  assertAdmin(ctx);
  return revenueBySeller(ctx.tenantId, period.start, period.end);
}
