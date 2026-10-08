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

export async function authenticate(input: unknown): Promise<{ userId: string; tenantId: string }> {
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

  const user = await db.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  if (!user || !ok || !user.active) {
    await audit({
      tenantId: user?.tenantId ?? null,
      userId: user?.id ?? null,
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: email,
    });
    throw new AppError("UNAUTHENTICATED", "E-mail ou senha incorretos.");
  }
  await audit({ tenantId: user.tenantId, userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
  return { userId: user.id, tenantId: user.tenantId };
}
