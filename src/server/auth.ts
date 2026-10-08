import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, verifyToken } from "@/lib/token";
import type { Ctx } from "./context";
import { AppError } from "@/lib/errors";

export interface SessionUser extends Ctx {
  email: string;
  tenantName: string;
}

/** Lê a sessão e CONFIRMA no banco (usuário ativo, mesmo tenant): desativações/trocas de perfil valem na hora. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const payload = await verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await db.user.findFirst({
    where: { id: payload.uid, tenantId: payload.tid, active: true },
    select: { id: true, tenantId: true, name: true, email: true, role: true, tenant: { select: { name: true } } },
  });
  if (!user) return null;
  return {
    userId: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantName: user.tenant.name,
  };
});

/** Para páginas: redireciona ao login se não autenticado. */
export async function requirePage(opts: { admin?: boolean } = {}): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (opts.admin && s.role !== "ADMIN") redirect("/nova-venda");
  return s;
}

/** Para Server Actions / route handlers: lança erro se não autenticado. */
export async function requireCtx(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Sessão expirada. Entre novamente.");
  return s;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
