import { Prisma } from "@prisma/client";
import { AppError } from "./errors";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: Prisma.Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) return brl.format(0);
  // toFixed(2) do Decimal evita qualquer erro de ponto flutuante antes de formatar.
  const fixed = new Decimal(value).toFixed(2);
  return brl.format(Number(fixed));
}

/** Converte string "89.90" (formato da API) em Decimal, rejeitando entradas inválidas. */
export function parseMoney(input: string, field = "Valor"): Prisma.Decimal {
  if (typeof input !== "string" || !/^\d{1,9}(\.\d{1,2})?$/.test(input.trim())) {
    throw new AppError("VALIDATION", `${field} inválido.`);
  }
  return new Decimal(input.trim());
}

export function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((a, b) => a.plus(b), new Decimal(0));
}

/** Decimal | null -> string (segura para atravessar a fronteira servidor→cliente). */
export function dec(value: Prisma.Decimal | null | undefined): string {
  return new Decimal(value ?? 0).toFixed(2);
}
