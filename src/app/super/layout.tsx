import { requireSuperPage } from "@/server/auth";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { DEFAULT_SUPER_EMAIL } from "@/lib/default-super";
import { SuperShell } from "@/components/layout/super-shell";

export const dynamic = "force-dynamic";

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireSuperPage();
  const usingDefault = admin.email === DEFAULT_SUPER_EMAIL;
  return (
    <SuperShell admin={{ name: admin.name }}>
      {usingDefault && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Você entrou com a <b>conta padrão</b> (credenciais públicas). Crie o seu próprio super admin em <Link href="/super/admins" className="font-bold underline">Super admins</Link>, entre com ele e apague esta conta.
          </p>
        </div>
      )}
      {children}
    </SuperShell>
  );
}
