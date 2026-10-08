import { requirePage } from "@/server/auth";
import { listProducts } from "@/server/products";
import { ProductsClient } from "./products-client";

export const metadata = { title: "Produtos" };
export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const s = await requirePage({ admin: true });
  const products = await listProducts(s);
  return <ProductsClient products={products} />;
}
