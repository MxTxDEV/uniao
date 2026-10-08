"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PAYMENT_LABEL, PAYMENT_ORDER } from "@/lib/utils";

interface Values {
  de: string;
  ate: string;
  vendedor: string;
  pagamento: string;
  status: string;
}

export function SalesFilters({ sellers, isAdmin, initial }: { sellers: { id: string; name: string }[]; isAdmin: boolean; initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries(v)) if (val) q.set(k, val);
    router.push(`/vendas${q.size ? `?${q}` : ""}`);
  };
  const clear = () => {
    setV({ de: "", ate: "", vendedor: "", pagamento: "", status: "" });
    router.push("/vendas");
  };
  const invalidRange = !!v.de && !!v.ate && v.ate < v.de;

  return (
    <Card className="mb-4 p-4">
      <form onSubmit={apply} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <Field label="De">
          <Input type="date" value={v.de} onChange={set("de")} aria-label="Data inicial" />
        </Field>
        <Field label="Até">
          <Input type="date" value={v.ate} onChange={set("ate")} aria-label="Data final" aria-invalid={invalidRange} />
        </Field>
        {isAdmin && (
          <Field label="Vendedor">
            <Select value={v.vendedor} onChange={set("vendedor")}>
              <option value="">Todos</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Pagamento">
          <Select value={v.pagamento} onChange={set("pagamento")}>
            <option value="">Todos</option>
            {PAYMENT_ORDER.map((m) => (
              <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={v.status} onChange={set("status")}>
            <option value="">Todos</option>
            <option value="COMPLETED">Concluída</option>
            <option value="CANCELED">Cancelada</option>
          </Select>
        </Field>
        <div className="col-span-2 flex items-end gap-2 md:col-span-1">
          <Button type="submit" className="flex-1" disabled={invalidRange}>
            <Filter className="h-4 w-4" /> Filtrar
          </Button>
          <Button type="button" variant="secondary" size="icon" onClick={clear} aria-label="Limpar filtros" className="h-11 w-11">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </form>
      {invalidRange && <p className="mt-2 text-sm text-danger">A data final deve ser igual ou posterior à inicial.</p>}
    </Card>
  );
}
