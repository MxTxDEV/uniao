"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, Pencil, Plus, Search } from "lucide-react";
import { saveProductAction, toggleProductAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState, ErrorText, PageHeader } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { formatBRL } from "@/lib/money";
import type { ProductDTO } from "@/server/products";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const EMPTY = { name: "", category: "", price: "0.00", sku: "", imageUrl: "", active: true };

export function ProductsClient({ products }: { products: ProductDTO[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProductDTO | "new" | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);
  const filtered = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return products;
    return products.filter((p) => norm(`${p.name} ${p.category} ${p.sku ?? ""}`).includes(t));
  }, [products, q]);

  const toggle = (p: ProductDTO, active: boolean) => {
    setPendingId(p.id);
    start(async () => {
      const r = await toggleProductAction(p.id, active);
      setPendingId(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(active ? "Produto ativado." : "Produto desativado.");
      router.refresh();
    });
  };

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Cadastro opcional — serve só para agilizar a venda. Sem estoque, sem custo."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Novo produto
          </Button>
        }
      />

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, categoria ou código" className="pl-10" aria-label="Buscar produtos" />
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title={products.length === 0 ? "Nenhum produto cadastrado" : "Nenhum produto encontrado"}
            description={products.length === 0 ? "Você pode vender sem cadastrar nada usando a venda avulsa. Cadastre apenas o que vende com frequência." : "Tente outro termo de busca."}
            action={products.length === 0 ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Novo produto</Button> : undefined}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Produto</th>
                <th className="hidden px-3 py-3 font-semibold sm:table-cell">Categoria</th>
                <th className="px-3 py-3 text-right font-semibold">Preço</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground sm:hidden">{p.category}</p>
                    {p.sku && <p className="font-mono text-[11px] text-muted-foreground">{p.sku}</p>}
                  </td>
                  <td className="hidden px-3 py-3.5 text-muted-foreground sm:table-cell">{p.category}</td>
                  <td className="tabular px-3 py-3.5 text-right font-semibold">{formatBRL(p.price)}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <Switch checked={p.active} disabled={pendingId === p.id} onCheckedChange={(v) => toggle(p, v)} aria-label={`${p.active ? "Desativar" : "Ativar"} ${p.name}`} />
                      <Badge tone={p.active ? "success" : "neutral"} className="hidden sm:inline-flex">{p.active ? "Ativo" : "Inativo"}</Badge>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Editar</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ProductDialog editing={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </div>
  );
}

function ProductDialog({ editing, categories, onClose, onSaved }: { editing: ProductDTO | "new" | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [key, setKey] = useState<string | null>(null);

  // Reinicia o formulário sempre que abre para outro produto
  const current = editing === null ? null : editing === "new" ? "new" : editing.id;
  if (current !== key) {
    setKey(current);
    setError("");
    if (editing === "new") setForm(EMPTY);
    else if (editing) setForm({ name: editing.name, category: editing.category, price: editing.price, sku: editing.sku ?? "", imageUrl: editing.imageUrl ?? "", active: editing.active });
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await saveProductAction(editing && editing !== "new" ? editing.id : null, form);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(editing === "new" ? "Produto cadastrado." : "Produto atualizado.");
      onSaved();
    });
  };
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title={editing === "new" ? "Novo produto" : "Editar produto"}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nome" htmlFor="p-nome">
            <Input id="p-nome" value={form.name} onChange={set("name")} maxLength={120} autoFocus required placeholder="Camiseta Oversized" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria" htmlFor="p-cat">
              <Input id="p-cat" value={form.category} onChange={set("category")} maxLength={60} list="categorias" required placeholder="Roupas" />
              <datalist id="categorias">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Preço" htmlFor="p-preco">
              <MoneyInput id="p-preco" value={form.price} onValueChange={(v) => setForm((f) => ({ ...f, price: v }))} />
            </Field>
          </div>
          <Field label="Código/SKU (opcional)" htmlFor="p-sku">
            <Input id="p-sku" value={form.sku} onChange={set("sku")} maxLength={60} />
          </Field>
          <Field label="Imagem (opcional)" htmlFor="p-img" hint="Link da imagem (https://…)">
            <Input id="p-img" value={form.imageUrl} onChange={set("imageUrl")} maxLength={500} inputMode="url" placeholder="https://" />
          </Field>
          <label className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3 text-sm font-semibold">
            Ativo
            <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          </label>
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
