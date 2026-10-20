"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, LogIn, Plus, Search, Settings2 } from "lucide-react";
import { createTenantAction, enterTenantAction } from "@/actions/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, ErrorText, PageHeader } from "@/components/ui/misc";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import type { TenantRow } from "@/server/platform";

interface Totals { tenants: number; activeTenants: number; users: number; monthSales: number; monthRevenue: string }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CompaniesClient({ rows, totals }: { rows: TenantRow[]; totals: Totals }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const filtered = useMemo(() => (q.trim() ? rows.filter((r) => norm(r.name).includes(norm(q.trim()))) : rows), [rows, q]);

  const enter = async (id: string) => {
    setEnteringId(id);
    const r = await enterTenantAction(id);
    // em caso de sucesso o servidor redireciona; só chegamos aqui se houve erro
    setEnteringId(null);
    if (r && !r.ok) toast.error(r.error);
  };

  return (
    <div>
      <PageHeader
        title="Empresas"
        description="Todas as lojas da plataforma. Entre em qualquer uma como super admin."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nova empresa</Button>}
      />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo da plataforma">
        <Stat label="Empresas" value={totals.tenants} hint={`${totals.activeTenants} ativa${totals.activeTenants === 1 ? "" : "s"}`} accent />
        <Stat label="Usuários ativos" value={totals.users} />
        <Stat label="Vendas no mês" value={totals.monthSales} />
        <Stat label="Faturamento no mês" value={formatBRL(totals.monthRevenue)} hint="todas as empresas" />
      </section>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa" className="pl-10" aria-label="Buscar empresa" />
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={<Building2 className="h-6 w-6" />} title={rows.length === 0 ? "Nenhuma empresa cadastrada" : "Nenhuma empresa encontrada"} action={rows.length === 0 ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nova empresa</Button> : undefined} />
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Empresa</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Usuários</th>
                  <th className="px-3 py-3 text-right font-semibold">Vendas (mês)</th>
                  <th className="px-3 py-3 text-right font-semibold">Faturamento (mês)</th>
                  <th className="px-3 py-3 font-semibold">Criada em</th>
                  <th className="px-5 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className={r.active ? "" : "opacity-65"}>
                    <td className="px-5 py-3.5 font-semibold"><Link href={`/super/empresas/${r.id}`} className="hover:underline">{r.name}</Link></td>
                    <td className="px-3 py-3.5"><Badge tone={r.active ? "success" : "danger"}>{r.active ? "Ativa" : "Suspensa"}</Badge></td>
                    <td className="tabular px-3 py-3.5 text-right">{r.activeUsers}</td>
                    <td className="tabular px-3 py-3.5 text-right">{r.monthSales}</td>
                    <td className="tabular px-3 py-3.5 text-right font-semibold">{formatBRL(r.monthRevenue)}</td>
                    <td className="tabular px-3 py-3.5 text-muted-foreground">{formatDate(r.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" asChild><Link href={`/super/empresas/${r.id}`}><Settings2 className="h-4 w-4" /> Detalhes</Link></Button>
                        <Button size="sm" onClick={() => enter(r.id)} loading={enteringId === r.id}><LogIn className="h-4 w-4" /> Entrar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((r) => (
                <li key={r.id} className={`space-y-3 px-4 py-4 ${r.active ? "" : "opacity-65"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/super/empresas/${r.id}`} className="font-semibold">{r.name}</Link>
                    <Badge tone={r.active ? "success" : "danger"}>{r.active ? "Ativa" : "Suspensa"}</Badge>
                  </div>
                  <p className="tabular text-xs text-muted-foreground">{r.activeUsers} usuários · {r.monthSales} vendas · {formatBRL(r.monthRevenue)} no mês</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" asChild><Link href={`/super/empresas/${r.id}`}>Detalhes</Link></Button>
                    <Button size="sm" onClick={() => enter(r.id)} loading={enteringId === r.id}><LogIn className="h-4 w-4" /> Entrar</Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); router.refresh(); }} />
    </div>
  );
}

function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const empty = { companyName: "", adminName: "", adminEmail: "", adminPassword: "" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setForm(empty);
      setError("");
    }
  }
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await createTenantAction(form);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Empresa criada.");
      onCreated();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title="Nova empresa" description="Cria a empresa e o primeiro administrador dela.">
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <Field label="Nome da empresa" htmlFor="c-nome"><Input id="c-nome" value={form.companyName} onChange={set("companyName")} maxLength={100} autoFocus required /></Field>
          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Administrador da empresa</p>
            <div className="space-y-3">
              <Field label="Nome" htmlFor="c-admin"><Input id="c-admin" value={form.adminName} onChange={set("adminName")} maxLength={100} required /></Field>
              <Field label="E-mail (login)" htmlFor="c-email"><Input id="c-email" type="email" value={form.adminEmail} onChange={set("adminEmail")} required autoComplete="off" /></Field>
              <Field label="Senha inicial" htmlFor="c-senha" hint="Mínimo de 8 caracteres."><Input id="c-senha" type="password" value={form.adminPassword} onChange={set("adminPassword")} minLength={8} maxLength={100} required autoComplete="new-password" /></Field>
            </div>
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={pending}>Criar empresa</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
