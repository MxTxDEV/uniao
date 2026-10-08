import type { Role } from "@prisma/client";
import { AppError } from "@/lib/errors";

/**
 * Contexto autenticado. O tenantId SEMPRE vem daqui (sessão), nunca de input do cliente.
 * Todos os serviços recebem um Ctx e filtram por ctx.tenantId.
 */
export interface Ctx {
  tenantId: string;
  userId: string;
  role: Role;
  name: string;
}

export function assertAdmin(ctx: Ctx): void {
  if (ctx.role !== "ADMIN") throw new AppError("FORBIDDEN", "Você não tem permissão para esta ação.");
}

export const isAdmin = (ctx: Ctx) => ctx.role === "ADMIN";
