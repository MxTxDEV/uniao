"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CornerDownLeft, Minus, Plus, Search, Share2, ShoppingBag, Trash2, PackageSearch } from "lucide-react";
import { createSaleAction } from "@/actions/sales";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { MoneyInput, centsToValue, toCents } from "@/components/ui/money-input";
import { EmptyState, ErrorText, Kbd } from "@/components/ui/misc";
import { buildReceiptText, type StoreInfo } from "@/lib/receipt";
import { formatBRL } from "@/lib/money";
import { cn, PAYMENT_LABEL, PAYMENT_ORDER, saleNumber, type PaymentKey } from "@/lib/utils";
import type { ProductDTO } from "@/server/products";
import type { SaleReceipt } from "@/server/sales";

interface Line {
  key: string;
  productId: string | null;
  description: string;
  unitPrice: string; // "89.90"
  quantity: number;
}

interface Props {
  products: ProductDTO[];
  sellers: { id: string; name: string }[];
  currentUserId: string;
  canPickSeller: boolean;
  settings: { allowDiscount: boolean; allowCustomItems: boolean };
  store: StoreInfo;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
const MAX_RESULTS = 48;

export function PosScreen({ products, sellers, currentUserId, canPickSeller, settings, store }: Props) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(uid());
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("0.00");
  const [payment, setPayment] = useState<PaymentKey | null>(null);
  const [sellerId, setSellerId] = useState(currentUserId);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [avulsaOpen, setAvulsaOpen] = useState(false);

  // ---- valores (em centavos inteiros: sem Float) ----
  const subtotalCents = cart.reduce((a, l) => a + toCents(l.unitPrice) * l.quantity, 0);
  const discountCents = toCents(discount);
  const totalCents = subtotalCents - discountCents;
  const discountInvalid = discountCents > subtotalCents || (subtotalCents > 0 && totalCents <= 0);
  const itemCount = cart.reduce((a, l) => a + l.quantity, 0);
  const canFinish = cart.length > 0 && !!payment && !discountInvalid && totalCents > 0 && !submitting;

  // ---- busca ----
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return products;
    const terms = q.split(/\s+/);
    return products.filter((p) => {
      const hay = norm(`${p.name} ${p.category} ${p.sku ?? ""}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [products, query]);

  const addProduct = useCallback((p: ProductDTO) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) return c.map((l, idx) => (idx === i ? { ...l, quantity: Math.min(l.quantity + 1, 9999) } : l));
      return [...c, { key: uid(), productId: p.id, description: p.name, unitPrice: p.price, quantity: 1 }];
    });
  }, []);

  const resetSale = useCallback(() => {
    setCart([]);
    setDiscount("0.00");
    setPayment(null);
    setSellerId(currentUserId);
    setQuery("");
    setReceipt(null);
    requestId.current = uid();
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [currentUserId]);

  // ---- atalhos ----
  useEffect(() => {
    const focus = () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    const onNew = () => {
      if (cart.length > 0) {
        toast.info("Há itens no carrinho. Finalize a venda ou use “Limpar”.");
        focus();
      } else resetSale();
    };
    window.addEventListener("pdv:focus-search", focus);
    window.addEventListener("pdv:new-sale", onNew);
    return () => {
      window.removeEventListener("pdv:focus-search", focus);
      window.removeEventListener("pdv:new-sale", onNew);
    };
  }, [cart.length, resetSale]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const finish = useCallback(async () => {
    if (!canFinish || !payment) return;
    setSubmitting(true);
    const r = await createSaleAction({
      requestId: requestId.current,
      sellerId: canPickSeller ? sellerId : undefined,
      paymentMethod: payment,
      discount,
      items: cart.map((l) => ({
        productId: l.productId,
        // preço só é enviado para item avulso; para produto cadastrado o servidor usa o preço do banco
        ...(l.productId ? {} : { description: l.description, unitPrice: l.unitPrice }),
        quantity: l.quantity,
      })),
    });
    setSubmitting(false);
    if (!r.ok) {
      if (r.code === "UNAUTHENTICATED") router.push("/login");
      toast.error(r.error);
      return;
    }
    setReceipt(r.data);
    // carrinho limpo imediatamente após finalizar
    setCart([]);
    setDiscount("0.00");
    setPayment(null);
    setQuery("");
  }, [canFinish, payment, canPickSeller, sellerId, discount, cart, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!receipt && !avulsaOpen) void finish();
        return;
      }
      const t = e.target as HTMLElement;
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
      if (!typing && !receipt && !avulsaOpen && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-5]$/.test(e.key)) {
        setPayment(PAYMENT_ORDER[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, receipt, avulsaOpen]);

  const changeQty = (key: string, delta: number) =>
    setCart((c) =>
      c.flatMap((l) => {
        if (l.key !== key) return [l];
        const q = l.quantity + delta;
        return q <= 0 ? [] : [{ ...l, quantity: Math.min(q, 9999) }];
      }),
    );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
      {/* ===== Busca e produtos ===== */}
      <section aria-label="Produtos" className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Nova venda</h1>
          {settings.allowCustomItems && (
            <Button variant="secondary" onClick={() => setAvulsaOpen(true)}>
              <Plus className="h-4 w-4" /> Venda avulsa
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const q = query.trim().toLowerCase();
                // código/SKU exato (leitor de código de barras) tem prioridade
                const exact = q ? products.find((p) => p.sku?.toLowerCase() === q) : undefined;
                const first = exact ?? results[0];
                if (first && q) {
                  addProduct(first);
                  setQuery("");
                }
              } else if (e.key === "Escape") setQuery("");
            }}
            type="search"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="Buscar produto…  (Ctrl + K)"
            aria-label="Buscar produto"
            className="h-14 w-full rounded-2xl border border-border bg-card pl-12 pr-24 text-base shadow-sm transition placeholder:text-muted-foreground/70 focus:border-foreground focus:outline-none focus:ring-4 focus:ring-foreground/10"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Kbd>Enter</Kbd> adiciona
          </span>
        </div>

        <div className="mt-4">
          {products.length === 0 ? (
            <Card>
              <EmptyState
                icon={<PackageSearch className="h-6 w-6" />}
                title="Nenhum produto cadastrado"
                description={settings.allowCustomItems ? "Sem problema: use “Venda avulsa” para vender qualquer item sem cadastro." : "Peça ao administrador para cadastrar produtos."}
              />
            </Card>
          ) : results.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title={`Nada encontrado para “${query}”`}
                description={settings.allowCustomItems ? "Venda este item como avulso, sem cadastrar." : undefined}
                action={
                  settings.allowCustomItems ? (
                    <Button onClick={() => setAvulsaOpen(true)}>
                      <Plus className="h-4 w-4" /> Venda avulsa
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {query ? `${results.length} encontrado${results.length > 1 ? "s" : ""}` : "Produtos"}
              </p>
              <ul className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 xl:grid-cols-3">
                {results.slice(0, MAX_RESULTS).map((p, idx) => {
                  const inCart = cart.find((l) => l.productId === p.id)?.quantity ?? 0;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          addProduct(p);
                          if (query) setQuery("");
                          searchRef.current?.focus();
                        }}
                        className={cn(
                          "group relative flex h-full w-full flex-col justify-between rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md active:scale-[0.98]",
                          inCart > 0 ? "border-foreground" : "border-border",
                          query && idx === 0 && "ring-2 ring-foreground/15",
                        )}
                      >
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{p.category}</p>
                          <p className="mt-1 line-clamp-2 font-semibold leading-snug">{p.name}</p>
                        </div>
                        <div className="mt-3 flex items-end justify-between">
                          <p className="tabular text-lg font-bold">{formatBRL(p.price)}</p>
                          {inCart > 0 ? (
                            <span className="tabular flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">{inCart}</span>
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                              <Plus className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {results.length > MAX_RESULTS && <p className="mt-3 text-center text-xs text-muted-foreground">Mostrando {MAX_RESULTS} de {results.length}. Refine a busca.</p>}
            </>
          )}
        </div>
      </section>

      {/* ===== Carrinho ===== */}
      <aside id="carrinho" aria-label="Carrinho" className="lg:sticky lg:top-8 lg:self-start">
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Carrinho {itemCount > 0 && `· ${itemCount}`}</h2>
            {cart.length > 0 && (
              <button type="button" onClick={() => setCart([])} className="text-xs font-semibold text-muted-foreground transition hover:text-danger">
                Limpar
              </button>
            )}
          </div>

          <div className="max-h-[38dvh] min-h-[7rem] overflow-y-auto lg:max-h-[34dvh]">
            {cart.length === 0 ? (
              <EmptyState icon={<ShoppingBag className="h-5 w-5" />} title="Carrinho vazio" description="Toque em um produto para adicionar." />
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((l) => (
                  <li key={l.key} className="animate-pop flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {l.description}
                        {!l.productId && <span className="ml-2 rounded-md bg-warning-soft px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-warning">avulso</span>}
                      </p>
                      <p className="tabular text-xs text-muted-foreground">{formatBRL(l.unitPrice)} un.</p>
                    </div>
                    <div className="flex items-center rounded-xl border border-border">
                      <button type="button" aria-label={l.quantity === 1 ? "Remover item" : "Diminuir quantidade"} onClick={() => changeQty(l.key, -1)} className="flex h-9 w-9 items-center justify-center rounded-l-xl text-muted-foreground hover:bg-muted">
                        {l.quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                      </button>
                      <span className="tabular w-7 text-center text-sm font-bold" aria-label={`Quantidade ${l.quantity}`}>{l.quantity}</span>
                      <button type="button" aria-label="Aumentar quantidade" onClick={() => changeQty(l.key, 1)} className="flex h-9 w-9 items-center justify-center rounded-r-xl text-muted-foreground hover:bg-muted">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="tabular w-[5.5rem] text-right text-sm font-bold">{formatBRL(centsToValue(toCents(l.unitPrice) * l.quantity))}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4 border-t border-border bg-muted/40 px-5 py-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular font-semibold text-foreground">{formatBRL(centsToValue(subtotalCents))}</span>
              </div>
              {settings.allowDiscount && (
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="desconto" className="text-muted-foreground">Desconto</label>
                  <MoneyInput id="desconto" value={discount} onValueChange={setDiscount} className={cn("h-10 w-36", discountInvalid && "border-danger")} aria-invalid={discountInvalid} />
                </div>
              )}
              {discountInvalid && <ErrorText>O desconto não pode zerar ou superar o subtotal.</ErrorText>}
            </div>
            <div className="flex items-end justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Total</span>
              <span className="tabular text-4xl font-extrabold tracking-tight" data-testid="total">
                {formatBRL(centsToValue(Math.max(totalCents, 0)))}
              </span>
            </div>
          </div>

          <div className="space-y-4 border-t border-border px-5 py-4">
            {canPickSeller ? (
              <Field label="Vendedor" htmlFor="vendedor">
                <Select id="vendedor" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">Vendedor: <span className="font-semibold text-foreground">{sellers[0]?.name}</span></p>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forma de pagamento</p>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5" role="radiogroup" aria-label="Forma de pagamento">
                {PAYMENT_ORDER.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={payment === m}
                    onClick={() => setPayment(m)}
                    className={cn(
                      "relative flex h-14 flex-col items-center justify-center rounded-xl border text-[11px] font-bold uppercase tracking-wide transition active:scale-[0.97]",
                      payment === m ? "border-primary bg-primary text-primary-foreground shadow" : "border-border bg-card hover:border-foreground/40",
                    )}
                  >
                    {payment === m && <Check className="absolute right-1 top-1 h-3 w-3" />}
                    {PAYMENT_LABEL[m]}
                    <span className={cn("mt-0.5 hidden text-[9px] font-medium lg:block", payment === m ? "text-white/60" : "text-muted-foreground")}>{i + 1}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button size="lg" className="h-16 w-full text-base uppercase tracking-wide" disabled={!canFinish} loading={submitting} onClick={finish}>
              Finalizar venda
              <span className="ml-1 hidden items-center gap-1 text-xs font-medium opacity-60 xl:inline-flex"><CornerDownLeft className="h-3 w-3" />Ctrl+Enter</span>
            </Button>
            {!payment && cart.length > 0 && <p className="-mt-2 text-center text-xs text-muted-foreground">Escolha a forma de pagamento</p>}
          </div>
        </Card>
      </aside>

      {/* Barra flutuante (mobile): resumo + atalho para o carrinho */}
      {cart.length > 0 && (
        <a
          href="#carrinho"
          className="no-print animate-pop fixed inset-x-3 bottom-[4.9rem] z-20 flex items-center justify-between rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground shadow-xl md:hidden"
        >
          <span className="text-sm font-semibold">{itemCount} {itemCount > 1 ? "itens" : "item"}</span>
          <span className="tabular text-lg font-extrabold">{formatBRL(centsToValue(Math.max(totalCents, 0)))}</span>
          <span className="text-sm font-semibold underline">Pagar</span>
        </a>
      )}

      <AvulsaDialog
        open={avulsaOpen}
        onOpenChange={(o) => {
          setAvulsaOpen(o);
          if (!o) setTimeout(() => searchRef.current?.focus(), 50);
        }}
        onAdd={(l) => setCart((c) => [...c, { ...l, key: uid(), productId: null }])}
      />

      <FinishedDialog receipt={receipt} store={store} onNew={resetSale} />
    </div>
  );
}

function AvulsaDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (l: Omit<Line, "key" | "productId">) => void }) {
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0.00");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDescription("");
      setPrice("0.00");
      setQuantity(1);
      setError("");
    }
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return setError("Informe a descrição.");
    if (toCents(price) <= 0) return setError("Informe um valor maior que zero.");
    if (!Number.isInteger(quantity) || quantity < 1) return setError("A quantidade deve ser maior que zero.");
    onAdd({ description: description.trim().slice(0, 120), unitPrice: price, quantity });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Venda avulsa" description="Item sem cadastro. Informe o que está vendendo e o valor.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Descrição" htmlFor="av-desc">
            <Input id="av-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Tênis" maxLength={120} autoFocus autoComplete="off" />
          </Field>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field label="Valor" htmlFor="av-valor">
              <MoneyInput id="av-valor" value={price} onValueChange={setPrice} className="h-12 text-lg" />
            </Field>
            <Field label="Qtd." htmlFor="av-qtd">
              <Input id="av-qtd" type="number" min={1} max={9999} step={1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(Math.floor(Number(e.target.value)))} className="h-12 text-center text-lg font-semibold" />
            </Field>
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="flex-1">Adicionar ao carrinho</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FinishedDialog({ receipt, store, onNew }: { receipt: SaleReceipt | null; store: StoreInfo; onNew: () => void }) {
  const text = receipt ? buildReceiptText(store, receipt) : "";

  const share = async () => {
    if (!receipt) return;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `Comprovante ${saleNumber(receipt.number)}`, text });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={!!receipt} onOpenChange={(o) => !o && onNew()}>
      <DialogContent title="Venda finalizada" hideClose className="max-w-md text-center" onOpenAutoFocus={(e) => e.preventDefault()}>
        {receipt && (
          <div>
            <div className="mx-auto -mt-2 mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="h-7 w-7" strokeWidth={3} />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Total</p>
            <p className="tabular text-5xl font-extrabold tracking-tight">{formatBRL(receipt.total)}</p>
            <dl className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-y-2 text-left text-sm">
              <dt className="text-muted-foreground">Pagamento</dt>
              <dd className="text-right font-semibold">{PAYMENT_LABEL[receipt.paymentMethod]}</dd>
              <dt className="text-muted-foreground">Vendedor</dt>
              <dd className="text-right font-semibold">{receipt.sellerName}</dd>
              <dt className="text-muted-foreground">Número</dt>
              <dd className="tabular text-right font-semibold">{saleNumber(receipt.number)}</dd>
            </dl>
            <div className="mt-6 grid gap-2">
              <Button size="lg" onClick={onNew} autoFocus>
                Nova venda <Kbd>Enter</Kbd>
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" asChild>
                  <Link href={`/vendas/${receipt.id}`}>Ver venda</Link>
                </Button>
                <Button variant="secondary" onClick={share}>
                  <Share2 className="h-4 w-4" /> Compartilhar
                </Button>
              </div>
            </div>
            <button type="button" onClick={onNew} className="sr-only">Fechar</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
