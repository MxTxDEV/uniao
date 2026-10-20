import { requireSuperCtx } from "@/server/auth";
import { listTenants } from "@/server/platform";
import { CompaniesClient } from "./companies-client";

export const metadata = { title: "Empresas" };

export default async function EmpresasPage() {
  const sc = await requireSuperCtx();
  const { rows, totals } = await listTenants(sc);
  return <CompaniesClient rows={rows} totals={totals} />;
}
