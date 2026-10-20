import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, verifyToken } from "@/lib/token";
import type { Ctx } from "./context";
import { AppError } from "@/lib/errors";

/** Sessão dentro de uma empresa (usuário da empresa OU super admin "entrado" nela). */
export interface SessionUser extends Ctx {
  email: string;
  tenantName: string;
  /** true quando é um super admin operando dentro da empresa. */
  isSuper: boolean;
}

export interface SuperSession {
  id: string;
  name: string;
  email: string;
}

export type Principal =
  | { kind: "tenant"; user: SessionUser }
  | { kind: "super"; admin: SuperSession; acting: SessionUser | null };

/**
 * Lê a sessão e CONFIRMA no banco a cada request: usuário/super admin ativo, empresa existente e (para usuários de empresa) não suspensa.
 * Desativações, trocas de perfil e suspensões valem imediatamente.
 */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const store = await cookies();
  const payload = await verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  if (payload.sa) {
    const sa = await db.superAdmin.findFirst({ where: { id: payload.uid, active: true }, select: { id: true, name: true, email: true } });
    if (!sa) return null;
    let acting: SessionUser | null = null;
    if (payload.tid) {
      const t = await db.tenant.findUnique({ where: { id: payload.tid }, select: { id: true, name: true } });
      if (t) acting = { userId: sa.id, tenantId: t.id, role: "ADMIN", name: sa.name, email: sa.email, tenantName: t.name, superAdminId: sa.id, isSuper: true };
    }
    return { kind: "super", admin: sa, acting };
  }

  if (!payload.tid) return null;
  const user = await db.user.findFirst({
    where: { id: payload.uid, tenantId: payload.tid, active: true, tenant: { active: true } },
    select: { id: true, tenantId: true, name: true, email: true, role: true, tenant: { select: { name: true } } },
  });
  if (!user) return null;
  return {
    kind: "tenant",
    user: { userId: user.id, tenantId: user.tenantId, name: user.name, email: user.email, role: user.role, tenantName: user.tenant.name, isSuper: false },
  };
});

/** Sessão no contexto de uma empresa (ou null). Super admin só tem contexto de empresa quando "entrou" nela. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const p = await getPrincipal();
  if (!p) return null;
  return p.kind === "tenant" ? p.user : p.acting;
});

/** Para páginas de empresa: sem login -> /login; super admin fora de empresa -> painel /super. */
export async function requirePage(opts: { admin?: boolean } = {}): Promise<SessionUser> {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  const s = p.kind === "tenant" ? p.user : p.acting;
  if (!s) redirect("/super");
  if (opts.admin && s.role !== "ADMIN") redirect("/nova-venda");
  return s;
}

/** Para páginas da plataforma (/super): somente super admin. */
export async function requireSuperPage(): Promise<{ admin: SuperSession; acting: SessionUser | null }> {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  if (p.kind !== "super") redirect("/");
  return { admin: p.admin, acting: p.acting };
}

/** Para Server Actions / route handlers de empresa: lança erro se não houver contexto de empresa. */
export async function requireCtx(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Sessão expirada. Entre novamente.");
  return s;
}

/** Para Server Actions da plataforma. A autorização real é revalidada no banco por cada serviço (requireSuper). */
export async function requireSuperCtx(): Promise<{ superAdminId: string; name: string }> {
  const p = await getPrincipal();
  if (!p || p.kind !== "super") throw new AppError("FORBIDDEN", "Acesso restrito ao super admin.");
  return { superAdminId: p.admin.id, name: p.admin.name };
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  // Secure só quando a requisição chegou por HTTPS (atrás de proxy: x-forwarded-proto).
  // Em HTTP puro um cookie Secure seria descartado pelo navegador e o login "não pegaria".
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
