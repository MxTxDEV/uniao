"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trophy } from "lucide-react";
import { saveUserAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorText, PageHeader } from "@/components/ui/misc";
import { formatBRL } from "@/lib/money";
import { ROLE_LABEL } from "@/lib/utils";
import type { UserDTO } from "@/server/users";

interface Props {
  users: UserDTO[];
  ranking: { sellerId: string; name: string; total: string; count: number }[];
  currentUserId: string;
  periodLabel: string;
}

const EMPTY = { name: "", email: "", password: "", role: "VENDEDOR" as "ADMIN" | "VENDEDOR", active: true };

export function UsersClient({ users, ranking, currentUserId, periodLabel }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<UserDTO | "new" | null>(null);

  return (
    <div>
      <PageHeader
        title="Funcionários"
        description="Quem vende e quem administra a loja."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Novo funcionário
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className={`flex items-center gap-4 px-5 py-4 ${u.active ? "" : "opacity-55"}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-bold">{u.name.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {u.name} {u.id === currentUserId && <span className="text-xs font-medium text-muted-foreground">(você)</span>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                </div>
                <Badge tone={u.role === "ADMIN" ? "dark" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                {!u.active && <Badge tone="danger">Inativo</Badge>}
                <Button variant="ghost" size="sm" onClick={() => setEditing(u)} aria-label={`Editar ${u.name}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <div>
          <SectionTitle>Ranking · {periodLabel}</SectionTitle>
          <Card className="p-2">
            {ranking.length === 0 ? (
              <EmptyState icon={<Trophy className="h-5 w-5" />} title="Sem vendas no período" />
            ) : (
              <ol>
                {ranking.map((r, i) => (
                  <li key={r.sellerId} className="flex items-center gap-3 rounded-xl px-3 py-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-accent text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                    <span className="flex-1 font-semibold">{r.name}</span>
                    <span className="text-right">
                      <span className="tabular block font-bold">{formatBRL(r.total)}</span>
                      <span className="block text-xs text-muted-foreground">{r.count} venda{r.count === 1 ? "" : "s"}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <UserDialog editing={editing} currentUserId={currentUserId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </div>
  );
}

function UserDialog({ editing, currentUserId, onClose, onSaved }: { editing: UserDTO | "new" | null; currentUserId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [key, setKey] = useState<string | null>(null);

  const current = editing === null ? null : editing === "new" ? "new" : editing.id;
  if (current !== key) {
    setKey(current);
    setError("");
    if (editing === "new") setForm(EMPTY);
    else if (editing) setForm({ name: editing.name, email: editing.email, password: "", role: editing.role, active: editing.active });
  }
  const isNew = editing === "new";
  const self = !isNew && editing !== null && editing.id === currentUserId;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await saveUserAction(isNew ? null : (editing as UserDTO).id, form);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(isNew ? "Funcionário cadastrado." : "Funcionário atualizado.");
      onSaved();
    });
  };

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title={isNew ? "Novo funcionário" : "Editar funcionário"}>
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <Field label="Nome" htmlFor="u-nome">
            <Input id="u-nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} autoFocus required />
          </Field>
          <Field label="E-mail" htmlFor="u-email" hint={isNew ? undefined : "O e-mail não pode ser alterado."}>
            <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!isNew} required autoComplete="off" />
          </Field>
          <Field label={isNew ? "Senha" : "Nova senha (deixe em branco para manter)"} htmlFor="u-senha" hint="Mínimo de 8 caracteres.">
            <Input id="u-senha" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={isNew} minLength={8} maxLength={100} autoComplete="new-password" />
          </Field>
          <Field label="Perfil" htmlFor="u-perfil" hint={form.role === "ADMIN" ? "Vê tudo: faturamento, produtos, funcionários, caixa e relatórios." : "Realiza vendas e vê apenas as próprias vendas."}>
            <Select id="u-perfil" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "ADMIN" | "VENDEDOR" })} disabled={self}>
              <option value="VENDEDOR">Vendedor</option>
              <option value="ADMIN">Administrador</option>
            </Select>
          </Field>
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
