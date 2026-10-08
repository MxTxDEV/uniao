"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

export function CustomRange({ de, ate }: { de: string; ate: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(de);
  const [to, setTo] = useState(ate);
  const invalid = !from || !to || to < from;
  return (
    <Card className="p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) router.push(`/relatorios?periodo=personalizado&de=${from}&ate=${to}`);
        }}
      >
        <Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" /></Field>
        <Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" /></Field>
        <Button type="submit" disabled={invalid}>Aplicar</Button>
        {invalid && from && to && <p className="w-full text-sm text-danger">A data final deve ser igual ou posterior à inicial.</p>}
      </form>
    </Card>
  );
}
