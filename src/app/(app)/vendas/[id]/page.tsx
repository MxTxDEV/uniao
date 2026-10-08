import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/server/auth";
import { getSale } from "@/server/sales";
import { getTenant } from "@/server/settings";
import { AppError } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { formatBRL, dec } from "@/lib/money";
import { PAYMENT_LABEL, saleNumber } from "@/lib/utils";
import { SaleActions } from "./sale-actions";

export const metadata = { title: "Detalhes da venda" };
export const dynamic = "force-dynamic";

export default async function VendaPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage();
  const { id } = await params;
  let data;
  try {
    data = await getSale(s, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const tenant = await getTenant(s);
  const { sale, createdByName, canceledByName } = data;
  const canceled = sale.status === "CANCELED";

  const receipt = {
    number: sale.number,
    total: dec(sale.total),
    subtotal: dec(sale.subtotal),
    discount: dec(sale.discount),
    paymentMethod: sale.paymentMethod,
    sellerName: sale.seller.name,
    createdAt: sale.createdAt.toISOString(),
    items: sale.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: dec(i.unitPrice), total: dec(i.total) })),
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/vendas" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Vendas
      </Link>

      <Card className="print-area overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Detalhes da venda</p>
            <h1 className="tabular mt-1 text-3xl font-extrabold tracking-tight">{saleNumber(sale.number)}</h1>
            <p className="tabular mt-1 text-sm text-muted-foreground">{formatDateTime(sale.createdAt)}</p>
          </div>
          <StatusBadge status={sale.status} />
        </div>

        {canceled && (
          <div className="border-b border-border bg-danger-soft px-6 py-3 text-sm text-danger">
            <p className="font-semibold">Venda cancelada{canceledByName ? ` por ${canceledByName}` : ""}{sale.canceledAt ? ` em ${formatDateTime(sale.canceledAt)}` : ""}</p>
            {sale.cancelReason && <p className="mt-0.5">Motivo: {sale.cancelReason}</p>}
          </div>
        )}

        <div className="p-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Produtos</p>
          <ul className="divide-y divide-border">
            {sale.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {i.description}
                    {!i.productId && <span className="ml-2 rounded-md bg-warning-soft px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-warning">avulso</span>}
                  </p>
                  <p className="tabular text-sm text-muted-foreground">{i.quantity} × {formatBRL(i.unitPrice)}</p>
                </div>
                <p className="tabular font-semibold">{formatBRL(i.total)}</p>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular font-semibold">{formatBRL(sale.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Desconto</dt><dd className="tabular font-semibold">{sale.discount.gt(0) ? `− ${formatBRL(sale.discount)}` : formatBRL(0)}</dd></div>
            <div className="flex items-end justify-between pt-1"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Total</dt><dd className={`tabular text-3xl font-extrabold ${canceled ? "text-muted-foreground line-through" : ""}`}>{formatBRL(sale.total)}</dd></div>
          </dl>

          <dl className="mt-5 grid grid-cols-2 gap-4 rounded-2xl bg-muted/60 p-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Pagamento</dt><dd className="font-semibold">{PAYMENT_LABEL[sale.paymentMethod]}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Vendedor</dt><dd className="font-semibold">{sale.seller.name}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Registrada por</dt><dd className="font-semibold">{createdByName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Data/hora</dt><dd className="tabular font-semibold">{formatDateTime(sale.createdAt)}</dd></div>
          </dl>

          <p className="mt-6 hidden text-center text-xs text-muted-foreground print:block">{tenant.name}{tenant.instagram ? ` · ${tenant.instagram}` : ""}{tenant.phone ? ` · ${tenant.phone}` : ""}</p>
        </div>
      </Card>

      <SaleActions
        saleId={sale.id}
        number={sale.number}
        status={sale.status}
        canCancel={s.role === "ADMIN" && tenant.allowCancel}
        receipt={receipt}
        store={{ name: tenant.name, phone: tenant.phone, instagram: tenant.instagram, address: tenant.address }}
      />
    </div>
  );
}
