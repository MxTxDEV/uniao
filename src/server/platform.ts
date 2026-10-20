import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { Decimal, dec } from "@/lib/money";
import { addDays, startOfDayBR, startOfMonthBR } from "@/lib/dates";
import { optionalText, parse, text } from "@/lib/validate";
import { audit } from "./audit";
import type { Ctx } from "./context";
import { assertEmailFree, emailSchema, passwordSchema } from "./identity";
import { createUser, updateUser, type UserDTO } from "./users";

/** Quem está agindo na plataforma. O id é SEMPRE revalidado no banco (nunca confiamos no objeto recebido). */
export interface SuperCtx {
  superAdminId: string;
}

async function requireSuper(sc: SuperCtx) {
  const sa = sc?.superAdminId ? await db.superAdmin.findFirst({ where: { id: sc.superAdminId, active: true } }) : null;
  if (!sa) throw new AppError("FORBIDDEN", "Acesso restrito ao super admin.");
  return sa;
}

/** Contexto "dentro da empresa" para reaproveitar os serviços da empresa (mesmas regras de negócio). */
export function tenantCtxFor(sc: SuperCtx, tenantId: string, name = "Super admin"): Ctx {
  return { tenantId, userId: sc.superAdminId, role: "ADMIN", name, superAdminId: sc.superAdminId };
}

async function requireTenant(id: string) {
  const t = await db.tenant.findUnique({ where: { id } });
  if (!t) throw new AppError("NOT_FOUND", "Empresa não encontrada.");
  return t;
}

// ───────────────────────── Empresas ─────────────────────────

export interface TenantRow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  activeUsers: number;
  monthSales: number;
  monthRevenue: string;
}

export async function listTenants(sc: SuperCtx) {
  await requireSuper(sc);
  const now = new Date();
  const start = startOfMonthBR(now);
  const end = addDays(startOfDayBR(now), 1);
  const [tenants, users, sales] = await Promise.all([
    db.tenant.findMany({ orderBy: { name: "asc" } }),
    db.user.groupBy({ by: ["tenantId"], where: { active: true }, _count: true }),
    db.sale.groupBy({ by: ["tenantId"], where: { status: "COMPLETED", createdAt: { gte: start, lt: end } }, _sum: { total: true }, _count: true }),
  ]);
  const rows: TenantRow[] = tenants.map((t) => {
    const u = users.find((x) => x.tenantId === t.id);
    const s = sales.find((x) => x.tenantId === t.id);
    return {
      id: t.id,
      name: t.name,
      active: t.active,
      createdAt: t.createdAt.toISOString(),
      activeUsers: u?._count ?? 0,
      monthSales: s?._count ?? 0,
      monthRevenue: dec(s?._sum.total),
    };
  });
  const totals = {
    tenants: rows.length,
    activeTenants: rows.filter((r) => r.active).length,
    users: rows.reduce((a, r) => a + r.activeUsers, 0),
    monthSales: rows.reduce((a, r) => a + r.monthSales, 0),
    monthRevenue: dec(rows.reduce((a, r) => a.plus(r.monthRevenue), new Decimal(0))),
  };
  return { rows, totals };
}

const createTenantSchema = z.object({
  companyName: text(100, "Nome da empresa"),
  adminName: text(100, "Nome do administrador"),
  adminEmail: emailSchema,
  adminPassword: passwordSchema,
});

/** Cria a empresa e o primeiro administrador dela. */
export async function createTenant(sc: SuperCtx, input: unknown): Promise<{ id: string }> {
  const sa = await requireSuper(sc);
  const d = parse(createTenantSchema, input);
  await assertEmailFree(d.adminEmail);
  const passwordHash = await bcrypt.hash(d.adminPassword, 12);
  const tenant = await db.$transaction(async (tx) => {
    const t = await tx.tenant.create({ data: { name: d.companyName } });
    const u = await tx.user.create({ data: { tenantId: t.id, name: d.adminName, email: d.adminEmail, role: "ADMIN", passwordHash } });
    await audit({ tenantId: t.id, userId: sa.id, action: "PLATFORM_TENANT_CREATE", entity: "Tenant", entityId: t.id, meta: { name: t.name, adminEmail: u.email } }, tx);
    return t;
  });
  return { id: tenant.id };
}

export async function getTenantDetail(sc: SuperCtx, id: string) {
  await requireSuper(sc);
  const t = await requireTenant(id);
  const since = addDays(startOfDayBR(), -29);
  const [users, products, salesAll, sales30, admins] = await Promise.all([
    db.user.count({ where: { tenantId: id, active: true } }),
    db.product.count({ where: { tenantId: id } }),
    db.sale.count({ where: { tenantId: id } }),
    db.sale.aggregate({ where: { tenantId: id, status: "COMPLETED", createdAt: { gte: since } }, _sum: { total: true }, _count: true }),
    db.user.findMany({ where: { tenantId: id, role: "ADMIN" }, select: { id: true, name: true, email: true, active: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    tenant: {
      id: t.id,
      name: t.name,
      active: t.active,
      phone: t.phone ?? "",
      address: t.address ?? "",
      instagram: t.instagram ?? "",
      internalNotes: t.internalNotes ?? "",
      createdAt: t.createdAt.toISOString(),
    },
    stats: { users, products, salesAll, sales30: sales30._count, revenue30: dec(sales30._sum.total) },
    admins,
  };
}

const updateTenantSchema = z.object({
  name: text(100, "Nome da empresa"),
  active: z.boolean(),
  phone: optionalText(30, "Telefone"),
  address: optionalText(200, "Endereço"),
  instagram: optionalText(60, "Instagram"),
  internalNotes: optionalText(1000, "Anotações"),
});

export async function updateTenant(sc: SuperCtx, id: string, input: unknown): Promise<void> {
  const sa = await requireSuper(sc);
  const d = parse(updateTenantSchema, input);
  const before = await requireTenant(id);
  await db.tenant.update({ where: { id }, data: d });
  await audit({
    tenantId: id,
    userId: sa.id,
    action: before.active !== d.active ? (d.active ? "PLATFORM_TENANT_ACTIVATE" : "PLATFORM_TENANT_SUSPEND") : "PLATFORM_TENANT_UPDATE",
    entity: "Tenant",
    entityId: id,
    meta: { name: d.name, active: d.active },
  });
}

/** Valida que o super admin pode entrar na empresa (o cookie é emitido pela action). */
export async function enterTenant(sc: SuperCtx, tenantId: string): Promise<{ name: string }> {
  const sa = await requireSuper(sc);
  const t = await requireTenant(tenantId);
  await audit({ tenantId, userId: sa.id, action: "SUPER_ENTER_TENANT", entity: "Tenant", entityId: tenantId, meta: { superAdmin: sa.email } });
  return { name: t.name };
}

// ───────────────────── Usuários de todas as empresas ─────────────────────

export interface PlatformUser extends UserDTO {
  tenantId: string;
  tenantName: string;
}

export async function listAllUsers(sc: SuperCtx, tenantId?: string): Promise<PlatformUser[]> {
  await requireSuper(sc);
  const rows = await db.user.findMany({
    where: tenantId ? { tenantId } : {},
    include: { tenant: { select: { name: true } } },
    orderBy: [{ tenant: { name: "asc" } }, { active: "desc" }, { name: "asc" }],
    take: 2000,
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    tenantId: u.tenantId,
    tenantName: u.tenant.name,
  }));
}

export async function createTenantUser(sc: SuperCtx, tenantId: string, input: unknown): Promise<UserDTO> {
  await requireSuper(sc);
  await requireTenant(tenantId);
  return createUser(tenantCtxFor(sc, tenantId), input);
}

export async function updateTenantUser(sc: SuperCtx, userId: string, input: unknown): Promise<UserDTO> {
  await requireSuper(sc);
  const u = await db.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  if (!u) throw new AppError("NOT_FOUND", "Funcionário não encontrado.");
  return updateUser(tenantCtxFor(sc, u.tenantId), userId, input);
}

// ───────────────────────── Super admins ─────────────────────────

export interface SuperAdminDTO {
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
}

const saSelect = { id: true, name: true, email: true, active: true, createdAt: true } as const;
const toSA = (s: { id: string; name: string; email: string; active: boolean; createdAt: Date }): SuperAdminDTO => ({ ...s, createdAt: s.createdAt.toISOString() });

export async function listSuperAdmins(sc: SuperCtx): Promise<SuperAdminDTO[]> {
  await requireSuper(sc);
  return (await db.superAdmin.findMany({ select: saSelect, orderBy: [{ active: "desc" }, { name: "asc" }] })).map(toSA);
}

const createSASchema = z.object({ name: text(100, "Nome"), email: emailSchema, password: passwordSchema });

export async function createSuperAdmin(sc: SuperCtx, input: unknown): Promise<SuperAdminDTO> {
  const sa = await requireSuper(sc);
  const d = parse(createSASchema, input);
  await assertEmailFree(d.email);
  const created = await db.superAdmin.create({ data: { name: d.name, email: d.email, passwordHash: await bcrypt.hash(d.password, 12) }, select: saSelect });
  await audit({ tenantId: null, userId: sa.id, action: "SUPER_ADMIN_CREATE", entity: "SuperAdmin", entityId: created.id, meta: { email: created.email } });
  return toSA(created);
}

const updateSASchema = z.object({
  name: text(100, "Nome"),
  active: z.boolean(),
  password: z.string().max(100).optional().transform((v) => (v ? v : undefined)).pipe(passwordSchema.optional()),
});

export async function updateSuperAdmin(sc: SuperCtx, id: string, input: unknown): Promise<SuperAdminDTO> {
  const sa = await requireSuper(sc);
  const d = parse(updateSASchema, input);
  const target = await db.superAdmin.findUnique({ where: { id } });
  if (!target) throw new AppError("NOT_FOUND", "Super admin não encontrado.");
  if (id === sa.id && !d.active) throw new AppError("RULE", "Você não pode desativar a si mesmo.");
  if (target.active && !d.active) {
    const others = await db.superAdmin.count({ where: { active: true, id: { not: id } } });
    if (others === 0) throw new AppError("RULE", "A plataforma precisa de ao menos um super admin ativo.");
  }
  const updated = await db.superAdmin.update({
    where: { id },
    data: { name: d.name, active: d.active, ...(d.password ? { passwordHash: await bcrypt.hash(d.password, 12) } : {}) },
    select: saSelect,
  });
  await audit({ tenantId: null, userId: sa.id, action: "SUPER_ADMIN_UPDATE", entity: "SuperAdmin", entityId: id, meta: { active: d.active, passwordChanged: !!d.password } });
  return toSA(updated);
}

const ownPwSchema = z.object({
  current: z.string({ message: "Informe a senha atual." }).min(1, "Informe a senha atual.").max(100),
  next: passwordSchema,
});

export async function changeOwnSuperPassword(sc: SuperCtx, input: unknown): Promise<void> {
  const sa = await requireSuper(sc);
  const d = parse(ownPwSchema, input);
  if (!(await bcrypt.compare(d.current, sa.passwordHash))) throw new AppError("VALIDATION", "Senha atual incorreta.");
  await db.superAdmin.update({ where: { id: sa.id }, data: { passwordHash: await bcrypt.hash(d.next, 12) } });
  await audit({ tenantId: null, userId: sa.id, action: "SUPER_PASSWORD_CHANGE", entity: "SuperAdmin", entityId: sa.id });
}

// ───────────────────────── Atividade ─────────────────────────

export async function listActivity(sc: SuperCtx, take = 100) {
  await requireSuper(sc);
  const rows = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take });
  const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter((x): x is string => !!x))];
  const actorIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const [tenants, users, supers] = await Promise.all([
    db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
    db.superAdmin.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
  ]);
  const tn = new Map(tenants.map((t) => [t.id, t.name]));
  const an = new Map<string, string>([...users.map((u) => [u.id, u.name] as const), ...supers.map((s) => [s.id, `${s.name} (super admin)`] as const)]);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    action: r.action,
    tenantName: r.tenantId ? tn.get(r.tenantId) ?? "—" : "Plataforma",
    actorName: r.userId ? an.get(r.userId) ?? "—" : "—",
    detail: r.entity === "User" && r.action === "LOGIN_FAILED" ? r.entityId ?? "" : "",
  }));
}
