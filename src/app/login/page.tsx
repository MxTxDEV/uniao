import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { BrandMark } from "@/components/layout/brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="animate-pop w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl" />
          <h1 className="mt-5 text-2xl font-extrabold uppercase tracking-[0.14em]">União Grifes</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Entre para registrar vendas</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
