"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCurrency, fmtPct } from "@/lib/calculations";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

type Row = { sector: string; value: number; income: number };

// Coral + gold lead, then complementary cool tones — keeps the mockup vibe.
const PALETTE = [
  "oklch(0.68 0.22 22)",   // coral
  "oklch(0.82 0.17 85)",   // gold
  "oklch(0.66 0.15 230)",  // blue
  "oklch(0.68 0.16 160)",  // teal-green
  "oklch(0.65 0.20 305)",  // magenta
  "oklch(0.75 0.15 50)",   // amber
  "oklch(0.6 0.15 195)",   // cyan
  "oklch(0.62 0.18 130)",  // green
  "oklch(0.6 0.18 340)",   // pink
  "oklch(0.55 0.05 270)",  // slate
];

export function SectorBreakdown({ rows }: { rows: Row[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0);

  if (rows.length === 0 || total === 0) {
    return (
      <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Sector breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data yet.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = rows.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));
  const topPct = ((chartData[0].value / total) * 100).toFixed(0);

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Sector breakdown</CardTitle>
        <p className="text-xs text-muted-foreground">
          Top: <span className="text-foreground">{chartData[0].sector}</span> ({topPct}%)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="sector" outerRadius={92} innerRadius={56} paddingAngle={2} stroke="none">
                {chartData.map((d) => (
                  <Cell key={d.sector} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "oklch(0.235 0.012 270)",
                  border: "1px solid oklch(1 0 0 / 8%)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "oklch(0.98 0 0)",
                }}
                formatter={(v) => fmtCurrency(typeof v === "number" ? v : Number(v))}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold tabular-nums">{fmtCurrency(total, { compact: true })}</p>
          </div>
        </div>

        <div className="space-y-1.5 scrollbar-thin max-h-56 overflow-y-auto pr-1">
          {chartData.map((r) => (
            <div key={r.sector} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <p className="truncate text-sm">{r.sector}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums">{fmtCurrency(r.value, { compact: true })}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {fmtPct((r.value / total) * 100, 1)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
