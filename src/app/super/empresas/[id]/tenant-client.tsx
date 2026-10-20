"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, Users } from "lucide-react";
import { enterTenantAction, updateTenantAction } from "@/actions/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle, Stat } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { ErrorText, PageHeader } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

interface Props {
  tenant: { id: string; name: string; active: boolean; phone: string; address: string; instagram: string; internalNotes: string; createdAt: string };
  stats: { users: number; products: number; salesAll: number; sales30: number; revenue30: string };
  admins: { id: string; name: string; email: string; active: boolean }[];
}

export function TenantClient({ tenant, stats, admins }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ name: tenant.name, active: tenant.active, phone: tenant.phone, address: tenant.address, instagram: tenant.instagram, internalNotes: tenant.internalNotes });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [entering, setEntering] = useState(false);
  const text = (k: "name" | "phone" | "address" | "instagram" | "internalNotes") => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dirty = JSON.stringify(form) !== JSON.stringify({ name: tenant.name, active: tenant.active, phone: tenant.phone, address: tenant.address, instagram: tenant.instagram, internalNotes: tenant.internalNotes });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await updateTenantAction(tenant.id, form);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(form.active ? "Empresa salva." : "Empresa salva e suspensa.");
      router.refresh();
    });
  };

  const enter = async () => {
    setEntering(true);
    const r = await enterTenantAction(tenant.id);
    setEntering(false);
    if (r && !r.ok) toast.error(r.error);
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={tenant.name}
        description={`Criada em ${formatDate(tenant.createdAt)}`}
        actions={
          <>
            <Badge tone={tenant.active ? "success" : "danger"} className="px-3 py-1.5">{tenant.active ? "Ativa" : "Suspensa"}</Badge>
            <Button variant="secondary" asChild><Link href={`/super/usuarios?empresa=${tenant.id}`}><Users className="h-4 w-4" /> Usuários</Link></Button>
            <Button onClick={enter} loading={entering}><LogIn className="h-4 w-4" /> Entrar na empresa</Button>
          </>
        }
      />

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Números">
        <Stat label="Usuários ativos" value={stats.users} />
        <Stat label="Produtos" value={stats.products} />
        <Stat label="Vendas (total)" value={stats.salesAll} />
        <Stat label="Faturamento 30 dias" value={formatBRL(stats.revenue30)} hint={`${stats.sales30} vendas`} accent />
      </section>

      <form onSubmit={save} className="space-y-8">
        <section>
          <SectionTitle>Dados da empresa</SectionTitle>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Nome" htmlFor="t-nome" className="sm:col-span-2"><Input id="t-nome" value={form.name} onChange={text("name")} maxLength={100} required /></Field>
            <Field label="Telefone" htmlFor="t-tel"><Input id="t-tel" value={form.phone} onChange={text("phone")} maxLength={30} inputMode="tel" /></Field>
            <Field label="Instagram" htmlFor="t-ig"><Input id="t-ig" value={form.instagram} onChange={text("instagram")} maxLength={60} /></Field>
            <Field label="Endereço" htmlFor="t-end" className="sm:col-span-2"><Input id="t-end" value={form.address} onChange={text("address")} maxLength={200} /></Field>
            <Field label="Anotações internas" htmlFor="t-notes" hint="Visíveis apenas para super admins." className="sm:col-span-2"><Input id="t-notes" value={form.internalNotes} onChange={text("internalNotes")} maxLength={1000} /></Field>
          </Card>
        </section>

        <section>
          <SectionTitle>Acesso</SectionTitle>
          <Card className="px-5 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block font-semibold">Empresa ativa</span>
                <span className="block text-sm text-muted-foreground">Ao suspender, ninguém da empresa consegue entrar (os dados são mantidos). Super admins continuam com acesso.</span>
              </span>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </label>
          </Card>
        </section>

        <ErrorText>{error}</ErrorText>
        <Button type="submit" size="lg" loading={pending} disabled={!dirty}>Salvar alterações</Button>
      </form>

      <section className="mt-10">
        <SectionTitle action={<Link href={`/super/usuarios?empresa=${tenant.id}`} className="text-sm font-semibold underline-offset-4 hover:underline">Gerenciar usuários</Link>}>Administradores</SectionTitle>
        <Card className="divide-y divide-border">
          {admins.map((a) => (
            <div key={a.id} className={`flex items-center justify-between gap-3 px-5 py-3.5 ${a.active ? "" : "opacity-60"}`}>
              <div className="min-w-0"><p className="truncate font-semibold">{a.name}</p><p className="truncate text-sm text-muted-foreground">{a.email}</p></div>
              {!a.active && <Badge tone="danger">Inativo</Badge>}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
