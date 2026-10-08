import Link from "next/link";
import { Receipt } from "lucide-react";
import { requirePage } from "@/server/auth";
import { getDashboard } from "@/server/stats";
import { Card, SectionTitle, Stat } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { DASHBOARD_PERIODS, formatDateTime, greeting } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn, PAYMENT_LABEL, saleNumber } from "@/lib/utils";
import { SalesChart } from "./sales-chart";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const s = await requirePage({ admin: true });
  const { periodo } = await searchParams;
  const d = await getDashboard(s, periodo);
  const firstName = s.name.split(" ")[0];
  const paymentsTotal = d.payments.reduce((a, p) => a + Number(p.total), 0);
  const maxSeller = Math.max(...d.sellers.map((x) => Number(x.total)), 1);
  const chartTotal = d.chart.reduce((a, c) => a + c.total, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{greeting()}, {firstName}</h1>
        <p className="mt-1 text-muted-foreground">Resumo da {s.tenantName}.</p>
      </header>

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Faturamento hoje" value={formatBRL(d.day.revenue)} accent />
        <Stat label="Vendas hoje" value={d.day.count} />
        <Stat label="Ticket médio" value={formatBRL(d.day.avgTicket)} hint="hoje" />
        <Stat label="Faturamento no mês" value={formatBRL(d.month.revenue)} hint={`${d.month.count} venda${d.month.count === 1 ? "" : "s"}`} />
      </section>

      <section aria-label="Gráfico de vendas">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Vendas</h2>
          <nav className="flex gap-1 overflow-x-auto rounded-xl bg-card p-1 shadow-[0_0_0_1px_var(--border)]" aria-label="Período">
            {DASHBOARD_PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/dashboard?periodo=${p.key}`}
                aria-current={d.period.key === p.key ? "true" : undefined}
                className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition", d.period.key === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        <Card className="p-5">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">Faturamento · {d.period.label}</p>
            <p className="tabular text-2xl font-bold">{formatBRL(chartTotal)}</p>
          </div>
          {chartTotal === 0 ? <EmptyState icon={<Receipt className="h-6 w-6" />} title="Sem vendas neste período" description="Quando houver vendas concluídas, elas aparecem aqui." /> : <SalesChart data={d.chart} />}
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Formas de pagamento">
          <SectionTitle>Formas de pagamento · {d.period.label}</SectionTitle>
          <Card className="divide-y divide-border">
            {d.payments.map((p) => {
              const pct = paymentsTotal > 0 ? (Number(p.total) / paymentsTotal) * 100 : 0;
              return (
                <div key={p.method} className="px-5 py-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{PAYMENT_LABEL[p.method]}</span>
                    <span className="tabular font-bold">{formatBRL(p.total)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </Card>
        </section>

        <section aria-label="Vendedores">
          <SectionTitle>Vendedores · {d.period.label}</SectionTitle>
          <Card className="p-2">
            {d.sellers.length === 0 ? (
              <EmptyState title="Sem vendas neste período" />
            ) : (
              <ol>
                {d.sellers.map((v, i) => (
                  <li key={v.sellerId} className="rounded-xl px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", i === 0 ? "bg-accent text-white" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                      <span className="flex-1 font-semibold">{v.name}</span>
                      <span className="tabular font-bold">{formatBRL(v.total)}</span>
                    </div>
                    <div className="ml-10 mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/80" style={{ width: `${(Number(v.total) / maxSeller) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </section>
      </div>

      <section aria-label="Últimas vendas">
        <SectionTitle action={<Link href="/vendas" className="text-sm font-semibold underline-offset-4 hover:underline">Ver todas</Link>}>Últimas vendas</SectionTitle>
        <Card className="overflow-hidden">
          {d.recent.length === 0 ? (
            <EmptyState icon={<Receipt className="h-6 w-6" />} title="Nenhuma venda ainda" action={<Link href="/nova-venda" className="text-sm font-semibold underline">Registrar a primeira venda</Link>} />
          ) : (
            <ul className="divide-y divide-border">
              {d.recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/vendas/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-muted/50">
                    <span className="tabular w-20 font-semibold">{saleNumber(r.number)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {r.seller.name} · {PAYMENT_LABEL[r.paymentMethod]} · <span className="tabular">{formatDateTime(r.createdAt)}</span>
                    </span>
                    <StatusBadge status={r.status} />
                    <span className={cn("tabular w-28 text-right font-bold", r.status === "CANCELED" && "text-muted-foreground line-through")}>{formatBRL(r.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
