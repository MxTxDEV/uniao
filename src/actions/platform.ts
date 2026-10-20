"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { run } from "@/lib/errors";
import { signToken } from "@/lib/token";
import { requireSuperCtx, setSessionCookie } from "@/server/auth";
import {
  changeOwnSuperPassword,
  createSuperAdmin,
  createTenant,
  createTenantUser,
  enterTenant,
  updateSuperAdmin,
  updateTenant,
  updateTenantUser,
} from "@/server/platform";

const refresh = () => revalidatePath("/super", "layout");

export async function createTenantAction(input: unknown) {
  return run(async () => {
    const sc = await requireSuperCtx();
    const t = await createTenant(sc, input);
    refresh();
    return t;
  });
}

export async function updateTenantAction(id: string, input: unknown) {
  return run(async () => {
    const sc = await requireSuperCtx();
    await updateTenant(sc, id, input);
    refresh();
  });
}

/** Entra na empresa como super admin: emite uma sessão com sa + tid e leva ao dashboard da empresa. */
export async function enterTenantAction(tenantId: string) {
  return run(async () => {
    const sc = await requireSuperCtx();
    await enterTenant(sc, tenantId);
    await setSessionCookie(await signToken({ uid: sc.superAdminId, sa: true, tid: tenantId }));
    redirect("/dashboard");
  });
}

/** Sai da empresa e volta ao painel da plataforma (mantém o login de super admin). */
export async function exitTenantAction() {
  const sc = await requireSuperCtx();
  await setSessionCookie(await signToken({ uid: sc.superAdminId, sa: true }));
  redirect("/super");
}

export async function createTenantUserAction(tenantId: string, input: unknown) {
  return run(async () => {
    const sc = await requireSuperCtx();
    const u = await createTenantUser(sc, tenantId, input);
    refresh();
    return u;
  });
}

export async function updateTenantUserAction(userId: string, input: unknown) {
  return run(async () => {
    const sc = await requireSuperCtx();
    const u = await updateTenantUser(sc, userId, input);
    refresh();
    return u;
  });
}

export async function createSuperAdminAction(input: unknown) {
  return run(async () => {
    const sc = await requireSuperCtx();
    const u = await createSuperAdmin(sc, input);
    refresh();
    return u;
  });
}

export async function updateSuperAdminAction(id: string, input: unknown) {
  return run(async () => {
    const sc = await requireSuperCtx();
    const u = await updateSuperAdmin(sc, id, input);
    refresh();
    return u;
  });
}

export async function changeSuperPasswordAction(input: unknown) {
  return run(async () => {
    const sc = await requireSuperCtx();
    await changeOwnSuperPassword(sc, input);
  });
}
