"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Printer, Share2 } from "lucide-react";
import { cancelSaleAction } from "@/actions/sales";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/misc";
import { buildReceiptText, type ReceiptData, type StoreInfo } from "@/lib/receipt";
import { saleNumber } from "@/lib/utils";

export function SaleActions({ saleId, number, status, canCancel, receipt, store }: { saleId: string; number: number; status: "COMPLETED" | "CANCELED"; canCancel: boolean; receipt: ReceiptData; store: StoreInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const share = async () => {
    const text = buildReceiptText(store, receipt);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Comprovante ${saleNumber(number)}`, text });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await cancelSaleAction({ id: saleId, reason });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Venda cancelada.");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <div className="no-print mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
        <Button variant="secondary" onClick={share}>
          <Share2 className="h-4 w-4" /> Compartilhar
        </Button>
        {canCancel && status === "COMPLETED" && (
          <Button variant="danger-ghost" className="col-span-2 sm:ml-auto" onClick={() => setOpen(true)}>
            <Ban className="h-4 w-4" /> Cancelar venda
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent title="Cancelar venda" description="Tem certeza que deseja cancelar esta venda?">
          <form onSubmit={confirm} className="space-y-4">
            <p className="rounded-xl bg-muted px-3 py-2 text-sm">
              A venda <b className="tabular">{saleNumber(number)}</b> continuará registrada como <b>CANCELADA</b> e deixará de contar no faturamento.
            </p>
            <Field label="Motivo (opcional)" htmlFor="motivo">
              <Input id="motivo" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus autoComplete="off" placeholder="Ex.: cliente desistiu" />
            </Field>
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)} disabled={pending}>Voltar</Button>
              <Button type="submit" variant="danger" className="flex-1" loading={pending}>Cancelar venda</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
