"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Search, Users } from "lucide-react";
import { createTenantUserAction, updateTenantUserAction } from "@/actions/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorText, PageHeader } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { ROLE_LABEL } from "@/lib/utils";
import type { PlatformUser } from "@/server/platform";

type Role = "ADMIN" | "VENDEDOR";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function UsersClient({ users, tenants, initialTenant }: { users: PlatformUser[]; tenants: { id: string; name: string }[]; initialTenant: string }) {
  const router = useRouter();
  const [tenant, setTenant] = useState(initialTenant);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PlatformUser | "new" | null>(null);

  const filtered = useMemo(() => {
    const t = norm(q.trim());
    return users.filter((u) => (!tenant || u.tenantId === tenant) && (!t || norm(`${u.name} ${u.email} ${u.tenantName}`).includes(t)));
  }, [users, tenant, q]);

  return (
    <div>
      <PageHeader title="Usuários" description="Funcionários de todas as empresas." actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Novo usuário</Button>} />

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou empresa" className="pl-10" aria-label="Buscar usuários" />
        </div>
        <Select value={tenant} onChange={(e) => setTenant(e.target.value)} aria-label="Filtrar por empresa">
          <option value="">Todas as empresas</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="Nenhum usuário encontrado" />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((u) => (
              <li key={u.id} className={`flex items-center gap-4 px-5 py-4 ${u.active ? "" : "opacity-55"}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-bold">{u.name.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                </div>
                <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:block">{u.tenantName}</span>
                <Badge tone={u.role === "ADMIN" ? "dark" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                {!u.active && <Badge tone="danger">Inativo</Badge>}
                <Button variant="ghost" size="sm" onClick={() => setEditing(u)} aria-label={`Editar ${u.name}`}><Pencil className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <UserDialog editing={editing} tenants={tenants} defaultTenant={tenant} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </div>
  );
}

function UserDialog({ editing, tenants, defaultTenant, onClose, onSaved }: { editing: PlatformUser | "new" | null; tenants: { id: string; name: string }[]; defaultTenant: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ tenantId: "", name: "", email: "", password: "", role: "VENDEDOR" as Role, active: true });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [key, setKey] = useState<string | null>(null);
  const current = editing === null ? null : editing === "new" ? "new" : editing.id;
  if (current !== key) {
    setKey(current);
    setError("");
    if (editing === "new") setForm({ tenantId: defaultTenant || tenants[0]?.id || "", name: "", email: "", password: "", role: "VENDEDOR", active: true });
    else if (editing) setForm({ tenantId: editing.tenantId, name: editing.name, email: editing.email, password: "", role: editing.role, active: editing.active });
  }
  const isNew = editing === "new";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = isNew
        ? await createTenantUserAction(form.tenantId, { name: form.name, email: form.email, password: form.password, role: form.role })
        : await updateTenantUserAction((editing as PlatformUser).id, { name: form.name, role: form.role, active: form.active, password: form.password });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(isNew ? "Usuário criado." : "Usuário atualizado.");
      onSaved();
    });
  };

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title={isNew ? "Novo usuário" : "Editar usuário"}>
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <Field label="Empresa" htmlFor="u-emp">
            <Select id="u-emp" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} disabled={!isNew}>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Nome" htmlFor="u-nome"><Input id="u-nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} autoFocus required /></Field>
          <Field label="E-mail" htmlFor="u-email" hint={isNew ? undefined : "O e-mail não pode ser alterado."}><Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!isNew} required autoComplete="off" /></Field>
          <Field label={isNew ? "Senha" : "Nova senha (deixe em branco para manter)"} htmlFor="u-senha" hint="Mínimo de 8 caracteres."><Input id="u-senha" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={isNew} minLength={8} maxLength={100} autoComplete="new-password" /></Field>
          <Field label="Perfil" htmlFor="u-perfil">
            <Select id="u-perfil" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="VENDEDOR">Vendedor</option>
              <option value="ADMIN">Administrador</option>
            </Select>
          </Field>
          {!isNew && (
            <label className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3 text-sm font-semibold">
              Ativo
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </label>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={pending}>Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
