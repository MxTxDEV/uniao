import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function saleNumber(n: number): string {
  return `#${String(n).padStart(6, "0")}`;
}

export const PAYMENT_LABEL = {
  PIX: "PIX",
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  OUTRO: "Outro",
} as const;

export const PAYMENT_ORDER = ["PIX", "DINHEIRO", "DEBITO", "CREDITO", "OUTRO"] as const;
export type PaymentKey = (typeof PAYMENT_ORDER)[number];

export const STATUS_LABEL = { COMPLETED: "Concluída", CANCELED: "Cancelada" } as const;
export const ROLE_LABEL = { ADMIN: "Administrador", VENDEDOR: "Vendedor" } as const;

/** Prefixa com apóstrofo células que o Excel interpretaria como fórmula (CSV injection). */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Número já formatado para CSV (pode ser negativo; não sofre o prefixo anti-fórmula). */
export function csvNum(v: string): string {
  return v;
}
