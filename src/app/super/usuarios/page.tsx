import { requireSuperCtx } from "@/server/auth";
import { listAllUsers, listTenants } from "@/server/platform";
import { UsersClient } from "./users-client";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const sc = await requireSuperCtx();
  const { empresa } = await searchParams;
  const [{ rows: tenants }, users] = await Promise.all([listTenants(sc), listAllUsers(sc)]);
  const valid = tenants.some((t) => t.id === empresa) ? empresa! : "";
  return <UsersClient users={users} tenants={tenants.map((t) => ({ id: t.id, name: t.name }))} initialTenant={valid} />;
}
