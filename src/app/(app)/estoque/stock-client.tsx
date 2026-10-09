"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Minus, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { stockEntryAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { MoneyInput, toCents } from "@/components/ui/money-input";
import { EmptyState, ErrorText, PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import type { ProductDTO } from "@/server/products";

interface Entry {
  id: string;
  createdAt: string;
  totalCost: string;
  notes: string | null;
  byName: string;
  items: { name: string; quantity: number }[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function StockClient({ products, entries }: { products: ProductDTO[]; entries: Entry[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<{ productId: string; quantity: number }[]>([]);
  const [totalCost, setTotalCost] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const results = useMemo(() => {
    const t = norm(q.trim());
    const base = t ? products.filter((p) => norm(`${p.name} ${p.category} ${p.sku ?? ""}`).includes(t)) : products;
    return base.slice(0, 30);
  }, [products, q]);

  const add = (id: string) => setLines((l) => (l.some((x) => x.productId === id) ? l.map((x) => (x.productId === id ? { ...x, quantity: x.quantity + 1 } : x)) : [...l, { productId: id, quantity: 1 }]));
  const setQty = (id: string, quantity: number) => setLines((l) => l.map((x) => (x.productId === id ? { ...x, quantity: Math.max(1, Math.min(99999, Math.floor(quantity) || 1)) } : x)));
  const remove = (id: string) => setLines((l) => l.filter((x) => x.productId !== id));
  const units = lines.reduce((a, l) => a + l.quantity, 0);
  const canSubmit = lines.length > 0 && toCents(totalCost) > 0 && !pending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await stockEntryAction({ totalCost, notes, items: lines });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(`Entrada lançada: ${units} un. e despesa de ${formatBRL(r.data.totalCost)}.`);
      setLines([]);
      setTotalCost("0.00");
      setNotes("");
      setQ("");
      router.refresh();
    });
  };

  return (
    <div>
      <PageHeader title="Entrada de estoque" description="Informe os produtos e quantidades que chegaram e o valor pago. O estoque sobe e o valor entra em despesas." />

      {products.length === 0 ? (
        <Card><EmptyState icon={<Boxes className="h-6 w-6" />} title="Cadastre produtos primeiro" description="A entrada de estoque soma a quantidade de produtos cadastrados." /></Card>
      ) : (
        <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <section>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto para adicionar…" className="h-12 pl-10" aria-label="Buscar produto" />
            </div>
            <Card className="overflow-hidden">
              {results.length === 0 ? (
                <EmptyState title="Nenhum produto encontrado" />
              ) : (
                <ul className="divide-y divide-border">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => add(p.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-muted/50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="block text-xs text-muted-foreground">{p.category}</span>
                        </span>
                        <span className={`tabular text-sm ${p.stock <= 0 ? "font-semibold text-danger" : "text-muted-foreground"}`}>Estoque: {p.stock}</span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><Plus className="h-4 w-4" /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Chegou {units > 0 && `· ${units} un.`}</h2>
              </div>
              {lines.length === 0 ? (
                <EmptyState icon={<PackagePlus className="h-5 w-5" />} title="Nenhum produto adicionado" description="Toque nos produtos ao lado." />
              ) : (
                <ul className="max-h-[40dvh] divide-y divide-border overflow-y-auto">
                  {lines.map((l) => {
                    const p = byId.get(l.productId);
                    return (
                      <li key={l.productId} className="flex items-center gap-2 px-5 py-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p?.name}</span>
                        <div className="flex items-center rounded-xl border border-border">
                          <button type="button" aria-label="Diminuir" onClick={() => setQty(l.productId, l.quantity - 1)} className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:bg-muted"><Minus className="h-4 w-4" /></button>
                          <input
                            aria-label={`Quantidade de ${p?.name}`}
                            type="number"
                            min={1}
                            max={99999}
                            inputMode="numeric"
                            value={l.quantity}
                            onChange={(e) => setQty(l.productId, Number(e.target.value))}
                            onFocus={(e) => e.currentTarget.select()}
                            className="tabular h-9 w-14 bg-transparent text-center text-sm font-bold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button type="button" aria-label="Aumentar" onClick={() => setQty(l.productId, l.quantity + 1)} className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:bg-muted"><Plus className="h-4 w-4" /></button>
                        </div>
                        <button type="button" aria-label={`Remover ${p?.name}`} onClick={() => remove(l.productId)} className="rounded-lg p-2 text-muted-foreground hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="space-y-4 border-t border-border bg-muted/40 px-5 py-4">
                <Field label="Valor total da entrada" htmlFor="e-valor" hint="Quanto foi pago. Entra em despesas.">
                  <MoneyInput id="e-valor" value={totalCost} onValueChange={setTotalCost} className="h-12 text-lg" />
                </Field>
                <Field label="Observações (opcional)" htmlFor="e-obs">
                  <Input id="e-obs" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Ex.: pedido fornecedor X" />
                </Field>
                <ErrorText>{error}</ErrorText>
                <Button type="submit" size="lg" className="w-full" disabled={!canSubmit} loading={pending}>Lançar entrada</Button>
              </div>
            </Card>
          </aside>
        </form>
      )}

      <div className="mt-8">
        <SectionTitle>Últimas entradas</SectionTitle>
        <Card className="overflow-hidden">
          {entries.length === 0 ? (
            <EmptyState title="Nenhuma entrada lançada" />
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="tabular text-sm font-semibold">{formatDateTime(e.createdAt)} <span className="font-normal text-muted-foreground">· {e.byName}</span></span>
                    <span className="tabular font-bold text-danger">− {formatBRL(e.totalCost)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{e.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                  {e.notes && <p className="mt-0.5 text-xs">{e.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
