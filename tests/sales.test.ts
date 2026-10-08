import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelSale, createSale, getSale, listSales } from "@/server/sales";
import { makeTenant, resetDb, saleInput } from "./helpers";

beforeEach(resetDb);

describe("criação de venda", () => {
  it("calcula subtotal, desconto e total no servidor com Decimal exato", async () => {
    const t = await makeTenant();
    const r = await createSale(t.adminCtx, saleInput([{ productId: t.camiseta.id, quantity: 3 }, { productId: t.bone.id, quantity: 1 }], { discount: "10.00", paymentMethod: "CREDITO" }));
    // 89.90*3 = 269.70 ; + 79.90 = 349.60 ; - 10 = 339.60
    expect(r.subtotal).toBe("349.60");
    expect(r.discount).toBe("10.00");
    expect(r.total).toBe("339.60");
    expect(r.paymentMethod).toBe("CREDITO");
    expect(r.number).toBe(1);
  });

  it("não sofre erro de ponto flutuante (0,10 + 0,20)", async () => {
    const t = await makeTenant();
    const r = await createSale(t.adminCtx, saleInput([
      { description: "A", unitPrice: "0.10", quantity: 1 },
      { description: "B", unitPrice: "0.20", quantity: 1 },
    ]));
    expect(r.total).toBe("0.30");
    const row = await db.sale.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.total.toString()).toBe("0.3");
  });

  it("venda avulsa grava productId = null", async () => {
    const t = await makeTenant();
    const r = await createSale(t.s1Ctx, saleInput([{ description: "Tênis", unitPrice: "350.00", quantity: 1 }]));
    expect(r.total).toBe("350.00");
    const item = await db.saleItem.findFirstOrThrow({ where: { saleId: r.id } });
    expect(item.productId).toBeNull();
    expect(item.description).toBe("Tênis");
    expect(item.tenantId).toBe(t.tenant.id);
  });

  it("ignora preço enviado pelo cliente para produto cadastrado", async () => {
    const t = await makeTenant();
    const r = await createSale(t.s1Ctx, saleInput([{ productId: t.camiseta.id, unitPrice: "0.01", quantity: 1 }]));
    expect(r.total).toBe("89.90");
  });

  it("rejeita total <= 0, quantidade <= 0, desconto > subtotal e valores inválidos", async () => {
    const t = await makeTenant();
    await expect(createSale(t.adminCtx, saleInput([{ description: "X", unitPrice: "0.00", quantity: 1 }]))).rejects.toThrow(/maior que zero/);
    await expect(createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 0 }]))).rejects.toThrow(/maior que zero/);
    await expect(createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: -2 }]))).rejects.toThrow();
    await expect(createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1.5 }]))).rejects.toThrow();
    await expect(createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }], { discount: "79.90" }))).rejects.toThrow(/maior que zero/);
    await expect(createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }], { discount: "80.00" }))).rejects.toThrow(/desconto/i);
    await expect(createSale(t.adminCtx, saleInput([{ description: "X", unitPrice: "-5", quantity: 1 }]))).rejects.toThrow();
    await expect(createSale(t.adminCtx, saleInput([{ description: "X", unitPrice: "1e3", quantity: 1 }]))).rejects.toThrow();
    await expect(createSale(t.adminCtx, saleInput([{ description: "X", unitPrice: "1.999", quantity: 1 }]))).rejects.toThrow();
    await expect(createSale(t.adminCtx, saleInput([]))).rejects.toThrow();
    await expect(createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }], { paymentMethod: "BOLETO" }))).rejects.toThrow();
    expect(await db.sale.count()).toBe(0);
  });

  it("respeita configurações: desconto e venda avulsa desativados", async () => {
    const t = await makeTenant();
    await db.tenant.update({ where: { id: t.tenant.id }, data: { allowDiscount: false, allowCustomItems: false } });
    await expect(createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }], { discount: "5.00" }))).rejects.toThrow(/Desconto/);
    await expect(createSale(t.adminCtx, saleInput([{ description: "X", unitPrice: "10.00", quantity: 1 }]))).rejects.toThrow(/avulsa/);
    const ok = await createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    expect(ok.total).toBe("79.90");
  });

  it("não aceita produto inativo nem de outra loja", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await expect(createSale(a.adminCtx, saleInput([{ productId: b.camiseta.id, quantity: 1 }]))).rejects.toThrow(/Produto/);
    await db.product.update({ where: { id: a.bone.id }, data: { active: false } });
    await expect(createSale(a.adminCtx, saleInput([{ productId: a.bone.id, quantity: 1 }]))).rejects.toThrow(/Produto/);
  });

  it("vendedor não vende em nome de outro; admin pode; vendedor de outra loja é inválido", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const items = [{ productId: a.bone.id, quantity: 1 }];
    await expect(createSale(a.s1Ctx, saleInput(items, { sellerId: a.seller2.id }))).rejects.toThrow(/seu nome/);
    const r = await createSale(a.adminCtx, saleInput(items, { sellerId: a.seller2.id }));
    expect(r.sellerName).toBe("Beto");
    await expect(createSale(a.adminCtx, saleInput(items, { sellerId: b.seller1.id }))).rejects.toThrow(/Vendedor inválido/);
    await db.user.update({ where: { id: a.seller2.id }, data: { active: false } });
    await expect(createSale(a.adminCtx, saleInput(items, { sellerId: a.seller2.id }))).rejects.toThrow(/Vendedor inválido/);
  });

  it("é idempotente: mesmo requestId não duplica a venda (inclusive em paralelo)", async () => {
    const t = await makeTenant();
    const input = saleInput([{ productId: t.bone.id, quantity: 1 }]);
    const [a, b, c] = await Promise.all([createSale(t.adminCtx, input), createSale(t.adminCtx, input), createSale(t.adminCtx, input)]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    expect(await db.sale.count()).toBe(1);
  });

  it("numeração sequencial por loja, sem repetição sob concorrência", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => createSale(a.s1Ctx, saleInput([{ productId: a.bone.id, quantity: 1 }]))),
    );
    expect(results.map((r) => r.number).sort((x, y) => x - y)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    const rb = await createSale(b.adminCtx, saleInput([{ productId: b.bone.id, quantity: 1 }]));
    expect(rb.number).toBe(1); // contador independente por loja
  });

  it("abre o caixa automaticamente na primeira venda e reutiliza o mesmo depois", async () => {
    const t = await makeTenant();
    await createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    await createSale(t.adminCtx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    const regs = await db.cashRegister.findMany({ where: { tenantId: t.tenant.id } });
    expect(regs).toHaveLength(1);
    expect(regs[0].status).toBe("OPEN");
    expect(await db.sale.count({ where: { cashRegisterId: regs[0].id } })).toBe(2);
  });
});

describe("cancelamento", () => {
  it("mantém a venda no banco com status CANCELED, motivo e auditoria", async () => {
    const t = await makeTenant();
    const s = await createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    await cancelSale(t.adminCtx, { id: s.id, reason: "Cliente desistiu" });
    const row = await db.sale.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("CANCELED");
    expect(row.cancelReason).toBe("Cliente desistiu");
    expect(row.canceledById).toBe(t.admin.id);
    expect(row.canceledAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "SALE_CANCEL", entityId: s.id } })).toBe(1);
    // continua no histórico
    const list = await listSales(t.adminCtx, {});
    expect(list.rows.find((r) => r.id === s.id)?.status).toBe("CANCELED");
  });

  it("motivo é opcional", async () => {
    const t = await makeTenant();
    const s = await createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    await cancelSale(t.adminCtx, { id: s.id });
    expect((await db.sale.findUniqueOrThrow({ where: { id: s.id } })).cancelReason).toBeNull();
  });

  it("não cancela duas vezes (nem em paralelo)", async () => {
    const t = await makeTenant();
    const s = await createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    const res = await Promise.allSettled([cancelSale(t.adminCtx, { id: s.id }), cancelSale(t.adminCtx, { id: s.id })]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(cancelSale(t.adminCtx, { id: s.id })).rejects.toThrow(/já foi cancelada/);
  });

  it("somente ADMIN cancela; respeita configuração; outra loja não alcança o ID", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const s = await createSale(a.s1Ctx, saleInput([{ productId: a.bone.id, quantity: 1 }]));
    await expect(cancelSale(a.s1Ctx, { id: s.id })).rejects.toThrow(/permissão/);
    await expect(cancelSale(b.adminCtx, { id: s.id })).rejects.toThrow(/não encontrada/);
    await db.tenant.update({ where: { id: a.tenant.id }, data: { allowCancel: false } });
    await expect(cancelSale(a.adminCtx, { id: s.id })).rejects.toThrow(/desativado/);
    expect((await db.sale.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("COMPLETED");
  });
});

describe("visibilidade e isolamento", () => {
  it("vendedor vê só as próprias vendas; admin vê todas", async () => {
    const t = await makeTenant();
    const s1 = await createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    const s2 = await createSale(t.s2Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }]));
    expect((await listSales(t.s1Ctx, {})).rows.map((r) => r.id)).toEqual([s1.id]);
    // tentar filtrar por outro vendedor não vaza dados
    expect((await listSales(t.s1Ctx, { sellerId: t.seller2.id })).rows.map((r) => r.id)).toEqual([s1.id]);
    expect((await listSales(t.adminCtx, {})).rows).toHaveLength(2);
    await expect(getSale(t.s1Ctx, s2.id)).rejects.toThrow(/não encontrada/);
    expect((await getSale(t.adminCtx, s2.id)).sale.id).toBe(s2.id);
  });

  it("nenhuma loja enxerga vendas de outra (lista e detalhe por ID)", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const sa = await createSale(a.adminCtx, saleInput([{ productId: a.bone.id, quantity: 1 }]));
    await createSale(b.adminCtx, saleInput([{ productId: b.bone.id, quantity: 1 }]));
    expect((await listSales(b.adminCtx, {})).rows.map((r) => r.id)).not.toContain(sa.id);
    await expect(getSale(b.adminCtx, sa.id)).rejects.toThrow(/não encontrada/);
  });

  it("filtros: pagamento, status, período e vendedor", async () => {
    const t = await makeTenant();
    const pix = await createSale(t.s1Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }], { paymentMethod: "PIX" }));
    const din = await createSale(t.s2Ctx, saleInput([{ productId: t.bone.id, quantity: 1 }], { paymentMethod: "DINHEIRO" }));
    await cancelSale(t.adminCtx, { id: din.id });
    expect((await listSales(t.adminCtx, { payment: "PIX" })).rows.map((r) => r.id)).toEqual([pix.id]);
    expect((await listSales(t.adminCtx, { status: "CANCELED" })).rows.map((r) => r.id)).toEqual([din.id]);
    expect((await listSales(t.adminCtx, { sellerId: t.seller2.id })).rows.map((r) => r.id)).toEqual([din.id]);
    const future = new Date(Date.now() + 86400000);
    expect((await listSales(t.adminCtx, { from: future })).rows).toHaveLength(0);
    const r = await listSales(t.adminCtx, { to: future });
    expect(r.rows).toHaveLength(2);
    expect(r.completedCount).toBe(1); // cancelada não entra no total
    expect(r.completedTotal.toFixed(2)).toBe("79.90");
  });
});
