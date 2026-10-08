import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[1.25rem] border border-border bg-card shadow-[0_1px_2px_rgba(12,12,13,0.04)]", className)} {...props} />;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: boolean }) {
  return (
    <Card className={cn("p-5", accent && "bg-primary text-primary-foreground border-primary")}>
      <p className={cn("text-xs font-semibold uppercase tracking-wide", accent ? "text-white/60" : "text-muted-foreground")}>{label}</p>
      <p className="tabular mt-2 text-2xl font-bold tracking-tight sm:text-[1.7rem]">{value}</p>
      {hint && <p className={cn("mt-1 text-xs", accent ? "text-white/60" : "text-muted-foreground")}>{hint}</p>}
    </Card>
  );
}
