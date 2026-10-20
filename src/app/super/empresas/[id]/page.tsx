import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSuperCtx } from "@/server/auth";
import { getTenantDetail } from "@/server/platform";
import { AppError } from "@/lib/errors";
import { TenantClient } from "./tenant-client";

export const metadata = { title: "Empresa" };

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const sc = await requireSuperCtx();
  const { id } = await params;
  let data;
  try {
    data = await getTenantDetail(sc, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  return (
    <div>
      <Link href="/super" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Empresas
      </Link>
      <TenantClient {...data} />
    </div>
  );
}
