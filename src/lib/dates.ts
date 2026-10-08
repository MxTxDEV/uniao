// A loja opera no horário de Brasília (UTC-3, sem horário de verão desde 2019).
// O servidor (Vercel) roda em UTC, então todo limite de "dia" é calculado explicitamente aqui.
const BR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Início (00:00 de Brasília) do dia que contém `d`, como instante UTC. */
export function startOfDayBR(d: Date = new Date()): Date {
  const local = new Date(d.getTime() - BR_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + BR_OFFSET_MS);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function startOfMonthBR(d: Date = new Date()): Date {
  const local = new Date(d.getTime() - BR_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + BR_OFFSET_MS);
}

export function addMonthsBR(start: Date, n: number): Date {
  const local = new Date(start.getTime() - BR_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + n, 1) + BR_OFFSET_MS);
}

/** "2026-10-08" (data local de Brasília) de um instante. */
export function ymdBR(d: Date): string {
  return new Date(d.getTime() - BR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Interpreta "YYYY-MM-DD" como o início desse dia em Brasília. Retorna null se inválido. */
export function parseYmdBR(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return new Date(t + BR_OFFSET_MS);
}

export function greeting(now: Date = new Date()): string {
  const h = new Date(now.getTime() - BR_OFFSET_MS).getUTCHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));
export const formatDateTime = (d: Date | string) => dateTimeFmt.format(new Date(d)).replace(",", "");

export interface Period {
  key: string;
  label: string;
  start: Date; // inclusivo
  end: Date; // exclusivo
}

export type PeriodKey = "hoje" | "ontem" | "7dias" | "30dias" | "mes" | "mes-anterior" | "personalizado";

export const DASHBOARD_PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7dias", label: "7 dias" },
  { key: "30dias", label: "30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes-anterior", label: "Mês anterior" },
];

export const REPORT_PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes-anterior", label: "Mês passado" },
  { key: "personalizado", label: "Personalizado" },
];

const LABELS: Record<PeriodKey, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7dias": "Últimos 7 dias",
  "30dias": "Últimos 30 dias",
  mes: "Este mês",
  "mes-anterior": "Mês anterior",
  personalizado: "Personalizado",
};

export function resolvePeriod(
  key: string | undefined,
  opts: { from?: string; to?: string; now?: Date; fallback?: PeriodKey } = {},
): Period {
  const now = opts.now ?? new Date();
  const today = startOfDayBR(now);
  const tomorrow = addDays(today, 1);
  const k = (key && key in LABELS ? key : opts.fallback ?? "hoje") as PeriodKey;
  let start: Date;
  let end: Date;
  switch (k) {
    case "ontem":
      start = addDays(today, -1);
      end = today;
      break;
    case "7dias":
      start = addDays(today, -6);
      end = tomorrow;
      break;
    case "30dias":
      start = addDays(today, -29);
      end = tomorrow;
      break;
    case "mes":
      start = startOfMonthBR(now);
      end = tomorrow;
      break;
    case "mes-anterior": {
      const thisMonth = startOfMonthBR(now);
      start = addMonthsBR(thisMonth, -1);
      end = thisMonth;
      break;
    }
    case "personalizado": {
      const f = parseYmdBR(opts.from);
      const t = parseYmdBR(opts.to);
      if (f && t && t >= f) {
        const days = Math.round((t.getTime() - f.getTime()) / DAY_MS);
        if (days <= 366) {
          start = f;
          end = addDays(t, 1);
          break;
        }
      }
      start = today;
      end = tomorrow;
      break;
    }
    default:
      start = today;
      end = tomorrow;
  }
  return { key: k, label: LABELS[k], start, end };
}
