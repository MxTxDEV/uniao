import { requirePage } from "@/server/auth";
import { listActiveProducts } from "@/server/products";
import { listActiveSellers } from "@/server/users";
import { getTenant } from "@/server/settings";
import { PosScreen } from "./pos-screen";

export const metadata = { title: "Nova venda" };
export const dynamic = "force-dynamic";

export default async function NovaVendaPage() {
  const s = await requirePage();
  const [products, sellers, tenant] = await Promise.all([listActiveProducts(s), listActiveSellers(s), getTenant(s)]);
  return (
    <PosScreen
      products={products}
      sellers={s.role === "ADMIN" ? sellers : sellers.filter((x) => x.id === s.userId)}
      currentUserId={s.userId}
      canPickSeller={s.role === "ADMIN"}
      settings={{ allowDiscount: tenant.allowDiscount, allowCustomItems: tenant.allowCustomItems }}
      store={{ name: tenant.name, phone: tenant.phone, instagram: tenant.instagram, address: tenant.address }}
    />
  );
}
