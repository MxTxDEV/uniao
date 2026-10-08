"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock } from "lucide-react";
import { cashMovementAction, closeCashAction, openCashAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle, Stat } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { MoneyInput, centsToValue, toCents } from "@/components/ui/money-input";
import { EmptyState, ErrorText, PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Open {
  openedAt: string;
  openedByName: string;
  opening: string;
  sales: string;
  salesCount: number;
  entries: string;
  exits: string;
  expected: string;
}
interface Movement { id: string; type: "IN" | "OUT"; amount: string; description: string; createdAt: string }
interface Hist { id: string; openedAt: string; closedAt: string; closedByName: string; expected: string; counted: string; difference: string; notes: string | null }

export function CashClient({ open, movements, history }: { open: Open | null; movements: Movement[]; history: Hist[] }) {
  const router = useRouter();
  const [moveType, setMoveType] = useState<"IN" | "OUT" | null>(null);
  const [closing, setClosing] = useState(false);

  return (
    <div>
      <PageHeader
        title="Caixa"
        actions={
          open ? (
            <>
              <Button variant="secondary" onClick={() => setMoveType("IN")}><ArrowDownCircle className="h-4 w-4" /> Entrada</Button>
              <Button variant="secondary" onClick={() => setMoveType("OUT")}><ArrowUpCircle className="h-4 w-4" /> Saída</Button>
              <Button variant="primary" onClick={() => setClosing(true)}><Lock className="h-4 w-4" /> Fechar caixa</Button>
            </>
          ) : undefined
        }
      />

      {open ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Badge tone="success" className="px-3 py-1.5 text-xs tracking-wide">● CAIXA ABERTO</Badge>
            <span className="tabular text-sm text-muted-foreground">desde {formatDateTime(open.openedAt)} · por {open.openedByName}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Abertura" value={formatBRL(open.opening)} />
            <Stat label="Vendas" value={formatBRL(open.sales)} hint={`${open.salesCount} venda${open.salesCount === 1 ? "" : "s"}`} />
            <Stat label="Entradas" value={formatBRL(open.entries)} />
            <Stat label="Saídas" value={formatBRL(open.exits)} />
            <div className="col-span-2 lg:col-span-1">
              <Stat label="Saldo esperado" value={formatBRL(open.expected)} accent hint="abertura + vendas + entradas − saídas" />
            </div>
          </div>

          <div className="mt-8">
            <SectionTitle>Entradas e saídas</SectionTitle>
            <Card className="overflow-hidden">
              {movements.length === 0 ? (
                <EmptyState title="Nenhuma movimentação" description="Use Entrada/Saída para registrar reforço de troco, sangria, despesas…" />
              ) : (
                <ul className="divide-y divide-border">
                  {movements.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                      {m.type === "IN" ? <ArrowDownCircle className="h-5 w-5 text-success" /> : <ArrowUpCircle className="h-5 w-5 text-danger" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{m.description}</p>
                        <p className="tabular text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                      </div>
                      <p className={cn("tabular font-bold", m.type === "IN" ? "text-success" : "text-danger")}>{m.type === "IN" ? "+" : "−"} {formatBRL(m.amount)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : (
        <OpenForm onDone={() => router.refresh()} />
      )}

      <div className="mt-8">
        <SectionTitle>Fechamentos anteriores</SectionTitle>
        <Card className="overflow-hidden">
          {history.length === 0 ? (
            <EmptyState title="Nenhum fechamento ainda" description="Os fechamentos de caixa ficam registrados aqui para auditoria." />
          ) : (
            <>
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Fechado em</th>
                    <th className="px-3 py-3 font-semibold">Por</th>
                    <th className="px-3 py-3 text-right font-semibold">Esperado</th>
                    <th className="px-3 py-3 text-right font-semibold">Informado</th>
                    <th className="px-3 py-3 text-right font-semibold">Diferença</th>
                    <th className="px-5 py-3 font-semibold">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="tabular px-5 py-3.5">{formatDateTime(h.closedAt)}</td>
                      <td className="px-3 py-3.5">{h.closedByName}</td>
                      <td className="tabular px-3 py-3.5 text-right">{formatBRL(h.expected)}</td>
                      <td className="tabular px-3 py-3.5 text-right">{formatBRL(h.counted)}</td>
                      <td className={cn("tabular px-3 py-3.5 text-right font-bold", Number(h.difference) < 0 ? "text-danger" : Number(h.difference) > 0 ? "text-warning" : "text-success")}>{formatBRL(h.difference)}</td>
                      <td className="max-w-[16rem] truncate px-5 py-3.5 text-muted-foreground">{h.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-border md:hidden">
                {history.map((h) => (
                  <li key={h.id} className="px-4 py-3.5">
                    <div className="flex justify-between"><span className="tabular text-sm font-semibold">{formatDateTime(h.closedAt)}</span><span className={cn("tabular font-bold", Number(h.difference) < 0 ? "text-danger" : Number(h.difference) > 0 ? "text-warning" : "text-success")}>{formatBRL(h.difference)}</span></div>
                    <p className="tabular text-xs text-muted-foreground">Esperado {formatBRL(h.expected)} · Informado {formatBRL(h.counted)} · {h.closedByName}</p>
                    {h.notes && <p className="mt-1 text-xs">{h.notes}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <MovementDialog type={moveType} onClose={() => setMoveType(null)} onDone={() => { setMoveType(null); router.refresh(); }} />
      {open && <CloseDialog open={closing} expected={open.expected} onClose={() => setClosing(false)} onDone={() => { setClosing(false); router.refresh(); }} />}
    </div>
  );
}

function OpenForm({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState("0.00");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await openCashAction({ openingAmount: amount });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Caixa aberto.");
      onDone();
    });
  };
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted"><Unlock className="h-6 w-6" /></div>
      <Badge tone="neutral" className="px-3 py-1.5 text-xs tracking-wide">● CAIXA FECHADO</Badge>
      <p className="mt-4 text-sm text-muted-foreground">Informe o valor de abertura (troco inicial). Se você registrar uma venda antes, o caixa abre sozinho com R$ 0,00.</p>
      <form onSubmit={submit} className="mt-5 space-y-4 text-left">
        <Field label="Valor de abertura" htmlFor="abertura">
          <MoneyInput id="abertura" value={amount} onValueChange={setAmount} className="h-14 text-2xl" autoFocus />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" size="lg" className="w-full" loading={pending}>Abrir caixa</Button>
      </form>
    </Card>
  );
}

function MovementDialog({ type, onClose, onDone }: { type: "IN" | "OUT" | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("0.00");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [last, setLast] = useState<string | null>(null);
  if (type !== last) {
    setLast(type);
    setAmount("0.00");
    setDescription("");
    setError("");
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setError("");
    start(async () => {
      const r = await cashMovementAction({ type, amount, description });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(type === "IN" ? "Entrada registrada." : "Saída registrada.");
      onDone();
    });
  };
  return (
    <Dialog open={type !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title={type === "IN" ? "Registrar entrada" : "Registrar saída"} description={type === "IN" ? "Dinheiro que entrou no caixa (ex.: reforço de troco)." : "Dinheiro que saiu do caixa (ex.: sangria, despesa)."}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Valor" htmlFor="m-valor"><MoneyInput id="m-valor" value={amount} onValueChange={setAmount} className="h-12 text-lg" autoFocus /></Field>
          <Field label="Descrição" htmlFor="m-desc"><Input id="m-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} placeholder={type === "IN" ? "Reforço de troco" : "Sangria / Lanche"} required /></Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={pending} disabled={toCents(amount) <= 0 || !description.trim()}>Registrar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ open, expected, onClose, onDone }: { open: boolean; expected: string; onClose: () => void; onDone: () => void }) {
  const [counted, setCounted] = useState("0.00");
  const [touched, setTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCounted("0.00");
      setTouched(false);
      setNotes("");
      setError("");
    }
  }
  const diffCents = toCents(counted) - toCents(expected);
  const diff = centsToValue(Math.abs(diffCents));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await closeCashAction({ countedAmount: counted, notes });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const d = Number(r.data.difference);
      toast.success(d === 0 ? "Caixa fechado sem diferença." : `Caixa fechado. Diferença de ${formatBRL(r.data.difference)} registrada.`);
      onDone();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title="Fechar caixa" description="Conte o dinheiro e informe o saldo final.">
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-2xl bg-muted/70 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Saldo esperado</p>
            <p className="tabular text-3xl font-extrabold">{formatBRL(expected)}</p>
          </div>
          <Field label="Saldo informado" htmlFor="c-info">
            <MoneyInput id="c-info" value={counted} onValueChange={(v) => { setCounted(v); setTouched(true); }} className="h-14 text-2xl" autoFocus />
          </Field>
          {!touched && (
            <button type="button" className="-mt-2 text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => { setCounted(expected); setTouched(true); }}>
              Conferi: é igual ao esperado
            </button>
          )}
          <div className={cn("flex items-center justify-between rounded-2xl px-4 py-3", !touched ? "bg-muted/50" : diffCents === 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
            <span className="text-xs font-bold uppercase tracking-[0.14em]">Diferença</span>
            <span className="tabular text-xl font-extrabold">{diffCents < 0 ? "− " : diffCents > 0 ? "+ " : ""}{formatBRL(diff)}</span>
          </div>
          {touched && diffCents !== 0 && (
            <>
              <p role="status" className="text-sm font-medium">Foi identificada uma diferença de {formatBRL(diff)} {diffCents < 0 ? "(faltando)" : "(sobrando)"}.</p>
              <Field label="Observação (opcional)" htmlFor="c-obs"><Input id="c-obs" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Ex.: troco errado" /></Field>
            </>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={pending} disabled={!touched}>Confirmar fechamento</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
