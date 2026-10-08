import { requirePage } from "@/server/auth";
import { listUsers } from "@/server/users";
import { sellersRanking } from "@/server/stats";
import { resolvePeriod } from "@/lib/dates";
import { UsersClient } from "./users-client";

export const metadata = { title: "Funcionários" };
export const dynamic = "force-dynamic";

export default async function FuncionariosPage() {
  const s = await requirePage({ admin: true });
  const period = resolvePeriod("mes");
  const [users, ranking] = await Promise.all([listUsers(s), sellersRanking(s, period)]);
  return <UsersClient users={users} ranking={ranking} currentUserId={s.userId} periodLabel={period.label} />;
}
