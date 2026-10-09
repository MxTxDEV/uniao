import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { dec, parseMoney } from "@/lib/money";
import { moneyStr, optionalText, optionalUrl, parse, text } from "@/lib/validate";
import { audit } from "./audit";
import { assertAdmin, type Ctx } from "./context";

export interface ProductDTO {
  id: string;
  name: string;
  category: string;
  price: string;
  sku: string | null;
  imageUrl: string | null;
  active: boolean;
  stock: number;
}

const toDTO = (p: { id: string; name: string; category: string; price: import("@prisma/client").Prisma.Decimal; sku: string | null; imageUrl: string | null; active: boolean; stock: number }): ProductDTO => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price: dec(p.price),
  sku: p.sku,
  imageUrl: p.imageUrl,
  active: p.active,
  stock: p.stock,
});

/** Produtos ativos para o PDV (qualquer perfil da loja). */
export async function listActiveProducts(ctx: Ctx): Promise<ProductDTO[]> {
  const rows = await db.product.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  return rows.map(toDTO);
}

export async function listProducts(ctx: Ctx, q?: string): Promise<ProductDTO[]> {
  assertAdmin(ctx);
  const term = q?.trim();
  const rows = await db.product.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { category: { contains: term, mode: "insensitive" } },
              { sku: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 1000,
  });
  return rows.map(toDTO);
}

const productSchema = z.object({
  name: text(120, "Nome"),
  category: text(60, "Categoria"),
  price: moneyStr,
  sku: optionalText(60, "Código/SKU"),
  imageUrl: optionalUrl("Imagem"),
  active: z.boolean().default(true),
});

export async function createProduct(ctx: Ctx, input: unknown): Promise<ProductDTO> {
  assertAdmin(ctx);
  const d = parse(productSchema, input);
  const price = parseMoney(d.price, "Preço");
  if (price.lte(0)) throw new AppError("VALIDATION", "O preço deve ser maior que zero.");
  const p = await db.product.create({ data: { ...d, price, tenantId: ctx.tenantId } });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "PRODUCT_CREATE", entity: "Product", entityId: p.id, meta: { name: p.name } });
  return toDTO(p);
}

export async function updateProduct(ctx: Ctx, id: string, input: unknown): Promise<ProductDTO> {
  assertAdmin(ctx);
  const d = parse(productSchema, input);
  const price = parseMoney(d.price, "Preço");
  if (price.lte(0)) throw new AppError("VALIDATION", "O preço deve ser maior que zero.");
  // updateMany com tenantId no where: impossível alterar produto de outra loja mesmo conhecendo o ID.
  const r = await db.product.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { ...d, price } });
  if (r.count === 0) throw new AppError("NOT_FOUND", "Produto não encontrado.");
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "PRODUCT_UPDATE", entity: "Product", entityId: id, meta: { name: d.name, active: d.active } });
  return toDTO(await db.product.findFirstOrThrow({ where: { id, tenantId: ctx.tenantId } }));
}

export async function setProductActive(ctx: Ctx, id: string, active: boolean): Promise<void> {
  assertAdmin(ctx);
  const r = await db.product.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { active } });
  if (r.count === 0) throw new AppError("NOT_FOUND", "Produto não encontrado.");
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: active ? "PRODUCT_ACTIVATE" : "PRODUCT_DEACTIVATE", entity: "Product", entityId: id });
}
