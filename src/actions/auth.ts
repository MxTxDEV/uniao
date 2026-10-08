"use server";
import { redirect } from "next/navigation";
import { authenticate } from "@/server/auth-service";
import { clearSessionCookie, getSession, setSessionCookie } from "@/server/auth";
import { signToken } from "@/lib/token";
import { toErrorMessage } from "@/lib/errors";
import { audit } from "@/server/audit";

export async function loginAction(_prev: { error?: string; email?: string } | undefined, formData: FormData): Promise<{ error?: string; email?: string }> {
  try {
    const { userId, tenantId } = await authenticate({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    await setSessionCookie(await signToken({ uid: userId, tid: tenantId }));
  } catch (e) {
    return { error: toErrorMessage(e), email: String(formData.get("email") ?? "") };
  }
  redirect("/");
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await audit({ tenantId: s.tenantId, userId: s.userId, action: "LOGOUT", entity: "User", entityId: s.userId });
  await clearSessionCookie();
  redirect("/login");
}
