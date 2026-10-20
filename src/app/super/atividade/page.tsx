import { Activity } from "lucide-react";
import { requireSuperCtx } from "@/server/auth";
import { listActivity } from "@/server/platform";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Atividade" };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  LOGIN: "Login",
  LOGOUT: "Saída",
  LOGIN_FAILED: "Falha de login",
  SUPER_LOGIN: "Login de super admin",
  SUPER_ENTER_TENANT: "Super admin entrou na empresa",
  SUPER_ADMIN_CREATE: "Super admin criado",
  SUPER_ADMIN_UPDATE: "Super admin alterado",
  SUPER_PASSWORD_CHANGE: "Senha de super admin alterada",
  PLATFORM_TENANT_CREATE: "Empresa criada",
  PLATFORM_TENANT_UPDATE: "Empresa alterada",
  PLATFORM_TENANT_SUSPEND: "Empresa suspensa",
  PLATFORM_TENANT_ACTIVATE: "Empresa reativada",
  SALE_CREATE: "Venda registrada",
  SALE_CANCEL: "Venda cancelada",
  CASH_OPEN: "Caixa aberto",
  CASH_CLOSE: "Caixa fechado",
  CASH_MOVEMENT: "Movimentação de caixa",
  STOCK_ENTRY: "Entrada de estoque",
  PRODUCT_CREATE: "Produto criado",
  PRODUCT_UPDATE: "Produto alterado",
  PRODUCT_ACTIVATE: "Produto ativado",
  PRODUCT_DEACTIVATE: "Produto desativado",
  USER_CREATE: "Usuário criado",
  USER_UPDATE: "Usuário alterado",
  PASSWORD_CHANGE: "Senha alterada",
  SETTINGS_UPDATE: "Configurações alteradas",
};

export default async function AtividadePage() {
  const sc = await requireSuperCtx();
  const rows = await listActivity(sc, 150);
  return (
    <div>
      <PageHeader title="Atividade" description="Últimas 150 ações críticas em todas as empresas." />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Activity className="h-6 w-6" />} title="Sem atividade ainda" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="tabular w-36 shrink-0 text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                <span className={`font-semibold ${r.action === "LOGIN_FAILED" ? "text-danger" : ""}`}>{LABEL[r.action] ?? r.action}</span>
                <span className="text-muted-foreground">{r.tenantName} · {r.actorName}{r.detail ? ` · ${r.detail}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
