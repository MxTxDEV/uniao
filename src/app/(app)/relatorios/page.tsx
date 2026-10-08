import Link from "next/link";
import { Download } from "lucide-react";
import { requirePage } from "@/server/auth";
import { getReport } from "@/server/stats";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle, Stat } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { REPORT_PERIODS, formatDate, resolvePeriod, ymdBR, addDays } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn, PAYMENT_LABEL } from "@/lib/utils";
import { CustomRange } from "./custom-range";

export const metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

type SP = { periodo?: string; de?: string; ate?: string };

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requirePage({ admin: true });
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo, { from: sp.de, to: sp.ate, fallback: "mes" });
  const r = await getReport(s, period);
  const last = addDays(period.end, -1);
  const rangeLabel = `${formatDate(period.start)} – ${formatDate(last)}`;
  const exportQs = new URLSearchParams({ periodo: period.key });
  if (period.key === "personalizado") {
    exportQs.set("de", ymdBR(period.start));
    exportQs.set("ate", ymdBR(last));
  }
  const pay = r.payments.filter((p) => Number(p.total) > 0 || p.count > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Relatórios"
        description={`${period.label} · ${rangeLabel}`}
        actions={
          <>
            <Button variant="secondary" asChild>
              <a href={`/api/relatorios/csv?tipo=vendas&${exportQs}`}><Download className="h-4 w-4" /> CSV vendas</a>
            </Button>
            <Button variant="secondary" asChild>
              <a href={`/api/relatorios/csv?tipo=produtos&${exportQs}`}><Download className="h-4 w-4" /> CSV produtos</a>
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <nav className="flex gap-1 overflow-x-auto rounded-xl bg-card p-1 shadow-[0_0_0_1px_var(--border)]" aria-label="Período">
          {REPORT_PERIODS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "personalizado" ? `/relatorios?periodo=personalizado&de=${ymdBR(period.start)}&ate=${ymdBR(last)}` : `/relatorios?periodo=${p.key}`}
              aria-current={period.key === p.key ? "true" : undefined}
              className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition", period.key === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        {period.key === "personalizado" && <CustomRange de={ymdBR(period.start)} ate={ymdBR(last)} />}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo">
        <Stat label="Faturamento" value={formatBRL(r.summary.revenue)} accent />
        <Stat label="Número de vendas" value={r.summary.count} />
        <Stat label="Ticket médio" value={formatBRL(r.summary.avgTicket)} />
        <Stat label="Canceladas" value={r.canceledCount} hint={r.canceledCount ? `${formatBRL(r.canceledTotal)} fora do faturamento` : undefined} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>Vendas por vendedor</SectionTitle>
          <Card className="overflow-hidden">
            {r.sellers.length === 0 ? <EmptyState title="Sem vendas no período" /> : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {r.sellers.map((v) => (
                    <tr key={v.sellerId}>
                      <td className="px-5 py-3.5 font-semibold">{v.name}</td>
                      <td className="px-3 py-3.5 text-right text-muted-foreground">{v.count} venda{v.count === 1 ? "" : "s"}</td>
                      <td className="tabular px-5 py-3.5 text-right font-bold">{formatBRL(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle>Vendas por forma de pagamento</SectionTitle>
          <Card className="overflow-hidden">
            {pay.length === 0 ? <EmptyState title="Sem vendas no período" /> : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {pay.map((p) => (
                    <tr key={p.method}>
                      <td className="px-5 py-3.5 font-semibold">{PAYMENT_LABEL[p.method]}</td>
                      <td className="px-3 py-3.5 text-right text-muted-foreground">{p.count} venda{p.count === 1 ? "" : "s"}</td>
                      <td className="tabular px-5 py-3.5 text-right font-bold">{formatBRL(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>
      </div>

      <section>
        <SectionTitle>Produtos mais vendidos</SectionTitle>
        <Card className="overflow-hidden">
          {r.products.length === 0 ? <EmptyState title="Sem vendas no período" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 px-5 py-3 font-semibold">#</th>
                  <th className="px-3 py-3 font-semibold">Produto</th>
                  <th className="px-3 py-3 text-right font-semibold">Qtd.</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {r.products.map((p, i) => (
                  <tr key={`${p.name}-${i}`}>
                    <td className="tabular px-5 py-3.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-3.5 font-semibold">{p.name}</td>
                    <td className="tabular px-3 py-3.5 text-right">{p.qty}</td>
                    <td className="tabular px-5 py-3.5 text-right font-bold">{formatBRL(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}
