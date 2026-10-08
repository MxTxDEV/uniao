import { z } from "zod";
import { AppError } from "./errors";

export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.");
  }
  return r.data;
}

// Remove caracteres de controle e espaços nas pontas (sanitização de texto livre).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export const text = (max: number, label: string) =>
  z
    .string({ message: `${label} é obrigatório.` })
    .transform((s) => s.replace(CONTROL, "").trim())
    .pipe(z.string().min(1, `${label} é obrigatório.`).max(max, `${label} deve ter no máximo ${max} caracteres.`));

export const optionalText = (max: number, label: string) =>
  z
    .string()
    .nullish()
    .transform((s) => (s ?? "").replace(CONTROL, "").trim())
    .pipe(z.string().max(max, `${label} deve ter no máximo ${max} caracteres.`))
    .transform((s) => (s === "" ? null : s));

export const moneyStr = z
  .string({ message: "Valor inválido." })
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Valor inválido.");

export const optionalUrl = (label: string) =>
  optionalText(500, label).refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), `${label} deve começar com http:// ou https://`);

export const paymentEnum = z.enum(["PIX", "DINHEIRO", "DEBITO", "CREDITO", "OUTRO"], { message: "Escolha a forma de pagamento." });
