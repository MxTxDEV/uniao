import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { addDays, parseYmdBR, resolvePeriod, startOfDayBR, ymdBR } from "@/lib/dates";
import { formatBRL, parseMoney } from "@/lib/money";
import { cancelSale, createSale } from "@/server/sales";
import { getDashboard, getReport, topProducts } from "@/server/stats";
import { makeTenant, resetDb, saleInput } from "./helpers";

beforeEach(resetDb);

/** Cria venda e move createdAt para o instante desejado. */
async function saleAt(ctx: Parameters<typeof createSale>[0], when: Date, items: unknown[], extra: Record<string, unknown> = {}) {
  const r = await createSale(ctx, saleInput(items, extra));
  await db.sale.update({ where: { id: r.id }, data: { createdAt: when } });
  return r;
}

describe("datas (America/Sao_Paulo)", () => {
  it("limites de dia usam horário de Brasília, não UTC", () => {
    // 02:30 UTC de 09/10 = 23:30 de 08/10 em Brasília
    const d = new Date("2026-10-09T02:30:00Z");
    expect(ymdBR(d)).toBe("2026-10-08");
    expect(startOfDayBR(d).toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(parseYmdBR("2026-02-30")).toBeNull();
    expect(parseYmdBR("abc")).toBeNull();
  });

  it("resolve períodos", () => {
    const now = new Date("2026-10-08T15:00:00Z");
    expect(ymdBR(resolvePeriod("hoje", { now }).start)).toBe("2026-10-08");
    const sete = resolvePeriod("7dias", { now });
    expect(ymdBR(sete.start)).toBe("2026-10-02");
    expect(ymdBR(sete.end)).toBe("2026-10-09");
    expect(ymdBR(resolvePeriod("mes", { now }).start)).toBe("2026-10-01");
    const ant = resolvePeriod("mes-anterior", { now });
    expect(ymdBR(ant.start)).toBe("2026-09-01");
    expect(ymdBR(ant.end)).toBe("2026-10-01");
    const ont = resolvePeriod("ontem", { now });
    expect(ymdBR(ont.start)).toBe("2026-10-07");
    const pers = resolvePeriod("personalizado", { now, from: "2026-09-10", to: "2026-09-12" });
    expect(ymdBR(pers.start)).toBe("2026-09-10");
    expect(ymdBR(pers.end)).toBe("2026-09-13");
    // inválido cai no padrão
    expect(resolvePeriod("xyz", { now, fallback: "7dias" }).key).toBe("7dias");
    expect(resolvePeriod("personalizado", { now, from: "2026-09-12", to: "2026-09-10" }).key).toBe("personalizado");
  });
});

describe("dinheiro", () => {
  it("formata e valida", () => {
    expect(formatBRL("2840")).toMatch(/2\.840,00/);
    expect(formatBRL(157.78)).toMatch(/157,78/);
    expect(parseMoney("89.90").toFixed(2)).toBe("89.90");
    expect(() => parseMoney("89,90")).toThrow();
    expect(() => parseMoney("-1")).toThrow();
    expect(() => parseMoney("")).toThrow();
  });
});

describe("dashboard e relatórios", () => {
  it("cards, ticket médio, pagamentos e ranking ignoram vendas canceladas", async () => {
    const t = await makeTenant();
    const now = new Date();
    const today = startOfDayBR(now);
    const inToday = new Date(today.getTime() + 60_000);
    await saleAt(t.s1Ctx, inToday, [{ productId: t.camiseta.id, quantity: 1 }], { paymentMethod: "PIX" }); // 89.90 Ana
    await saleAt(t.s1Ctx, inToday, [{ productId: t.bone.id, quantity: 1 }], { paymentMethod: "DINHEIRO" }); // 79.90 Ana
    await saleAt(t.s2Ctx, inToday, [{ description: "Tênis", unitPrice: "350.00", quantity: 1 }], { paymentMethod: "PIX" }); // 350 Beto
    const c = await saleAt(t.s2Ctx, inToday, [{ productId: t.bone.id, quantity: 5 }], { paymentMethod: "CREDITO" }); // cancelada
    await cancelSale(t.adminCtx, { id: c.id });

    const d = await getDashboard(t.adminCtx, "hoje", now);
    expect(d.day.revenue.toFixed(2)).toBe("519.80");
    expect(d.day.count).toBe(3);
    expect(d.day.avgTicket.toFixed(2)).toBe("173.27");
    expect(d.month.revenue.toFixed(2)).toBe("519.80");
    const byMethod = Object.fromEntries(d.payments.map((p) => [p.method, p.total]));
    expect(byMethod).toEqual({ PIX: "439.90", DINHEIRO: "79.90", DEBITO: "0.00", CREDITO: "0.00", OUTRO: "0.00" });
    expect(d.sellers.map((s) => [s.name, s.total])).toEqual([["Beto", "350.00"], ["Ana", "169.80"]]);
    expect(d.recent).toHaveLength(4); // histórico mostra a cancelada
    expect(d.recent.some((r) => r.status === "CANCELED")).toBe(true);
  });

  it("gráfico agrupa por dia de Brasília (23:30 BRT não vira o dia seguinte) e preenche dias vazios", async () => {
    const t = await makeTenant();
    const now = new Date("2026-10-08T18:00:00Z");
    const today = startOfDayBR(now);
    await saleAt(t.adminCtx, new Date(today.getTime() - 30 * 60_000), [{ productId: t.bone.id, quantity: 1 }]); // 2026-10-07 23:30 BRT = 02:30Z do dia 8
    await saleAt(t.adminCtx, new Date(today.getTime() + 30 * 60_000), [{ productId: t.bone.id, quantity: 2 }]); // 2026-10-08 00:30 BRT
    const d = await getDashboard(t.adminCtx, "7dias", now);
    expect(d.chart).toHaveLength(7);
    const byDay = Object.fromEntries(d.chart.map((c) => [c.day, c.total]));
    expect(byDay["2026-10-07"]).toBe(79.9);
    expect(byDay["2026-10-08"]).toBe(159.8);
    expect(byDay["2026-10-03"]).toBe(0);
    expect(d.day.revenue.toFixed(2)).toBe("159.80");
  });

  it("período 'mês anterior' e relatórios por período", async () => {
    const t = await makeTenant();
    const now = new Date("2026-10-08T15:00:00Z");
    await saleAt(t.adminCtx, new Date("2026-09-15T15:00:00Z"), [{ productId: t.camiseta.id, quantity: 1 }]);
    await saleAt(t.adminCtx, new Date("2026-10-02T15:00:00Z"), [{ productId: t.bone.id, quantity: 1 }]);
    const ant = await getReport(t.adminCtx, resolvePeriod("mes-anterior", { now }));
    expect(ant.summary.revenue.toFixed(2)).toBe("89.90");
    expect(ant.summary.count).toBe(1);
    const mes = await getReport(t.adminCtx, resolvePeriod("mes", { now }));
    expect(mes.summary.revenue.toFixed(2)).toBe("79.90");
  });

  it("produtos mais vendidos agrega por produto/descrição e ignora canceladas", async () => {
    const t = await makeTenant();
    const now = new Date();
    const when = new Date(startOfDayBR(now).getTime() + 1000);
    await saleAt(t.adminCtx, when, [{ productId: t.bone.id, quantity: 2 }, { description: "Cinto", unitPrice: "50.00", quantity: 1 }]);
    await saleAt(t.adminCtx, new Date(when.getTime() + 1000), [{ productId: t.bone.id, quantity: 1 }, { description: "cinto", unitPrice: "50.00", quantity: 1 }]);
    const x = await saleAt(t.adminCtx, when, [{ productId: t.camiseta.id, quantity: 10 }]);
    await cancelSale(t.adminCtx, { id: x.id });
    const top = await topProducts(t.tenant.id, startOfDayBR(now), addDays(startOfDayBR(now), 1));
    expect(top).toEqual([
      { name: "Boné", qty: 3, total: "239.70" },
      { name: "cinto", qty: 2, total: "100.00" },
    ]);
  });

  it("dashboard/relatórios: só admin; sem vazamento entre lojas", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await expect(getDashboard(a.s1Ctx, "hoje")).rejects.toThrow(/permissão/);
    await expect(getReport(a.s1Ctx, resolvePeriod("hoje"))).rejects.toThrow(/permissão/);
    await createSale(a.adminCtx, saleInput([{ productId: a.camiseta.id, quantity: 1 }]));
    const db_b = await getDashboard(b.adminCtx, "hoje");
    expect(db_b.day.revenue.toFixed(2)).toBe("0.00");
    expect(db_b.sellers).toHaveLength(0);
    expect(db_b.recent).toHaveLength(0);
    expect((await getReport(b.adminCtx, resolvePeriod("hoje"))).products).toHaveLength(0);
  });
});

import { signToken, verifyToken } from "@/lib/token";

describe("token de sessão", () => {
  it("assina e verifica; rejeita adulteração, assinatura inválida e expirado", async () => {
    const t = await signToken({ uid: "u1", tid: "t1" });
    expect(await verifyToken(t)).toEqual({ uid: "u1", tid: "t1" });
    const [h, b, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "u1", tid: "OUTRA", exp: 9999999999 })).toString("base64url");
    expect(await verifyToken(`${h}.${forged}.${s}`)).toBeNull();
    expect(await verifyToken(`${h}.${b}.${s.slice(0, -2)}AA`)).toBeNull();
    expect(await verifyToken("lixo")).toBeNull();
    expect(await verifyToken(undefined)).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    expect(await verifyToken(`${none}.${b}.`)).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 3600 * 1000);
    expect(await verifyToken(t)).toBeNull();
    vi.useRealTimers();
  });
});
