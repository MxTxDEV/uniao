import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parse, text } from "@/lib/validate";
import { audit } from "./audit";
import { assertAdmin, type Ctx } from "./context";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "VENDEDOR";
  active: boolean;
  createdAt: string;
}

const select = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;
const toDTO = (u: { id: string; name: string; email: string; role: "ADMIN" | "VENDEDOR"; active: boolean; createdAt: Date }): UserDTO => ({
  ...u,
  createdAt: u.createdAt.toISOString(),
});

export async function listUsers(ctx: Ctx): Promise<UserDTO[]> {
  assertAdmin(ctx);
  const rows = await db.user.findMany({ where: { tenantId: ctx.tenantId }, select, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return rows.map(toDTO);
}

/** Vendedores ativos (para o seletor do PDV). */
export async function listActiveSellers(ctx: Ctx) {
  return db.user.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

const password = z.string({ message: "Informe a senha." }).min(8, "A senha deve ter ao menos 8 caracteres.").max(100, "Senha muito longa.");
const email = z.string({ message: "Informe o e-mail." }).trim().toLowerCase().email("E-mail inválido.").max(200);
const role = z.enum(["ADMIN", "VENDEDOR"], { message: "Perfil inválido." });

const createSchema = z.object({ name: text(100, "Nome"), email, password, role });
const updateSchema = z.object({
  name: text(100, "Nome"),
  role,
  active: z.boolean(),
  password: z.string().max(100).optional().transform((v) => (v ? v : undefined)).pipe(password.optional()),
});

export async function createUser(ctx: Ctx, input: unknown): Promise<UserDTO> {
  assertAdmin(ctx);
  const d = parse(createSchema, input);
  try {
    const u = await db.user.create({
      data: { tenantId: ctx.tenantId, name: d.name, email: d.email, role: d.role, passwordHash: await bcrypt.hash(d.password, 12) },
      select,
    });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "USER_CREATE", entity: "User", entityId: u.id, meta: { email: u.email, role: u.role } });
    return toDTO(u);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "Já existe um usuário com este e-mail.");
    }
    throw e;
  }
}

export async function updateUser(ctx: Ctx, id: string, input: unknown): Promise<UserDTO> {
  assertAdmin(ctx);
  const d = parse(updateSchema, input);
  const target = await db.user.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!target) throw new AppError("NOT_FOUND", "Funcionário não encontrado.");

  if (id === ctx.userId && (!d.active || d.role !== "ADMIN")) {
    throw new AppError("RULE", "Você não pode desativar ou rebaixar a si mesmo.");
  }
  const losesAdmin = target.role === "ADMIN" && target.active && (!d.active || d.role !== "ADMIN");
  if (losesAdmin) {
    const others = await db.user.count({ where: { tenantId: ctx.tenantId, role: "ADMIN", active: true, id: { not: id } } });
    if (others === 0) throw new AppError("RULE", "A loja precisa de ao menos um administrador ativo.");
  }
  const u = await db.user.update({
    where: { id },
    data: {
      name: d.name,
      role: d.role,
      active: d.active,
      ...(d.password ? { passwordHash: await bcrypt.hash(d.password, 12) } : {}),
    },
    select,
  });
  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "USER_UPDATE",
    entity: "User",
    entityId: id,
    meta: { role: d.role, active: d.active, passwordChanged: !!d.password },
  });
  return toDTO(u);
}

const changePwSchema = z.object({
  current: z.string({ message: "Informe a senha atual." }).min(1, "Informe a senha atual.").max(100),
  next: password,
});

export async function changeOwnPassword(ctx: Ctx, input: unknown): Promise<void> {
  const d = parse(changePwSchema, input);
  const u = await db.user.findFirstOrThrow({ where: { id: ctx.userId, tenantId: ctx.tenantId } });
  if (!(await bcrypt.compare(d.current, u.passwordHash))) throw new AppError("VALIDATION", "Senha atual incorreta.");
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(d.next, 12) } });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "PASSWORD_CHANGE", entity: "User", entityId: u.id });
}
