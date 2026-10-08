"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/errors";
import { requireCtx } from "@/server/auth";
import { cancelSale, createSale } from "@/server/sales";

export async function createSaleAction(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    const sale = await createSale(ctx, input);
    revalidatePath("/dashboard");
    revalidatePath("/vendas");
    revalidatePath("/caixa");
    return sale;
  });
}

export async function cancelSaleAction(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    await cancelSale(ctx, input);
    revalidatePath("/", "layout");
  });
}
