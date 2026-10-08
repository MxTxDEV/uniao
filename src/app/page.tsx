import { redirect } from "next/navigation";
import { requirePage } from "@/server/auth";

export default async function Home() {
  const s = await requirePage();
  redirect(s.role === "ADMIN" ? "/dashboard" : "/nova-venda");
}
