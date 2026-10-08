import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Ctx } from "@/server/context";

export async function resetDb() {
  await db.$executeRawUnsafe(
    `TRUNCATE "AuditLog","CashMovement","SaleItem","Sale","CashRegister","Product","User","Tenant" RESTART IDENTITY CASCADE`,
  );
}

let seq = 0;
const hash = bcrypt.hashSync("senha1234", 4);

export async function makeTenant(name = "Loja " + ++seq) {
  const tenant = await db.tenant.create({ data: { name } });
  const mk = (n: string, role: "ADMIN" | "VENDEDOR") =>
    db.user.create({ data: { tenantId: tenant.id, name: n, email: `${n.toLowerCase()}${++seq}@t.com`, passwordHash: hash, role } });
  const [admin, seller1, seller2] = await Promise.all([mk("Admin", "ADMIN"), mk("Ana", "VENDEDOR"), mk("Beto", "VENDEDOR")]);
  const camiseta = await db.product.create({ data: { tenantId: tenant.id, name: "Camiseta", category: "Roupas", price: "89.90" } });
  const bone = await db.product.create({ data: { tenantId: tenant.id, name: "Boné", category: "Bonés", price: "79.90" } });
  const ctx = (u: { id: string; role: "ADMIN" | "VENDEDOR"; name: string }): Ctx => ({ tenantId: tenant.id, userId: u.id, role: u.role, name: u.name });
  return {
    tenant,
    admin,
    seller1,
    seller2,
    camiseta,
    bone,
    adminCtx: ctx(admin),
    s1Ctx: ctx(seller1),
    s2Ctx: ctx(seller2),
  };
}

let reqSeq = 0;
export const rid = () => `req-${Date.now()}-${++reqSeq}-xxxxxxxx`;

export function saleInput(items: unknown[], extra: Record<string, unknown> = {}) {
  return { requestId: rid(), paymentMethod: "PIX", discount: "0", items, ...extra };
}
