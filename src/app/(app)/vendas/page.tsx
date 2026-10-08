import Link from "next/link";
import { Receipt } from "lucide-react";
import { requirePage } from "@/server/auth";
import { listSales } from "@/server/sales";
import { listUsers } from "@/server/users";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { addDays, formatDate, formatDateTime, parseYmdBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { PAYMENT_LABEL, PAYMENT_ORDER, saleNumber } from "@/lib/utils";
import { SalesFilters } from "./filters";
import type { PaymentMethod, SaleStatus } from "@prisma/client";

export const metadata = { title: "Vendas" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function VendasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requirePage();
  const sp = await searchParams;
  const de = one(sp.de);
  const ate = one(sp.ate);
  const vendedor = one(sp.vendedor);
  const pagamento = one(sp.pagamento);
  const status = one(sp.status);
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);

  const from = parseYmdBR(de) ?? undefined;
  const toDay = parseYmdBR(ate);
  const data = await listSales(s, {
    from,
    to: toDay ? addDays(toDay, 1) : undefined,
    sellerId: vendedor || undefined,
    payment: (PAYMENT_ORDER as readonly string[]).includes(pagamento) ? (pagamento as PaymentMethod) : undefined,
    status: status === "COMPLETED" || status === "CANCELED" ? (status as SaleStatus) : undefined,
    page,
  });
  const sellers = s.role === "ADMIN" ? (await listUsers(s)).map((u) => ({ id: u.id, name: u.name })) : [];

  const qs = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ de, ate, vendedor, pagamento, status })) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const str = q.toString();
    return `/vendas${str ? `?${str}` : ""}`;
  };
  const hasFilters = !!(de || ate || vendedor || pagamento || status);

  return (
    <div>
      <PageHeader
        title="Vendas"
        description={s.role === "ADMIN" ? "Histórico de todas as vendas da loja." : "Suas vendas."}
        actions={
          <Button asChild>
            <Link href="/nova-venda">Nova venda</Link>
          </Button>
        }
      />

      <SalesFilters sellers={sellers} isAdmin={s.role === "ADMIN"} initial={{ de, ate, vendedor, pagamento, status }} />

      <p className="mb-3 text-sm text-muted-foreground">
        {data.count} venda{data.count === 1 ? "" : "s"} · concluídas: <span className="tabular font-semibold text-foreground">{formatBRL(data.completedTotal)}</span>
        <span className="text-xs"> (canceladas não somam)</span>
      </p>

      <Card className="overflow-hidden">
        {data.rows.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title={hasFilters ? "Nenhuma venda com esses filtros" : "Nenhuma venda registrada ainda"}
            description={hasFilters ? "Ajuste ou limpe os filtros." : "As vendas aparecerão aqui assim que forem finalizadas."}
            action={
              hasFilters ? (
                <Button variant="secondary" asChild>
                  <Link href="/vendas">Limpar filtros</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/nova-venda">Registrar venda</Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Venda</th>
                  <th className="px-3 py-3 font-semibold">Data</th>
                  <th className="px-3 py-3 font-semibold">Vendedor</th>
                  <th className="px-3 py-3 text-right font-semibold">Valor</th>
                  <th className="px-3 py-3 font-semibold">Pagamento</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.id} className="transition hover:bg-muted/50">
                    <td className="tabular px-5 py-3.5 font-semibold">
                      <Link href={`/vendas/${r.id}`} className="hover:underline">{saleNumber(r.number)}</Link>
                    </td>
                    <td className="tabular px-3 py-3.5 text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                    <td className="px-3 py-3.5">{r.seller.name}</td>
                    <td className={`tabular px-3 py-3.5 text-right font-semibold ${r.status === "CANCELED" ? "text-muted-foreground line-through" : ""}`}>{formatBRL(r.total)}</td>
                    <td className="px-3 py-3.5">{PAYMENT_LABEL[r.paymentMethod]}</td>
                    <td className="px-3 py-3.5"><StatusBadge status={r.status} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/vendas/${r.id}`} className="text-sm font-semibold underline-offset-4 hover:underline">Ver</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {data.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/vendas/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 active:bg-muted">
                    <div className="min-w-0">
                      <p className="tabular font-semibold">{saleNumber(r.number)} <span className="font-normal text-muted-foreground">· {r.seller.name}</span></p>
                      <p className="tabular text-xs text-muted-foreground">{formatDate(r.createdAt)} · {PAYMENT_LABEL[r.paymentMethod]}</p>
                    </div>
                    <div className="text-right">
                      <p className={`tabular font-bold ${r.status === "CANCELED" ? "text-muted-foreground line-through" : ""}`}>{formatBRL(r.total)}</p>
                      <StatusBadge status={r.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {data.pages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Paginação">
          <Button variant="secondary" size="sm" asChild={page > 1} disabled={page <= 1}>
            {page > 1 ? <Link href={qs(page - 1)}>← Anterior</Link> : <span>← Anterior</span>}
          </Button>
          <span className="text-sm text-muted-foreground">Página {data.page} de {data.pages}</span>
          <Button variant="secondary" size="sm" asChild={page < data.pages} disabled={page >= data.pages}>
            {page < data.pages ? <Link href={qs(page + 1)}>Próxima →</Link> : <span>Próxima →</span>}
          </Button>
        </nav>
      )}
    </div>
  );
}
