import { requirePage } from "@/server/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePage();
  return (
    <AppShell user={{ name: s.name, role: s.role, tenantName: s.tenantName }}>{children}</AppShell>
  );
}
