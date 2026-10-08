"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings, ShoppingBag, UserRound, Wallet } from "lucide-react";
import { cn, ROLE_LABEL } from "@/lib/utils";
import { logoutAction } from "@/actions/auth";
import { BrandMark, BrandName } from "./brand";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  admin?: boolean;
  hint?: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, admin: true },
  { href: "/nova-venda", label: "Nova Venda", icon: ShoppingBag, hint: "F2" },
  { href: "/vendas", label: "Vendas", icon: Receipt },
  { href: "/produtos", label: "Produtos", icon: Package, admin: true },
  { href: "/caixa", label: "Caixa", icon: Wallet, admin: true },
  { href: "/funcionarios", label: "Funcionários", icon: UserRound, admin: true },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, admin: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings, admin: true },
];

interface Props {
  user: { name: string; role: "ADMIN" | "VENDEDOR"; tenantName: string };
  children: React.ReactNode;
}

export function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => !n.admin || user.role === "ADMIN");

  // Atalhos globais: F2 = Nova venda · Ctrl/Cmd+K = buscar produto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        if (pathname === "/nova-venda") window.dispatchEvent(new Event("pdv:new-sale"));
        else router.push("/nova-venda");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (pathname === "/nova-venda") window.dispatchEvent(new Event("pdv:focus-search"));
        else router.push("/nova-venda");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  const isActive = (href: string) => pathname === href || (href !== "/nova-venda" && pathname.startsWith(href + "/"));
  const mobilePrimary = user.role === "ADMIN" ? items.filter((i) => ["/dashboard", "/nova-venda", "/vendas", "/caixa"].includes(i.href)) : items;
  const mobileRest = items.filter((i) => !mobilePrimary.includes(i));

  return (
    <div className="min-h-dvh">
      {/* Sidebar: compacta no tablet (md), completa no desktop (lg) */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r border-border bg-card md:flex lg:w-64">
        <div className="flex h-[72px] items-center gap-3 px-5 max-lg:justify-center max-lg:px-0">
          <BrandMark />
          <div className="hidden min-w-0 lg:block">
            <BrandName name={user.tenantName} className="block truncate" />
            <span className="mt-1 block text-[11px] text-muted-foreground">PDV</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Principal">
          {items.map((n) => {
            const active = isActive(n.href);
            const highlight = n.href === "/nova-venda";
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition max-lg:justify-center max-lg:px-0",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  highlight && !active && "text-foreground",
                )}
              >
                <n.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="hidden flex-1 lg:inline">{n.label}</span>
                {n.hint && <span className="hidden lg:inline"><Kbd>{n.hint}</Kbd></span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-xl p-2 max-lg:justify-center max-lg:p-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold" title={user.name}>
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
            </div>
            <form action={logoutAction} className="max-lg:hidden">
              <button type="submit" className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" title="Sair" aria-label="Sair">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
          <form action={logoutAction} className="mt-1 hidden max-lg:block">
            <button type="submit" className="flex h-10 w-full items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" title="Sair" aria-label="Sair">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </aside>

      {/* Topo mobile */}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8 rounded-lg" />
          <BrandName name={user.tenantName} className="text-[0.8rem]" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{user.name}</span>
      </header>

      <main className="md:pl-[76px] lg:pl-64">
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8 lg:px-10">{children}</div>
      </main>

      {/* Navegação inferior (mobile) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Principal">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobilePrimary.length + (mobileRest.length ? 1 : 0) + (user.role === "VENDEDOR" ? 1 : 0)}, minmax(0, 1fr))` }}>
          {mobilePrimary.map((n) => {
            const active = isActive(n.href);
            const main = n.href === "/nova-venda";
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
                  <span className={cn("flex h-7 w-11 items-center justify-center rounded-full transition", active && "bg-muted", main && "bg-primary text-primary-foreground")}>
                    <n.icon className="h-[18px] w-[18px]" />
                  </span>
                  {n.label}
                </Link>
              </li>
            );
          })}
          {mobileRest.length > 0 && (
            <li>
              <button type="button" onClick={() => setMore(true)} className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <span className="flex h-7 w-11 items-center justify-center"><Menu className="h-[18px] w-[18px]" /></span>
                Mais
              </button>
            </li>
          )}
          {user.role === "VENDEDOR" && (
            <li>
              <form action={logoutAction}>
                <button type="submit" className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <span className="flex h-7 w-11 items-center justify-center"><LogOut className="h-[18px] w-[18px]" /></span>
                  Sair
                </button>
              </form>
            </li>
          )}
        </ul>
      </nav>

      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent title="Menu" className="max-w-sm">
          <div className="space-y-1">
            {mobileRest.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-muted">
                <n.icon className="h-[18px] w-[18px]" />
                {n.label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button type="submit" className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger-soft">
                <LogOut className="h-[18px] w-[18px]" />
                Sair
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
