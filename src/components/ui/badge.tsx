import { cn } from "@/lib/utils";

const tones = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-warning-soft text-warning",
  dark: "bg-primary text-primary-foreground",
} as const;

export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: "COMPLETED" | "CANCELED" }) {
  return status === "COMPLETED" ? <Badge tone="success">Concluída</Badge> : <Badge tone="danger">Cancelada</Badge>;
}
