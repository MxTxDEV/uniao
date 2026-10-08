"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

/** "350.00" -> "R$ 350,00" */
function display(value: string): string {
  const cents = toCents(value);
  const reais = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${reais},${String(cents % 100).padStart(2, "0")}`;
}
export function toCents(value: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value || "");
  if (!m) return 0;
  return parseInt(m[1], 10) * 100 + parseInt((m[2] ?? "").padEnd(2, "0") || "0", 10);
}
export function centsToValue(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  /** Valor decimal em string no formato da API: "350.00" */
  value: string;
  onValueChange: (v: string) => void;
}

/** Máscara monetária por centavos: digite 35000 -> R$ 350,00. Nunca usa Float para o valor armazenado. */
export const MoneyInput = React.forwardRef<HTMLInputElement, Props>(({ value, onValueChange, className, ...props }, ref) => (
  <input
    ref={ref}
    inputMode="numeric"
    autoComplete="off"
    className={cn(inputClass, "tabular text-right font-semibold", className)}
    value={display(value)}
    onChange={(e) => {
      const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11);
      onValueChange(centsToValue(digits ? parseInt(digits, 10) : 0));
    }}
    onFocus={(e) => e.currentTarget.select()}
    {...props}
  />
));
MoneyInput.displayName = "MoneyInput";
