import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { dec, parseMoney } from "@/lib/money";
import { moneyStr, optionalText, parse } from "@/lib/validate";
import { audit } from "./audit";
import { assertAdmin, type Ctx } from "./context";

const entrySchema = z.object({
  totalCost: moneyStr,
  notes: optionalText(300, "Observações"),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(40),
        quantity: z
          .number({ message: "Quantidade inválida." })
          .int("Quantidade inválida.")
          .min(1, "A quantidade deve ser maior que zero.")
          .max(99999, "Quantidade muito alta."),
      }),
    )
    .min(1, "Adicione ao menos um produto.")
    .max(200, "Produtos demais em uma entrada."),
});

/** Lança uma entrada de estoque: soma a quantidade de cada produto e registra o valor como despesa (tudo em uma transação). */
export async function createStockEntry(ctx: Ctx, input: unknown): Promise<{ id: string; totalCost: string }> {
  assertAdmin(ctx);
  const d = parse(entrySchema, input);
  const totalCost = parseMoney(d.totalCost, "Valor da entrada");
  if (totalCost.lte(0)) throw new AppError("VALIDATION", "O valor da entrada deve ser maior que zero.");

  // Une linhas repetidas do mesmo produto.
  const qty = new Map<string, number>();
  for (const i of d.items) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);

  const products = await db.product.findMany({ where: { tenantId: ctx.tenantId, id: { in: [...qty.keys()] } }, select: { id: true, name: true } });
  if (products.length !== qty.size) throw new AppError("VALIDATION", "Produto não encontrado.");

  return db.$transaction(async (tx) => {
    const entry = await tx.stockEntry.create({
      data: {
        tenantId: ctx.tenantId,
        totalCost,
        notes: d.notes,
        createdById: ctx.userId,
        items: { create: [...qty].map(([productId, quantity]) => ({ tenantId: ctx.tenantId, productId, quantity })) },
      },
    });
    for (const [productId, quantity] of qty) {
      // tenantId no where: nunca altera produto de outra loja.
      const r = await tx.product.updateMany({ where: { id: productId, tenantId: ctx.tenantId }, data: { stock: { increment: quantity } } });
      if (r.count !== 1) throw new AppError("VALIDATION", "Produto não encontrado.");
    }
    const units = [...qty.values()].reduce((a, b) => a + b, 0);
    await tx.expense.create({
      data: {
        tenantId: ctx.tenantId,
        description: `Entrada de estoque (${units} un.)${d.notes ? ` — ${d.notes}` : ""}`.slice(0, 200),
        amount: totalCost,
        stockEntryId: entry.id,
        createdById: ctx.userId,
      },
    });
    await audit(
      { tenantId: ctx.tenantId, userId: ctx.userId, action: "STOCK_ENTRY", entity: "StockEntry", entityId: entry.id, meta: { totalCost: dec(totalCost), units, products: qty.size } },
      tx,
    );
    return { id: entry.id, totalCost: dec(totalCost) };
  });
}

export async function listStockEntries(ctx: Ctx, take = 30) {
  assertAdmin(ctx);
  const rows = await db.stockEntry.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take,
    include: { items: { include: { product: { select: { name: true } } } } },
  });
  const ids = [...new Set(rows.map((r) => r.createdById))];
  const users = await db.user.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    totalCost: dec(r.totalCost),
    notes: r.notes,
    byName: names.get(r.createdById) ?? "—",
    items: r.items.map((i) => ({ name: i.product.name, quantity: i.quantity })),
  }));
}
