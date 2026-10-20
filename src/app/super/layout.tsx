import { requireSuperPage } from "@/server/auth";
import { SuperShell } from "@/components/layout/super-shell";

export const dynamic = "force-dynamic";

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireSuperPage();
  return <SuperShell admin={{ name: admin.name }}>{children}</SuperShell>;
}
