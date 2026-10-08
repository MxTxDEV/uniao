import { formatBRL } from "./money";
import { formatDateTime } from "./dates";
import { PAYMENT_LABEL, saleNumber } from "./utils";

export interface ReceiptData {
  number: number;
  total: string;
  subtotal: string;
  discount: string;
  paymentMethod: keyof typeof PAYMENT_LABEL;
  sellerName: string;
  createdAt: string;
  items: { description: string; quantity: number; unitPrice: string; total: string }[];
}

export interface StoreInfo {
  name: string;
  phone?: string | null;
  instagram?: string | null;
  address?: string | null;
}

/** Texto do comprovante para compartilhar (WhatsApp, etc.). */
export function buildReceiptText(store: StoreInfo, r: ReceiptData): string {
  const lines: string[] = [];
  lines.push(`*${store.name.toUpperCase()}*`);
  lines.push(`Comprovante ${saleNumber(r.number)}`);
  lines.push(formatDateTime(r.createdAt));
  lines.push("");
  for (const i of r.items) lines.push(`${i.quantity}x ${i.description} — ${formatBRL(i.total)}`);
  lines.push("");
  if (Number(r.discount) > 0) {
    lines.push(`Subtotal: ${formatBRL(r.subtotal)}`);
    lines.push(`Desconto: -${formatBRL(r.discount)}`);
  }
  lines.push(`*TOTAL: ${formatBRL(r.total)}*`);
  lines.push(`Pagamento: ${PAYMENT_LABEL[r.paymentMethod]}`);
  lines.push(`Vendedor: ${r.sellerName}`);
  lines.push("");
  lines.push("Obrigado pela preferência! 🖤");
  if (store.instagram) lines.push(store.instagram);
  return lines.join("\n");
}
