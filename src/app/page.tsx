import { redirect } from "next/navigation";
import { getPrincipal } from "@/server/auth";

export default async function Home() {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  if (p.kind === "super") redirect(p.acting ? "/dashboard" : "/super");
  redirect(p.user.role === "ADMIN" ? "/dashboard" : "/nova-venda");
}
