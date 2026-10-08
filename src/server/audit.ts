import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type Client = PrismaClient | Prisma.TransactionClient;

export async function audit(
  entry: {
    tenantId: string | null;
    userId: string | null;
    action: string;
    entity?: string;
    entityId?: string;
    meta?: Prisma.InputJsonValue;
  },
  client: Client = db,
): Promise<void> {
  try {
    await client.auditLog.create({ data: entry });
  } catch (e) {
    // Falha de log não pode derrubar a operação principal fora de transação.
    console.error("audit failed", e);
    if (client !== db) throw e;
  }
}
