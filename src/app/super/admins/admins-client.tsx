"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { changeSuperPasswordAction, createSuperAdminAction, deleteSuperAdminAction, updateSuperAdminAction } from "@/actions/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { ErrorText, PageHeader } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/dates";
import type { SuperAdminDTO } from "@/server/platform";

export function AdminsClient({ admins, currentId }: { admins: SuperAdminDTO[]; currentId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SuperAdminDTO | "new" | null>(null);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Super admins" description="Quem administra a plataforma inteira (todas as empresas)." actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Novo super admin</Button>} />

      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {admins.map((a) => (
            <li key={a.id} className={`flex items-center gap-4 px-5 py-4 ${a.active ? "" : "opacity-55"}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-white">{a.name.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.name} {a.id === currentId && <span className="text-xs font-medium text-muted-foreground">(você)</span>}</p>
                <p className="truncate text-sm text-muted-foreground">{a.email} · desde {formatDate(a.createdAt)}</p>
              </div>
              {!a.active && <Badge tone="danger">Inativo</Badge>}
              <Button variant="ghost" size="sm" onClick={() => setEditing(a)} aria-label={`Editar ${a.name}`}><Pencil className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      </Card>

      <PasswordSection />
      <AdminDialog editing={editing} currentId={currentId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </div>
  );
}

function AdminDialog({ editing, currentId, onClose, onSaved }: { editing: SuperAdminDTO | "new" | null; currentId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", active: true });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [key, setKey] = useState<string | null>(null);
  const current = editing === null ? null : editing === "new" ? "new" : editing.id;
  if (current !== key) {
    setKey(current);
    setError("");
    if (editing === "new") setForm({ name: "", email: "", password: "", active: true });
    else if (editing) setForm({ name: editing.name, email: editing.email, password: "", active: editing.active });
  }
  const isNew = editing === "new";
  const target = editing !== null && editing !== "new" ? editing : null;
  const self = target !== null && target.id === currentId;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (lastKey !== key) {
    setLastKey(key);
    setConfirmDelete(false);
  }

  const remove = () => {
    if (!target) return;
    setError("");
    start(async () => {
      const r = await deleteSuperAdminAction(target.id);
      if (!r.ok) {
        setError(r.error);
        setConfirmDelete(false);
        return;
      }
      toast.success("Super admin apagado.");
      onSaved();
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = isNew
        ? await createSuperAdminAction({ name: form.name, email: form.email, password: form.password })
        : await updateSuperAdminAction((editing as SuperAdminDTO).id, { name: form.name, active: form.active, password: form.password });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(isNew ? "Super admin criado." : "Super admin atualizado.");
      onSaved();
    });
  };

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title={isNew ? "Novo super admin" : "Editar super admin"} description="Super admins têm acesso total a todas as empresas.">
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <Field label="Nome" htmlFor="a-nome"><Input id="a-nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} autoFocus required /></Field>
          <Field label="E-mail" htmlFor="a-email" hint={isNew ? undefined : "O e-mail não pode ser alterado."}><Input id="a-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!isNew} required autoComplete="off" /></Field>
          <Field label={isNew ? "Senha" : "Nova senha (deixe em branco para manter)"} htmlFor="a-senha" hint="Mínimo de 8 caracteres."><Input id="a-senha" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={isNew} minLength={8} maxLength={100} autoComplete="new-password" /></Field>
          {!isNew && (
            <label className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3 text-sm font-semibold">
              Ativo
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} disabled={self} />
            </label>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={pending}>Salvar</Button>
          </div>
          {target && !self && (
            <div className="border-t border-border pt-4">
              {!confirmDelete ? (
                <Button type="button" variant="danger-ghost" className="w-full" onClick={() => setConfirmDelete(true)} disabled={pending}><Trash2 className="h-4 w-4" /> Apagar este super admin</Button>
              ) : (
                <div className="space-y-2 rounded-xl bg-danger-soft p-3">
                  <p className="text-sm font-medium text-danger">Apagar definitivamente <b>{target.email}</b>? Não dá para desfazer.</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={pending}>Voltar</Button>
                    <Button type="button" variant="danger" size="sm" className="flex-1" loading={pending} onClick={remove}>Sim, apagar</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
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
      const r = await changeSuperPasswordAction({ current, next });
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
          <Field label="Senha atual" htmlFor="sp-atual"><Input id="sp-atual" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></Field>
          <Field label="Nova senha" htmlFor="sp-nova" hint="Mínimo de 8 caracteres."><Input id="sp-nova" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} maxLength={100} autoComplete="new-password" required /></Field>
          <div className="sm:col-span-2"><ErrorText>{error}</ErrorText></div>
          <div className="sm:col-span-2"><Button type="submit" variant="secondary" loading={pending}>Alterar senha</Button></div>
        </form>
      </Card>
    </section>
  );
}
