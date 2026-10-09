import { PrismaClient, Prisma, type PaymentMethod } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const D = (v: string | number) => new Prisma.Decimal(v);

// PRNG determinístico para o seed ser reproduzível.
let seedState = 20261008;
const rnd = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

const BR = 3 * 3600 * 1000;
const DAY = 86400 * 1000;
const startOfDayBR = (d: Date) => {
  const l = new Date(d.getTime() - BR);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + BR);
};

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("Banco já possui dados. Use `npm run db:reset` para recriar.");
    return;
  }
  const passwordHash = await bcrypt.hash("uniao123", 10);

  const tenant = await db.tenant.create({
    data: { name: "União Grifes", address: "Rua das Flores, 120 - Centro", phone: "(11) 99999-0000", instagram: "@uniaogrifes" },
  });

  const [admin, joao, maria, pedro] = await Promise.all(
    [
      { name: "Administrador", email: "admin@uniaogrifes.com.br", role: "ADMIN" as const },
      { name: "João", email: "joao@uniaogrifes.com.br", role: "VENDEDOR" as const },
      { name: "Maria", email: "maria@uniaogrifes.com.br", role: "VENDEDOR" as const },
      { name: "Pedro", email: "pedro@uniaogrifes.com.br", role: "VENDEDOR" as const },
    ].map((u) => db.user.create({ data: { ...u, passwordHash, tenantId: tenant.id } })),
  );

  const productData = [
    { name: "Camiseta Oversized", category: "Roupas", price: "89.90" },
    { name: "Camiseta Básica", category: "Roupas", price: "59.90" },
    { name: "Calça Jeans", category: "Roupas", price: "159.90" },
    { name: "Tênis Nike", category: "Tênis", price: "299.90" },
    { name: "Tênis Adidas", category: "Tênis", price: "279.90" },
    { name: "Boné", category: "Bonés", price: "79.90" },
  ];
  const products = await Promise.all(productData.map((p) => db.product.create({ data: { ...p, price: D(p.price), stock: 30, tenantId: tenant.id } })));

  const sellers = [joao, maria, pedro, admin];
  const sellerWeights = [0.34, 0.3, 0.26, 0.1];
  const pickSeller = () => {
    let r = rnd();
    for (let i = 0; i < sellers.length; i++) {
      r -= sellerWeights[i];
      if (r <= 0) return sellers[i];
    }
    return sellers[0];
  };
  const payments: PaymentMethod[] = ["PIX", "PIX", "PIX", "CREDITO", "CREDITO", "DEBITO", "DINHEIRO", "DINHEIRO", "OUTRO"];
  const avulsos = [
    { description: "Cinto", price: "69.90" },
    { description: "Meias (kit)", price: "39.90" },
    { description: "Tênis", price: "350.00" },
    { description: "Carteira", price: "49.90" },
    { description: "Óculos", price: "120.00" },
  ];

  const now = new Date();
  const today = startOfDayBR(now);
  let number = 0;
  const DAYS = 40;

  for (let back = DAYS; back >= 0; back--) {
    const dayStart = new Date(today.getTime() - back * DAY);
    const isToday = back === 0;
    const salesCount = isToday ? 8 : 6 + Math.floor(rnd() * 10);

    const register = await db.cashRegister.create({
      data: {
        tenantId: tenant.id,
        openedById: admin.id,
        openingAmount: D(200),
        openedAt: new Date(dayStart.getTime() + 8 * 3600 * 1000),
        status: isToday ? "OPEN" : "CLOSED",
      },
    });

    let daySales = D(0);
    const times: number[] = [];
    const span = isToday ? Math.max(now.getTime() - dayStart.getTime(), 60_000) : 11 * 3600 * 1000;
    const base = isToday ? dayStart.getTime() : dayStart.getTime() + 8 * 3600 * 1000;
    for (let i = 0; i < salesCount; i++) times.push(base + Math.floor(rnd() * span));
    times.sort((a, b) => a - b);

    for (const t of times) {
      const lines: { productId: string | null; description: string; unitPrice: Prisma.Decimal; quantity: number }[] = [];
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.15) {
          const a = pick(avulsos);
          lines.push({ productId: null, description: a.description, unitPrice: D(a.price), quantity: 1 });
        } else {
          const p = pick(products);
          lines.push({ productId: p.id, description: p.name, unitPrice: p.price, quantity: rnd() < 0.2 ? 2 : 1 });
        }
      }
      const subtotal = lines.reduce((a, l) => a.plus(l.unitPrice.mul(l.quantity)), D(0));
      const discount = rnd() < 0.12 ? D(Math.min(Math.floor(subtotal.toNumber() * 0.1), 50)) : D(0);
      const total = subtotal.minus(discount);
      const canceled = rnd() < 0.05;
      number++;
      const seller = pickSeller();
      await db.sale.create({
        data: {
          tenantId: tenant.id,
          number,
          sellerId: seller.id,
          createdById: seller.id,
          cashRegisterId: register.id,
          subtotal,
          discount,
          total,
          paymentMethod: pick(payments),
          status: canceled ? "CANCELED" : "COMPLETED",
          createdAt: new Date(t),
          ...(canceled ? { canceledAt: new Date(t + 600_000), canceledById: admin.id, cancelReason: "Cliente desistiu" } : {}),
          items: {
            create: lines.map((l) => ({
              tenantId: tenant.id,
              productId: l.productId,
              description: l.description,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              total: l.unitPrice.mul(l.quantity),
            })),
          },
        },
      });
      if (!canceled) daySales = daySales.plus(total);
    }

    if (isToday) {
      await db.cashMovement.create({
        data: { tenantId: tenant.id, cashRegisterId: register.id, type: "OUT", amount: D(20), description: "Lanche equipe", createdById: admin.id },
      });
    } else {
      const expected = D(200).plus(daySales);
      const diff = back === 3 ? D(-20) : D(0);
      await db.cashRegister.update({
        where: { id: register.id },
        data: {
          closedAt: new Date(dayStart.getTime() + 19 * 3600 * 1000),
          closedById: admin.id,
          expectedAmount: expected,
          countedAmount: expected.plus(diff),
          difference: diff,
          notes: back === 3 ? "Diferença no troco" : null,
        },
      });
    }
  }

  await db.tenant.update({ where: { id: tenant.id }, data: { saleCounter: number } });
  console.log(`Seed concluído: loja "${tenant.name}", 4 usuários, ${products.length} produtos, ${number} vendas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
