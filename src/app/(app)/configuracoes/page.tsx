import { requirePage } from "@/server/auth";
import { getTenant } from "@/server/settings";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const s = await requirePage({ admin: true });
  const t = await getTenant(s);
  return <SettingsClient initial={{ name: t.name, logoUrl: t.logoUrl ?? "", address: t.address ?? "", phone: t.phone ?? "", instagram: t.instagram ?? "", allowDiscount: t.allowDiscount, allowCustomItems: t.allowCustomItems, allowCancel: t.allowCancel }} />;
}
