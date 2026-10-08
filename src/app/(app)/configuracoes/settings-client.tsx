"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changePasswordAction, saveSettingsAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { ErrorText, PageHeader } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";

interface Values {
  name: string;
  logoUrl: string;
  address: string;
  phone: string;
  instagram: string;
  allowDiscount: boolean;
  allowCustomItems: boolean;
  allowCancel: boolean;
}

export function SettingsClient({ initial }: { initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const text = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await saveSettingsAction(v);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Configurações salvas.");
      router.refresh();
    });
  };

  const toggles: { key: "allowDiscount" | "allowCustomItems" | "allowCancel"; title: string; desc: string }[] = [
    { key: "allowDiscount", title: "Permitir desconto", desc: "Mostra o campo de desconto na Nova Venda." },
    { key: "allowCustomItems", title: "Permitir venda sem produto cadastrado", desc: "Habilita a “Venda avulsa” (descrição + valor)." },
    { key: "allowCancel", title: "Permitir cancelamento", desc: "Administradores podem cancelar vendas (ficam registradas)." },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configurações" />
      <form onSubmit={save} className="space-y-8">
        <section>
          <SectionTitle>Dados da loja</SectionTitle>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Nome" htmlFor="s-nome" className="sm:col-span-2"><Input id="s-nome" value={v.name} onChange={text("name")} maxLength={100} required /></Field>
            <Field label="Logo (link)" htmlFor="s-logo" hint="Endereço https:// da imagem" className="sm:col-span-2"><Input id="s-logo" value={v.logoUrl} onChange={text("logoUrl")} maxLength={500} inputMode="url" placeholder="https://" /></Field>
            <Field label="Endereço" htmlFor="s-end" className="sm:col-span-2"><Input id="s-end" value={v.address} onChange={text("address")} maxLength={200} /></Field>
            <Field label="Telefone" htmlFor="s-tel"><Input id="s-tel" value={v.phone} onChange={text("phone")} maxLength={30} inputMode="tel" /></Field>
            <Field label="Instagram" htmlFor="s-ig"><Input id="s-ig" value={v.instagram} onChange={text("instagram")} maxLength={60} placeholder="@uniaogrifes" /></Field>
          </Card>
        </section>

        <section>
          <SectionTitle>Configurações de venda</SectionTitle>
          <Card className="divide-y divide-border">
            {toggles.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
                <span>
                  <span className="block font-semibold">{t.title}</span>
                  <span className="block text-sm text-muted-foreground">{t.desc}</span>
                </span>
                <Switch checked={v[t.key]} onCheckedChange={(c) => setV((x) => ({ ...x, [t.key]: c }))} />
              </label>
            ))}
          </Card>
        </section>

        <ErrorText>{error}</ErrorText>
        <Button type="submit" size="lg" loading={pending}>Salvar configurações</Button>
      </form>

      <section className="mt-10">
        <SectionTitle>Usuários</SectionTitle>
        <Card className="flex items-center justify-between gap-4 p-5">
          <p className="text-sm text-muted-foreground">Cadastre vendedores, altere perfis e senhas.</p>
          <Button variant="secondary" asChild><Link href="/funcionarios">Gerenciar funcionários</Link></Button>
        </Card>
      </section>

      <PasswordSection />
    </div>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await changePasswordAction({ current, next });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Senha alterada.");
      setCurrent("");
      setNext("");
    });
  };
  return (
    <section className="mt-10">
      <SectionTitle>Minha senha</SectionTitle>
      <Card className="p-5">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
          <Field label="Senha atual" htmlFor="pw-atual"><Input id="pw-atual" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></Field>
          <Field label="Nova senha" htmlFor="pw-nova" hint="Mínimo de 8 caracteres."><Input id="pw-nova" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} maxLength={100} autoComplete="new-password" required /></Field>
          <div className="sm:col-span-2"><ErrorText>{error}</ErrorText></div>
          <div className="sm:col-span-2"><Button type="submit" variant="secondary" loading={pending}>Alterar senha</Button></div>
        </form>
      </Card>
    </section>
  );
}
