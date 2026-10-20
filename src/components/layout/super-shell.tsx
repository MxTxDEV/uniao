"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, LogOut, ShieldCheck, Users } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";

const NAV = [
  { href: "/super", label: "Empresas", icon: Building2 },
  { href: "/super/usuarios", label: "Usuários", icon: Users },
  { href: "/super/admins", label: "Super admins", icon: ShieldCheck },
  { href: "/super/atividade", label: "Atividade", icon: Activity },
];

export function SuperShell({ admin, children }: { admin: { name: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/super" ? pathname === "/super" || pathname.startsWith("/super/empresas") : pathname.startsWith(href));

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r border-border bg-card md:flex lg:w-64">
        <div className="flex h-[72px] items-center gap-3 px-5 max-lg:justify-center max-lg:px-0">
          <BrandMark />
          <div className="hidden lg:block">
            <span className="block text-[0.95rem] font-extrabold uppercase leading-none tracking-[0.12em]">Plataforma</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">Super admin</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Plataforma">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              title={n.label}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition max-lg:justify-center max-lg:px-0",
                isActive(n.href) ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <n.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="hidden lg:inline">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-xl p-2 max-lg:justify-center max-lg:p-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white" title={admin.name}>
              {admin.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="truncate text-sm font-semibold">{admin.name}</p>
              <p className="text-xs text-muted-foreground">Super admin</p>
            </div>
            <form action={logoutAction} className="max-lg:hidden">
              <button type="submit" className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" title="Sair" aria-label="Sair">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
          <form action={logoutAction} className="mt-1 hidden max-lg:block">
            <button type="submit" className="flex h-10 w-full items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" title="Sair" aria-label="Sair">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8 rounded-lg" />
            <span className="text-[0.8rem] font-extrabold uppercase tracking-[0.12em]">Plataforma</span>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><LogOut className="h-4 w-4" /> Sair</button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Plataforma">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold", isActive(n.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="md:pl-[76px] lg:pl-64">
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-5 sm:px-6 md:pt-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
