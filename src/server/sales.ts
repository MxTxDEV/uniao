import { Prisma } from "@prisma/client";
import type { PaymentMethod, SaleStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { Decimal, dec, parseMoney } from "@/lib/money";
import { moneyStr, optionalText, paymentEnum, parse } from "@/lib/validate";
import { audit } from "./audit";
import { assertAdmin, isAdmin, type Ctx } from "./context";

const itemSchema = z.object({
  productId: z.string().min(1).max(40).nullish(),
  description: z.string().trim().max(120, "Descrição deve ter no máximo 120 caracteres.").optional(),
  unitPrice: moneyStr.optional(),
  quantity: z
    .number({ message: "Quantidade inválida." })
    .int("Quantidade inválida.")
    .min(1, "A quantidade deve ser maior que zero.")
    .max(9999, "Quantidade muito alta."),
});

export const createSaleSchema = z.object({
  requestId: z.string().min(8).max(64),
  sellerId: z.string().min(1).max(40).nullish(),
  paymentMethod: paymentEnum,
  discount: moneyStr.default("0"),
  items: z.array(itemSchema).min(1, "Adicione ao menos um item.").max(100, "Itens demais em uma venda."),
});

export interface SaleReceipt {
  id: string;
  number: number;
  total: string;
  subtotal: string;
  discount: string;
  paymentMethod: PaymentMethod;
  sellerName: string;
  createdAt: string;
  items: { description: string; quantity: number; unitPrice: string; total: string }[];
}

const receiptInclude = {
  seller: { select: { name: true } },
  items: { select: { description: true, quantity: true, unitPrice: true, total: true }, orderBy: { id: "asc" as const } },
} satisfies Prisma.SaleInclude;

type SaleWithReceipt = Prisma.SaleGetPayload<{ include: typeof receiptInclude }>;

function toReceipt(s: SaleWithReceipt): SaleReceipt {
  return {
    id: s.id,
    number: s.number,
    total: dec(s.total),
    subtotal: dec(s.subtotal),
    discount: dec(s.discount),
    paymentMethod: s.paymentMethod,
    sellerName: s.seller.name,
    createdAt: s.createdAt.toISOString(),
    items: s.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: dec(i.unitPrice),
      total: dec(i.total),
    })),
  };
}

export async function createSale(ctx: Ctx, input: unknown): Promise<SaleReceipt> {
  const data = parse(createSaleSchema, input);

  // Idempotência: mesma requisição repetida (duplo clique / retry) devolve a venda já criada.
  const existing = await db.sale.findFirst({
    where: { tenantId: ctx.tenantId, requestId: data.requestId },
    include: receiptInclude,
  });
  if (existing) return toReceipt(existing);

  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });

  // Vendedor: só vende em seu próprio nome. Admin: escolhe qualquer vendedor ativo da loja.
  let sellerId = ctx.userId;
  if (data.sellerId && data.sellerId !== ctx.userId) {
    if (!isAdmin(ctx)) throw new AppError("FORBIDDEN", "Você só pode registrar vendas em seu nome.");
    sellerId = data.sellerId;
  }
  const seller = await db.user.findFirst({ where: { id: sellerId, tenantId: ctx.tenantId, active: true } });
  if (!seller) throw new AppError("VALIDATION", "Vendedor inválido.");

  // Produtos cadastrados: preço e nome vêm do banco (nunca do cliente).
  const productIds = [...new Set(data.items.map((i) => i.productId).filter((x): x is string => !!x))];
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds }, tenantId: ctx.tenantId, active: true } })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = data.items.map((it) => {
    if (it.productId) {
      const p = byId.get(it.productId);
      if (!p) throw new AppError("VALIDATION", "Produto não encontrado ou inativo.");
      return {
        productId: p.id,
        description: p.name,
        unitPrice: p.price,
        quantity: it.quantity,
        total: p.price.mul(it.quantity),
      };
    }
    if (!tenant.allowCustomItems) {
      throw new AppError("RULE", "Venda avulsa (sem produto cadastrado) está desativada nas configurações.");
    }
    const description = (it.description ?? "").trim();
    if (!description) throw new AppError("VALIDATION", "Informe a descrição do item avulso.");
    if (!it.unitPrice) throw new AppError("VALIDATION", "Informe o valor do item avulso.");
    const unitPrice = parseMoney(it.unitPrice, "Valor");
    if (unitPrice.lte(0)) throw new AppError("VALIDATION", "O valor do item deve ser maior que zero.");
    return { productId: null, description, unitPrice, quantity: it.quantity, total: unitPrice.mul(it.quantity) };
  });

  const subtotal = lines.reduce((a, l) => a.plus(l.total), new Decimal(0));
  const discount = parseMoney(data.discount, "Desconto");
  if (discount.gt(0) && !tenant.allowDiscount) {
    throw new AppError("RULE", "Desconto está desativado nas configurações da loja.");
  }
  if (discount.gt(subtotal)) throw new AppError("VALIDATION", "O desconto não pode ser maior que o subtotal.");
  const total = subtotal.minus(discount);
  if (total.lte(0)) throw new AppError("VALIDATION", "O total da venda deve ser maior que zero.");
  if (total.gte(new Decimal("10000000"))) throw new AppError("VALIDATION", "Valor total muito alto.");

  try {
    const sale = await db.$transaction(async (tx) => {
      // Trava compartilhada no caixa aberto: o fechamento (FOR UPDATE) espera as vendas em andamento.
      const lockOpen = () =>
        tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CashRegister" WHERE "tenantId" = ${ctx.tenantId} AND status = 'OPEN' FOR SHARE`;
      let reg = (await lockOpen())[0];
      if (!reg) {
        // Venda sem caixa aberto: abre automaticamente (R$ 0,00) para não atrasar o atendimento.
        // ON CONFLICT: se outra venda simultânea abrir o caixa primeiro, apenas reaproveitamos o dele.
        const newId = randomUUID();
        const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "CashRegister" (id, "tenantId", "openedById")
          VALUES (${newId}, ${ctx.tenantId}, ${ctx.userId})
          ON CONFLICT ("tenantId") WHERE status = 'OPEN' DO NOTHING
          RETURNING id`;
        if (inserted[0]) {
          await audit(
            { tenantId: ctx.tenantId, userId: ctx.userId, action: "CASH_OPEN", entity: "CashRegister", entityId: newId, meta: { auto: true, openingAmount: "0.00" } },
            tx,
          );
        }
        reg = (await lockOpen())[0];
        if (!reg) throw new AppError("CONFLICT", "Não foi possível abrir o caixa. Tente novamente.");
      }

      const { saleCounter } = await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: { saleCounter: { increment: 1 } },
        select: { saleCounter: true },
      });

      const created = await tx.sale.create({
        data: {
          tenantId: ctx.tenantId,
          number: saleCounter,
          sellerId: seller.id,
          createdById: ctx.userId,
          cashRegisterId: reg.id,
          subtotal,
          discount,
          total,
          paymentMethod: data.paymentMethod,
          requestId: data.requestId,
          items: {
            create: lines.map((l) => ({
              tenantId: ctx.tenantId,
              productId: l.productId,
              description: l.description,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              total: l.total,
            })),
          },
        },
        include: receiptInclude,
      });
      await audit(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "SALE_CREATE",
          entity: "Sale",
          entityId: created.id,
          meta: { number: created.number, total: dec(total), payment: data.paymentMethod, sellerId: seller.id },
        },
        tx,
      );
      return created;
    });
    return toReceipt(sale);
  } catch (e) {
    // Corrida de duas requisições com o mesmo requestId: devolve a venda vencedora.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.sale.findFirst({
        where: { tenantId: ctx.tenantId, requestId: data.requestId },
        include: receiptInclude,
      });
      if (again) return toReceipt(again);
    }
    throw e;
  }
}

export async function getSale(ctx: Ctx, id: string) {
  const sale = await db.sale.findFirst({
    where: { id, tenantId: ctx.tenantId, ...(isAdmin(ctx) ? {} : { sellerId: ctx.userId }) },
    include: {
      seller: { select: { name: true } },
      items: { orderBy: { id: "asc" } },
    },
  });
  if (!sale) throw new AppError("NOT_FOUND", "Venda não encontrada.");
  const [createdBy, canceledBy] = await Promise.all([
    db.user.findFirst({ where: { id: sale.createdById, tenantId: ctx.tenantId }, select: { name: true } }),
    sale.canceledById
      ? db.user.findFirst({ where: { id: sale.canceledById, tenantId: ctx.tenantId }, select: { name: true } })
      : null,
  ]);
  return { sale, createdByName: createdBy?.name ?? "—", canceledByName: canceledBy?.name ?? null };
}

const cancelSchema = z.object({ id: z.string().min(1).max(40), reason: optionalText(300, "Motivo") });

export async function cancelSale(ctx: Ctx, input: unknown): Promise<void> {
  assertAdmin(ctx);
  const { id, reason } = parse(cancelSchema, input);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { allowCancel: true } });
  if (!tenant.allowCancel) throw new AppError("RULE", "O cancelamento de vendas está desativado nas configurações.");

  await db.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!sale) throw new AppError("NOT_FOUND", "Venda não encontrada.");
    // updateMany condicional = cancelamento atômico (duas pessoas clicando ao mesmo tempo não cancelam duas vezes).
    const r = await tx.sale.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "COMPLETED" },
      data: { status: "CANCELED", canceledAt: new Date(), canceledById: ctx.userId, cancelReason: reason },
    });
    if (r.count === 0) throw new AppError("CONFLICT", "Esta venda já foi cancelada.");
    await audit(
      { tenantId: ctx.tenantId, userId: ctx.userId, action: "SALE_CANCEL", entity: "Sale", entityId: id, meta: { number: sale.number, total: dec(sale.total), reason } },
      tx,
    );
  });
}

export interface SalesFilter {
  from?: Date;
  to?: Date; // exclusivo
  sellerId?: string;
  payment?: PaymentMethod;
  status?: SaleStatus;
  page?: number;
}

export const PAGE_SIZE = 25;

export async function listSales(ctx: Ctx, f: SalesFilter) {
  const where: Prisma.SaleWhereInput = {
    tenantId: ctx.tenantId,
    ...(isAdmin(ctx) ? (f.sellerId ? { sellerId: f.sellerId } : {}) : { sellerId: ctx.userId }),
    ...(f.payment ? { paymentMethod: f.payment } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const [rows, count, sum] = await Promise.all([
    db.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        createdAt: true,
        total: true,
        paymentMethod: true,
        status: true,
        seller: { select: { name: true } },
      },
    }),
    db.sale.count({ where }),
    db.sale.aggregate({ where: { ...where, status: "COMPLETED" }, _sum: { total: true }, _count: true }),
  ]);
  return {
    rows,
    count,
    page,
    pages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    completedTotal: sum._sum.total ?? new Decimal(0),
    completedCount: sum._count,
  };
}
