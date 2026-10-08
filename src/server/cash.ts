import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { Decimal, dec, parseMoney } from "@/lib/money";
import { moneyStr, optionalText, parse, text } from "@/lib/validate";
import { audit } from "./audit";
import { assertAdmin, type Ctx } from "./context";

type Tx = Prisma.TransactionClient | typeof db;

export interface CashSummary {
  id: string;
  openedAt: Date;
  openedByName: string;
  opening: Decimal;
  sales: Decimal;
  salesCount: number;
  entries: Decimal;
  exits: Decimal;
  expected: Decimal;
}

async function summarize(client: Tx, tenantId: string, reg: { id: string; openedAt: Date; openingAmount: Decimal }): Promise<Omit<CashSummary, "openedByName">> {
  const [sales, moves] = await Promise.all([
    client.sale.aggregate({ where: { tenantId, cashRegisterId: reg.id, status: "COMPLETED" }, _sum: { total: true }, _count: true }),
    client.cashMovement.groupBy({ by: ["type"], where: { tenantId, cashRegisterId: reg.id }, _sum: { amount: true } }),
  ]);
  const entries = moves.find((m) => m.type === "IN")?._sum.amount ?? new Decimal(0);
  const exits = moves.find((m) => m.type === "OUT")?._sum.amount ?? new Decimal(0);
  const salesTotal = sales._sum.total ?? new Decimal(0);
  return {
    id: reg.id,
    openedAt: reg.openedAt,
    opening: reg.openingAmount,
    sales: salesTotal,
    salesCount: sales._count,
    entries,
    exits,
    // Saldo esperado = abertura + vendas (todas as formas) + entradas − saídas
    expected: reg.openingAmount.plus(salesTotal).plus(entries).minus(exits),
  };
}

export async function getOpenRegister(ctx: Ctx): Promise<CashSummary | null> {
  assertAdmin(ctx);
  const reg = await db.cashRegister.findFirst({ where: { tenantId: ctx.tenantId, status: "OPEN" } });
  if (!reg) return null;
  const opener = await db.user.findFirst({ where: { id: reg.openedById, tenantId: ctx.tenantId }, select: { name: true } });
  return { ...(await summarize(db, ctx.tenantId, reg)), openedByName: opener?.name ?? "—" };
}

export async function listMovements(ctx: Ctx, registerId: string) {
  assertAdmin(ctx);
  return db.cashMovement.findMany({ where: { tenantId: ctx.tenantId, cashRegisterId: registerId }, orderBy: { createdAt: "desc" } });
}

export async function listClosedRegisters(ctx: Ctx, take = 10) {
  assertAdmin(ctx);
  const rows = await db.cashRegister.findMany({ where: { tenantId: ctx.tenantId, status: "CLOSED" }, orderBy: { closedAt: "desc" }, take });
  const ids = [...new Set(rows.map((r) => r.closedById).filter((x): x is string => !!x))];
  const users = await db.user.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, closedByName: r.closedById ? names.get(r.closedById) ?? "—" : "—" }));
}

const openSchema = z.object({ openingAmount: moneyStr });

export async function openRegister(ctx: Ctx, input: unknown): Promise<void> {
  assertAdmin(ctx);
  const { openingAmount } = parse(openSchema, input);
  const amount = parseMoney(openingAmount, "Valor de abertura");
  try {
    const reg = await db.cashRegister.create({ data: { tenantId: ctx.tenantId, openedById: ctx.userId, openingAmount: amount } });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "CASH_OPEN", entity: "CashRegister", entityId: reg.id, meta: { openingAmount: dec(amount) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "Já existe um caixa aberto.");
    }
    throw e;
  }
}

const moveSchema = z.object({
  type: z.enum(["IN", "OUT"], { message: "Tipo inválido." }),
  amount: moneyStr,
  description: text(120, "Descrição"),
});

export async function addMovement(ctx: Ctx, input: unknown): Promise<void> {
  assertAdmin(ctx);
  const d = parse(moveSchema, input);
  const amount = parseMoney(d.amount, "Valor");
  if (amount.lte(0)) throw new AppError("VALIDATION", "O valor deve ser maior que zero.");
  await db.$transaction(async (tx) => {
    const reg = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CashRegister" WHERE "tenantId" = ${ctx.tenantId} AND status = 'OPEN' FOR SHARE`)[0];
    if (!reg) throw new AppError("RULE", "Abra o caixa antes de lançar movimentações.");
    const m = await tx.cashMovement.create({
      data: { tenantId: ctx.tenantId, cashRegisterId: reg.id, type: d.type, amount, description: d.description, createdById: ctx.userId },
    });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "CASH_MOVEMENT", entity: "CashMovement", entityId: m.id, meta: { type: d.type, amount: dec(amount), description: d.description } }, tx);
  });
}

const closeSchema = z.object({ countedAmount: moneyStr, notes: optionalText(300, "Observação") });

export async function closeRegister(ctx: Ctx, input: unknown) {
  assertAdmin(ctx);
  const d = parse(closeSchema, input);
  const counted = parseMoney(d.countedAmount, "Saldo informado");
  return db.$transaction(async (tx) => {
    // FOR UPDATE: espera vendas em andamento terminarem e impede novas vendas nesse caixa durante o fechamento.
    const locked = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CashRegister" WHERE "tenantId" = ${ctx.tenantId} AND status = 'OPEN' FOR UPDATE`)[0];
    if (!locked) throw new AppError("RULE", "Não há caixa aberto para fechar.");
    const reg = await tx.cashRegister.findFirstOrThrow({ where: { id: locked.id, tenantId: ctx.tenantId } });
    const s = await summarize(tx, ctx.tenantId, reg);
    const difference = counted.minus(s.expected);
    await tx.cashRegister.update({
      where: { id: reg.id },
      data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId, expectedAmount: s.expected, countedAmount: counted, difference, notes: d.notes },
    });
    await audit(
      { tenantId: ctx.tenantId, userId: ctx.userId, action: "CASH_CLOSE", entity: "CashRegister", entityId: reg.id, meta: { expected: dec(s.expected), counted: dec(counted), difference: dec(difference), notes: d.notes } },
      tx,
    );
    return { expected: dec(s.expected), counted: dec(counted), difference: dec(difference) };
  });
}
