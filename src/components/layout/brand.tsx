import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-primary", className)} aria-hidden>
      <svg viewBox="0 0 64 64" className="h-6 w-6">
        <path d="M20 16v20a12 12 0 0 0 24 0V16" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        <circle cx="32" cy="50" r="2.6" fill="#a8864f" />
      </svg>
    </span>
  );
}

export function BrandName({ name = "União Grifes", className }: { name?: string; className?: string }) {
  return <span className={cn("text-[0.95rem] font-extrabold uppercase leading-none tracking-[0.12em]", className)}>{name}</span>;
}
