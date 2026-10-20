import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const emailSchema = z.string({ message: "Informe o e-mail." }).trim().toLowerCase().email("E-mail inválido.").max(200);
export const passwordSchema = z.string({ message: "Informe a senha." }).min(8, "A senha deve ter ao menos 8 caracteres.").max(100, "Senha muito longa.");

/** E-mail é identidade única no sistema inteiro: vale para usuários de qualquer empresa e para super admins. */
export async function assertEmailFree(email: string, ignore?: { userId?: string; superAdminId?: string }): Promise<void> {
  const [u, s] = await Promise.all([db.user.findUnique({ where: { email }, select: { id: true } }), db.superAdmin.findUnique({ where: { email }, select: { id: true } })]);
  if ((u && u.id !== ignore?.userId) || (s && s.id !== ignore?.superAdminId)) {
    throw new AppError("CONFLICT", "Já existe um usuário com este e-mail.");
  }
}

/** Nomes para exibição de quem fez uma ação (usuário da empresa ou super admin). */
export async function resolveNames(tenantId: string, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (uniq.length === 0) return new Map();
  const [users, supers] = await Promise.all([
    db.user.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, name: true } }),
    db.superAdmin.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } }),
  ]);
  const m = new Map<string, string>();
  for (const s of supers) m.set(s.id, `${s.name} (super admin)`);
  for (const u of users) m.set(u.id, u.name);
  return m;
}
