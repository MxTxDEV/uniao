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

const MAX_CENTS = 99_999_999_999; // R$ 999.999.999,99

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  /** Valor decimal em string no formato da API: "350.00" */
  value: string;
  onValueChange: (v: string) => void;
}

/**
 * Máscara monetária por centavos: digitar 3 5 0 0 0 -> R$ 350,00.
 * Trabalha com inteiros (centavos), nunca Float. O cursor fica sempre no fim.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, Props>(({ value, onValueChange, className, onKeyDown, ...props }, ref) => {
  const inner = React.useRef<HTMLInputElement | null>(null);
  const setRefs = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
  };
  const toEnd = () => {
    const el = inner.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  };
  React.useLayoutEffect(() => {
    if (inner.current && document.activeElement === inner.current) toEnd();
  });

  const apply = (cents: number) => onValueChange(centsToValue(Math.min(Math.max(cents, 0), MAX_CENTS)));

  return (
    <input
      ref={setRefs}
      inputMode="numeric"
      autoComplete="off"
      className={cn(inputClass, "tabular text-right font-semibold", className)}
      value={display(value)}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        const cents = toCents(value);
        if (/^\d$/.test(e.key)) {
          e.preventDefault();
          apply(cents * 10 + Number(e.key));
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          apply(Math.floor(cents / 10));
        }
      }}
      // Fallback (teclado virtual/colar): reconstrói a partir de todos os dígitos do texto.
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11);
        apply(digits ? parseInt(digits, 10) : 0);
      }}
      onFocus={() => setTimeout(toEnd, 0)}
      onClick={toEnd}
      {...props}
    />
  );
});
MoneyInput.displayName = "MoneyInput";
