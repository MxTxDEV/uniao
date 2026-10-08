import { requirePage } from "@/server/auth";
import { getOpenRegister, listClosedRegisters, listMovements } from "@/server/cash";
import { dec } from "@/lib/money";
import { CashClient } from "./cash-client";

export const metadata = { title: "Caixa" };
export const dynamic = "force-dynamic";

export default async function CaixaPage() {
  const s = await requirePage({ admin: true });
  const [open, history] = await Promise.all([getOpenRegister(s), listClosedRegisters(s, 15)]);
  const movements = open ? await listMovements(s, open.id) : [];
  return (
    <CashClient
      open={
        open && {
          openedAt: open.openedAt.toISOString(),
          openedByName: open.openedByName,
          opening: dec(open.opening),
          sales: dec(open.sales),
          salesCount: open.salesCount,
          entries: dec(open.entries),
          exits: dec(open.exits),
          expected: dec(open.expected),
        }
      }
      movements={movements.map((m) => ({ id: m.id, type: m.type, amount: dec(m.amount), description: m.description, createdAt: m.createdAt.toISOString() }))}
      history={history.map((h) => ({
        id: h.id,
        openedAt: h.openedAt.toISOString(),
        closedAt: h.closedAt!.toISOString(),
        closedByName: h.closedByName,
        expected: dec(h.expectedAmount),
        counted: dec(h.countedAmount),
        difference: dec(h.difference),
        notes: h.notes,
      }))}
    />
  );
}
