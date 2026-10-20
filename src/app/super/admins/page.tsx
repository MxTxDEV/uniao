import { requireSuperPage, requireSuperCtx } from "@/server/auth";
import { listSuperAdmins } from "@/server/platform";
import { AdminsClient } from "./admins-client";

export const metadata = { title: "Super admins" };

export default async function AdminsPage() {
  const sc = await requireSuperCtx();
  const { admin } = await requireSuperPage();
  const admins = await listSuperAdmins(sc);
  return <AdminsClient admins={admins} currentId={admin.id} />;
}
