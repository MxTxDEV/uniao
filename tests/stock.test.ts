import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resolvePeriod } from "@/lib/dates";
import { cancelSale, createSale } from "@/server/sales";
import { createStockEntry, listStockEntries } from "@/server/stock";
import { getReport } from "@/server/stats";
import { makeTenant, resetDb, saleInput } from "./helpers";

beforeEach(resetDb);

const stockOf = async (id: string) => (await db.product.findUniqueOrThrow({ where: { id } })).stock;

describe("entrada de estoque", () => {
  it("soma quantidades, une linhas repetidas e cria a despesa com o valor total", async () => {
    const t = await makeTenant();
    const r = await createStockEntry(t.adminCtx, {
      totalCost: "1234.50",
      notes: "Pedido X",
      items: [{ productId: t.camiseta.id, quantity: 10 }, { productId: t.bone.id, quantity: 5 }, { productId: t.camiseta.id, quantity: 2 }],
    });
    expect(r.totalCost).toBe("1234.50");
    expect(await stockOf(t.camiseta.id)).toBe(12);
    expect(await stockOf(t.bone.id)).toBe(5);
    const exp = await db.expense.findFirstOrThrow({ where: { tenantId: t.tenant.id } });
    expect(exp.amount.toFixed(2)).toBe("1234.50");
    expect(exp.stockEntryId).toBe(r.id);
    expect(exp.description).toContain("17 un.");
    const list = await listStockEntries(t.adminCtx);
    expect(list).toHaveLength(1);
    expect(list[0].notes).toBe("Pedido X");
    // relatório: despesas e resultado
    const rep = await getReport(t.adminCtx, resolvePeriod("hoje"));
    expect(rep.expensesTotal.toFixed(2)).toBe("1234.50");
    expect(rep.result.toFixed(2)).toBe("-1234.50");
  });

  it("valida: valor > 0, quantidade > 0, itens, produto de outra loja; nada é gravado em caso de erro", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const item = { productId: a.bone.id, quantity: 1 };
    await expect(createStockEntry(a.adminCtx, { totalCost: "0", items: [item] })).rejects.toThrow(/maior que zero/);
    await expect(createStockEntry(a.adminCtx, { totalCost: "10", items: [] })).rejects.toThrow(/ao menos um/);
    await expect(createStockEntry(a.adminCtx, { totalCost: "10", items: [{ ...item, quantity: 0 }] })).rejects.toThrow(/maior que zero/);
    await expect(createStockEntry(a.adminCtx, { totalCost: "10", items: [{ ...item, quantity: 1.5 }] })).rejects.toThrow();
    await expect(createStockEntry(a.adminCtx, { totalCost: "abc", items: [item] })).rejects.toThrow(/inválido/);
    await expect(createStockEntry(a.adminCtx, { totalCost: "10", items: [{ productId: b.bone.id, quantity: 1 }] })).rejects.toThrow(/não encontrado/);
    expect(await stockOf(b.bone.id)).toBe(0);
    expect(await db.expense.count()).toBe(0);
    expect(await db.stockEntry.count()).toBe(0);
  });

  it("só admin lança; listagem isolada por loja", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await expect(createStockEntry(a.s1Ctx, { totalCost: "10", items: [{ productId: a.bone.id, quantity: 1 }] })).rejects.toThrow(/permissão/);
    await expect(listStockEntries(a.s1Ctx)).rejects.toThrow(/permissão/);
    await createStockEntry(a.adminCtx, { totalCost: "10", items: [{ productId: a.bone.id, quantity: 1 }] });
    expect(await listStockEntries(b.adminCtx)).toHaveLength(0);
    expect((await getReport(b.adminCtx, resolvePeriod("hoje"))).expensesTotal.toFixed(2)).toBe("0.00");
  });
});

describe("estoque x vendas", () => {
  it("venda baixa estoque dos cadastrados (avulso não), cancelamento devolve, nunca bloqueia", async () => {
    const t = await makeTenant();
    await createStockEntry(t.adminCtx, { totalCost: "100", items: [{ productId: t.bone.id, quantity: 3 }] });
    const s = await createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 2 }, { description: "Cinto", unitPrice: "10.00", quantity: 4 }]));
    expect(await stockOf(t.bone.id)).toBe(1);
    // vender mais do que há em estoque é permitido
    const s2 = await createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 4 }]));
    expect(await stockOf(t.bone.id)).toBe(-3);
    await cancelSale(t.adminCtx, { id: s.id });
    expect(await stockOf(t.bone.id)).toBe(-1);
    await cancelSale(t.adminCtx, { id: s2.id });
    expect(await stockOf(t.bone.id)).toBe(3);
  });

  it("vendas simultâneas não perdem baixa de estoque", async () => {
    const t = await makeTenant();
    await createStockEntry(t.adminCtx, { totalCost: "100", items: [{ productId: t.bone.id, quantity: 50 }] });
    await Promise.all(Array.from({ length: 8 }, () => createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 2 }]))));
    expect(await stockOf(t.bone.id)).toBe(34);
  });
});
