"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/errors";
import { requireCtx } from "@/server/auth";
import { createProduct, setProductActive, updateProduct } from "@/server/products";
import { createUser, updateUser, changeOwnPassword } from "@/server/users";
import { updateSettings } from "@/server/settings";
import { createStockEntry } from "@/server/stock";
import { addMovement, closeRegister, openRegister } from "@/server/cash";

export async function saveProductAction(id: string | null, input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    const p = id ? await updateProduct(ctx, id, input) : await createProduct(ctx, input);
    revalidatePath("/produtos");
    revalidatePath("/nova-venda");
    return p;
  });
}

export async function toggleProductAction(id: string, active: boolean) {
  return run(async () => {
    const ctx = await requireCtx();
    await setProductActive(ctx, id, active);
    revalidatePath("/produtos");
    revalidatePath("/nova-venda");
  });
}

export async function saveUserAction(id: string | null, input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    const u = id ? await updateUser(ctx, id, input) : await createUser(ctx, input);
    revalidatePath("/funcionarios");
    return u;
  });
}

export async function changePasswordAction(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    await changeOwnPassword(ctx, input);
  });
}

export async function saveSettingsAction(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    await updateSettings(ctx, input);
    revalidatePath("/", "layout");
  });
}

export async function openCashAction(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    await openRegister(ctx, input);
    revalidatePath("/caixa");
  });
}

export async function cashMovementAction(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    await addMovement(ctx, input);
    revalidatePath("/caixa");
  });
}

export async function closeCashAction(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    const r = await closeRegister(ctx, input);
    revalidatePath("/caixa");
    revalidatePath("/dashboard");
    return r;
  });
}

export async function stockEntryAction(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    const r = await createStockEntry(ctx, input);
    revalidatePath("/estoque");
    revalidatePath("/produtos");
    revalidatePath("/nova-venda");
    revalidatePath("/relatorios");
    return r;
  });
}
