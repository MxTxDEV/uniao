import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validate";
import { audit } from "./audit";

const MAX_FAILS = 8;
const WINDOW_MS = 15 * 60 * 1000;
// Hash falso (válido) para igualar o tempo de resposta quando o e-mail não existe.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("senha-inexistente", 12));

const loginSchema = z.object({
  email: z.string({ message: "Informe o e-mail." }).trim().toLowerCase().email("E-mail inválido.").max(200),
  password: z.string({ message: "Informe a senha." }).min(1, "Informe a senha.").max(200),
});

export type LoginResult = { kind: "tenant"; userId: string; tenantId: string } | { kind: "super"; userId: string };

export async function authenticate(input: unknown): Promise<LoginResult> {
  const { email, password } = parse(loginSchema, input);

  // Limite de tentativas por e-mail (força bruta), baseado no log de auditoria.
  const fails = await db.auditLog.count({
    where: {
      action: "LOGIN_FAILED",
      entityId: email,
      createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
    },
  });
  if (fails >= MAX_FAILS) {
    throw new AppError("RULE", "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }

  // E-mail é único no sistema todo: procura usuário de empresa e, se não houver, super admin.
  const user = await db.user.findUnique({ where: { email }, include: { tenant: { select: { active: true } } } });
  const superAdmin = user ? null : await db.superAdmin.findUnique({ where: { email } });
  const hash = user?.passwordHash ?? superAdmin?.passwordHash ?? getDummyHash();
  const ok = await bcrypt.compare(password, hash);

  if (superAdmin && ok && superAdmin.active) {
    await audit({ tenantId: null, userId: superAdmin.id, action: "SUPER_LOGIN", entity: "SuperAdmin", entityId: superAdmin.id });
    return { kind: "super", userId: superAdmin.id };
  }

  if (!user || !ok || !user.active) {
    await audit({
      tenantId: user?.tenantId ?? null,
      userId: user?.id ?? superAdmin?.id ?? null,
      action: "LOGIN_FAILED",
      entity: user ? "User" : superAdmin ? "SuperAdmin" : "User",
      entityId: email,
    });
    throw new AppError("UNAUTHENTICATED", "E-mail ou senha incorretos.");
  }
  // Senha correta, mas a empresa está suspensa: mensagem explícita (só após validar a senha, para não vazar nada a terceiros).
  if (!user.tenant.active) {
    throw new AppError("FORBIDDEN", "Esta empresa está suspensa. Entre em contato com o suporte.");
  }
  await audit({ tenantId: user.tenantId, userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
  return { kind: "tenant", userId: user.id, tenantId: user.tenantId };
}
