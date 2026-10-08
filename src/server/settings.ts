import { z } from "zod";
import { db } from "@/lib/db";
import { optionalText, optionalUrl, parse, text } from "@/lib/validate";
import { audit } from "./audit";
import { assertAdmin, type Ctx } from "./context";

export async function getTenant(ctx: Ctx) {
  return db.tenant.findUniqueOrThrow({
    where: { id: ctx.tenantId },
    select: { id: true, name: true, logoUrl: true, address: true, phone: true, instagram: true, allowDiscount: true, allowCustomItems: true, allowCancel: true },
  });
}

const schema = z.object({
  name: text(100, "Nome da loja"),
  logoUrl: optionalUrl("Logo"),
  address: optionalText(200, "Endereço"),
  phone: optionalText(30, "Telefone"),
  instagram: optionalText(60, "Instagram"),
  allowDiscount: z.boolean(),
  allowCustomItems: z.boolean(),
  allowCancel: z.boolean(),
});

export async function updateSettings(ctx: Ctx, input: unknown): Promise<void> {
  assertAdmin(ctx);
  const d = parse(schema, input);
  await db.tenant.update({ where: { id: ctx.tenantId }, data: d });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "SETTINGS_UPDATE", entity: "Tenant", entityId: ctx.tenantId, meta: { allowDiscount: d.allowDiscount, allowCustomItems: d.allowCustomItems, allowCancel: d.allowCancel } });
}
