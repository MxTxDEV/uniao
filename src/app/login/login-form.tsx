"use client";
import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={state?.email ?? ""} autoComplete="username" autoFocus required placeholder="voce@loja.com" />
        </Field>
        <Field label="Senha" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Entrar
        </Button>
      </form>
    </Card>
  );
}
