import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addMovement, closeRegister, getOpenRegister, listClosedRegisters, openRegister } from "@/server/cash";
import { cancelSale, createSale } from "@/server/sales";
import { makeTenant, resetDb, saleInput } from "./helpers";

beforeEach(resetDb);

describe("caixa", () => {
  it("fluxo completo: abertura, vendas, entradas/saídas, fechamento com diferença", async () => {
    const t = await makeTenant();
    await openRegister(t.adminCtx, { openingAmount: "200.00" });
    await createSale(t.s1Ctx, saleInput([{ productId: t.camiseta.id, quantity: 2 }], { paymentMethod: "PIX" })); // 179.80
    const cancelMe = await createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }], { paymentMethod: "DINHEIRO" })); // 79.90
    await cancelSale(t.adminCtx, { id: cancelMe.id });
    await addMovement(t.adminCtx, { type: "IN", amount: "50.00", description: "Reforço de troco" });
    await addMovement(t.adminCtx, { type: "OUT", amount: "30.50", description: "Sangria" });

    const open = await getOpenRegister(t.adminCtx);
    expect(open!.opening.toFixed(2)).toBe("200.00");
    expect(open!.sales.toFixed(2)).toBe("179.80"); // cancelada fora
    expect(open!.salesCount).toBe(1);
    expect(open!.entries.toFixed(2)).toBe("50.00");
    expect(open!.exits.toFixed(2)).toBe("30.50");
    expect(open!.expected.toFixed(2)).toBe("399.30");

    const res = await closeRegister(t.adminCtx, { countedAmount: "379.30", notes: "Faltou troco" });
    expect(res).toEqual({ expected: "399.30", counted: "379.30", difference: "-20.00" });
    expect(await getOpenRegister(t.adminCtx)).toBeNull();

    const [closed] = await listClosedRegisters(t.adminCtx);
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedByName).toBe("Admin");
    expect(closed.notes).toBe("Faltou troco");
    expect(closed.difference!.toFixed(2)).toBe("-20.00");
    expect(closed.closedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "CASH_CLOSE" } })).toBe(1);
  });

  it("vendas após o fechamento abrem um novo caixa e não alteram o fechado", async () => {
    const t = await makeTenant();
    await createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    await closeRegister(t.adminCtx, { countedAmount: "79.90" });
    await createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    const regs = await db.cashRegister.findMany({ where: { tenantId: t.tenant.id }, orderBy: { openedAt: "asc" } });
    expect(regs.map((r) => r.status)).toEqual(["CLOSED", "OPEN"]);
    expect(regs[0].difference!.toFixed(2)).toBe("0.00");
    expect((await getOpenRegister(t.adminCtx))!.expected.toFixed(2)).toBe("79.90");
  });

  it("só um caixa aberto por loja; abrir de novo falha; fechar sem caixa falha", async () => {
    const t = await makeTenant();
    await expect(closeRegister(t.adminCtx, { countedAmount: "0" })).rejects.toThrow(/Não há caixa aberto/);
    await openRegister(t.adminCtx, { openingAmount: "0" });
    await expect(openRegister(t.adminCtx, { openingAmount: "10" })).rejects.toThrow(/já existe/i);
    await expect(addMovement(t.adminCtx, { type: "OUT", amount: "0", description: "x" })).rejects.toThrow(/maior que zero/);
  });

  it("movimentação exige caixa aberto", async () => {
    const t = await makeTenant();
    await expect(addMovement(t.adminCtx, { type: "IN", amount: "10", description: "x" })).rejects.toThrow(/Abra o caixa/);
  });

  it("vendedor não acessa nada do caixa", async () => {
    const t = await makeTenant();
    await expect(openRegister(t.s1Ctx, { openingAmount: "10" })).rejects.toThrow(/permissão/);
    await expect(getOpenRegister(t.s1Ctx)).rejects.toThrow(/permissão/);
    await expect(closeRegister(t.s1Ctx, { countedAmount: "10" })).rejects.toThrow(/permissão/);
    await expect(addMovement(t.s1Ctx, { type: "IN", amount: "1", description: "x" })).rejects.toThrow(/permissão/);
  });

  it("caixas são isolados entre lojas", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await openRegister(a.adminCtx, { openingAmount: "100" });
    await createSale(a.adminCtx, saleInput([{ productId: a.bone.id, quantity: 1 }]));
    expect(await getOpenRegister(b.adminCtx)).toBeNull();
    await expect(closeRegister(b.adminCtx, { countedAmount: "0" })).rejects.toThrow(/Não há caixa aberto/);
    expect(await getOpenRegister(a.adminCtx)).not.toBeNull();
  });

  it("fechamento concorrente com vendas não perde venda: a soma fecha com o registrado", async () => {
    const t = await makeTenant();
    await openRegister(t.adminCtx, { openingAmount: "0" });
    const sales = Array.from({ length: 6 }, () => createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }])));
    const close = closeRegister(t.adminCtx, { countedAmount: "0" });
    await Promise.all([...sales, close]);
    const closed = await db.cashRegister.findFirstOrThrow({ where: { tenantId: t.tenant.id, status: "CLOSED" } });
    const attached = await db.sale.aggregate({ where: { cashRegisterId: closed.id }, _sum: { total: true } });
    expect(closed.expectedAmount!.toFixed(2)).toBe((attached._sum.total ?? 0).toString() === "0" ? "0.00" : attached._sum.total!.toFixed(2));
    expect(await db.sale.count({ where: { tenantId: t.tenant.id } })).toBe(6);
  });
});
