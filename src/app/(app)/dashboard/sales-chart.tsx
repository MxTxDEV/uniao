"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/money";

interface Point { day: string; total: number; count: number }

const short = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".", ",")}k` : String(n));

export function SalesChart({ data }: { data: Point[] }) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label="Gráfico de faturamento por dia">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e8e6e0" />
          <XAxis dataKey="day" tickFormatter={short} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6c72" }} minTickGap={16} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6c72" }} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(12,12,13,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Point;
              return (
                <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-lg">
                  <p className="font-semibold">{short(p.day)}</p>
                  <p className="tabular font-bold">{formatBRL(p.total)}</p>
                  <p className="text-xs text-muted-foreground">{p.count} venda{p.count === 1 ? "" : "s"}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="total" fill="#0c0c0d" radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
