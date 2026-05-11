"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { fmtCurrency, type ProjectedPayment } from "@/lib/calculations";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

type Bucket = { month: string; total: number; payments: ProjectedPayment[] };

export function PaymentCalendar({ buckets }: { buckets: Bucket[] }) {
  const chartData = buckets.map((b) => ({
    month: monthLabel(b.month),
    total: Math.round(b.total * 100) / 100,
  }));

  // Highlight the highest-income month in gold; others in coral.
  const peak = chartData.reduce((m, d, i) => (d.total > chartData[m].total ? i : m), 0);

  if (buckets.length === 0) {
    return (
      <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Payment calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No projected payments yet. Add dividend-paying holdings to populate the calendar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payment calendar — next 12 months</CardTitle>
          <p className="text-xs text-muted-foreground">Peak month highlighted in gold.</p>
        </CardHeader>
        <CardContent>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.72 0 0)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.72 0 0)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                  contentStyle={{
                    background: "oklch(0.235 0.012 270)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "oklch(0.98 0 0)",
                  }}
                  formatter={(v) => fmtCurrency(typeof v === "number" ? v : Number(v))}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === peak ? "oklch(0.82 0.17 85)" : "oklch(0.68 0.22 22)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Upcoming payments</CardTitle>
          <p className="text-xs text-muted-foreground">Next 6 months by month.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {buckets.slice(0, 6).map((b) => (
              <div key={b.month} className="rounded-xl bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{monthLabel(b.month)}</p>
                  <p className="text-sm font-semibold tabular-nums">{fmtCurrency(b.total)}</p>
                </div>
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="mt-2 inline-flex w-full items-center justify-between rounded-md bg-background/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                      >
                        <span>{b.payments.length} payment{b.payments.length === 1 ? "" : "s"}</span>
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-64 border-border/40 p-2">
                    <p className="mb-2 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {monthLabel(b.month)} payments
                    </p>
                    <div className="max-h-64 space-y-0.5 overflow-y-auto">
                      {b.payments.map((p, i) => (
                        <div
                          key={`${p.ticker}-${i}`}
                          className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-muted/40"
                        >
                          <span className="font-semibold">{p.ticker}</span>
                          <span className="tabular-nums">{fmtCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
