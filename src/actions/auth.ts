"use server";
import { redirect } from "next/navigation";
import { authenticate } from "@/server/auth-service";
import { clearSessionCookie, getPrincipal, setSessionCookie } from "@/server/auth";
import { signToken } from "@/lib/token";
import { toErrorMessage } from "@/lib/errors";
import { audit } from "@/server/audit";

export async function loginAction(_prev: { error?: string; email?: string } | undefined, formData: FormData): Promise<{ error?: string; email?: string }> {
  try {
    const r = await authenticate({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    await setSessionCookie(await signToken(r.kind === "super" ? { uid: r.userId, sa: true } : { uid: r.userId, tid: r.tenantId }));
  } catch (e) {
    return { error: toErrorMessage(e), email: String(formData.get("email") ?? "") };
  }
  redirect("/");
}

export async function logoutAction() {
  const p = await getPrincipal();
  if (p?.kind === "tenant") await audit({ tenantId: p.user.tenantId, userId: p.user.userId, action: "LOGOUT", entity: "User", entityId: p.user.userId });
  await clearSessionCookie();
  redirect("/login");
}
