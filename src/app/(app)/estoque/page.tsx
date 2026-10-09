import { requirePage } from "@/server/auth";
import { listProducts } from "@/server/products";
import { listStockEntries } from "@/server/stock";
import { StockClient } from "./stock-client";

export const metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const s = await requirePage({ admin: true });
  const [products, entries] = await Promise.all([listProducts(s), listStockEntries(s, 30)]);
  return <StockClient products={products.filter((p) => p.active)} entries={entries} />;
}
