import { NextResponse, type NextRequest } from "next/server";
import { toErrorMessage, AppError } from "@/lib/errors";
import { requireCtx } from "@/server/auth";
import { salesForExport, topProducts } from "@/server/stats";
import { resolvePeriod, formatDateTime, ymdBR, addDays } from "@/lib/dates";
import { PAYMENT_LABEL, STATUS_LABEL, csvCell } from "@/lib/utils";
import { Decimal } from "@/lib/money";

export const dynamic = "force-dynamic";

// Formato brasileiro (Excel pt-BR): separador ";" e decimal com vírgula.
const num = (v: Decimal | string) => new Decimal(v).toFixed(2).replace(".", ",");

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (ctx.role !== "ADMIN") throw new AppError("FORBIDDEN", "Você não tem permissão para esta ação.");
    const sp = req.nextUrl.searchParams;
    const period = resolvePeriod(sp.get("periodo") ?? undefined, { from: sp.get("de") ?? undefined, to: sp.get("ate") ?? undefined, fallback: "mes" });
    const tipo = sp.get("tipo") === "produtos" ? "produtos" : "vendas";

    // Texto livre passa por csvCell (aspas + proteção contra injeção de fórmula); números/datas são gerados pelo sistema.
    const rows: string[][] = [];
    if (tipo === "vendas") {
      rows.push(["Venda", "Data", "Vendedor", "Pagamento", "Status", "Subtotal", "Desconto", "Total", "Motivo do cancelamento"]);
      for (const s of await salesForExport(ctx, period)) {
        rows.push([
          String(s.number).padStart(6, "0"),
          formatDateTime(s.createdAt),
          csvCell(s.seller.name),
          PAYMENT_LABEL[s.paymentMethod],
          STATUS_LABEL[s.status],
          num(s.subtotal),
          num(s.discount),
          num(s.total),
          csvCell(s.cancelReason ?? ""),
        ]);
      }
    } else {
      rows.push(["Produto", "Quantidade", "Total"]);
      for (const p of await topProducts(ctx.tenantId, period.start, period.end, 1000)) rows.push([csvCell(p.name), String(p.qty), num(p.total)]);
    }

    const body = "﻿" + rows.map((r) => r.join(";")).join("\r\n") + "\r\n";
    const name = `${tipo}_${ymdBR(period.start)}_${ymdBR(addDays(period.end, -1))}.csv`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const status = e instanceof AppError ? (e.code === "UNAUTHENTICATED" ? 401 : e.code === "FORBIDDEN" ? 403 : 400) : 500;
    return NextResponse.json({ error: toErrorMessage(e) }, { status });
  }
}
