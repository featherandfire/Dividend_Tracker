import { Card, CardContent } from "@/components/ui/card";
import { fmtCurrency, fmtPct, type PortfolioMetrics } from "@/lib/calculations";
import { DollarSign, TrendingUp, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Tone = "coral" | "gold" | "blue" | "green" | "orange" | "turquoise";

export type Item = {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone: Tone;
  valueTone?: "pos" | "neg" | "neutral";
};

export function SummaryCards({ m }: { m: PortfolioMetrics }) {
  const items: Item[] = [
    {
      label: "Market value",
      value: fmtCurrency(m.marketValue),
      sub: `Cost basis: ${fmtCurrency(m.totalCost)}`,
      icon: DollarSign,
      tone: "coral",
    },
    {
      label: "Yield",
      value: fmtPct(m.weightedYield),
      sub: `On cost: ${fmtPct(m.weightedYoC)}`,
      icon: TrendingUp,
      tone: "blue",
    },
    {
      label: "Unrealized P/L",
      value: fmtCurrency(m.unrealizedGain),
      sub: fmtPct(m.unrealizedGainPct),
      icon: Activity,
      tone: "green",
      valueTone: m.unrealizedGain >= 0 ? "pos" : "neg",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {items.map((it) => (
        <SummaryCard key={it.label} item={it} />
      ))}
    </div>
  );
}

export const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  coral:     { bg: "bg-[oklch(0.68_0.22_22)]/15",  fg: "text-[oklch(0.78_0.2_22)]" },
  orange:    { bg: "bg-[oklch(0.75_0.16_55)]/15",  fg: "text-[oklch(0.82_0.16_55)]" },
  gold:      { bg: "bg-[oklch(0.82_0.17_85)]/15",  fg: "text-[oklch(0.88_0.17_85)]" },
  turquoise: { bg: "bg-[oklch(0.78_0.13_190)]/15", fg: "text-[oklch(0.82_0.13_190)]" },
  blue:      { bg: "bg-[oklch(0.66_0.15_230)]/15", fg: "text-[oklch(0.78_0.15_230)]" },
  green:     { bg: "bg-[oklch(0.68_0.16_160)]/15", fg: "text-[oklch(0.78_0.16_160)]" },
};

// Foreground color CSS values for raw use in components that need the color string
// outside of Tailwind's `text-...` utility (e.g. inline style on column header dots).
export const TONE_FG: Record<Tone, string> = {
  coral:     "oklch(0.78 0.2 22)",
  orange:    "oklch(0.82 0.16 55)",
  gold:      "oklch(0.88 0.17 85)",
  turquoise: "oklch(0.82 0.13 190)",
  blue:      "oklch(0.78 0.15 230)",
  green:     "oklch(0.78 0.16 160)",
};

export function SummaryCard({ item }: { item: Item }) {
  const Icon = item.icon;
  const t = toneStyles[item.tone];
  const valueClass =
    item.valueTone === "pos"
      ? "text-[oklch(0.78_0.16_160)]"
      : item.valueTone === "neg"
        ? "text-[oklch(0.78_0.2_22)]"
        : "text-foreground";

  return (
    <Card className="border-0 bg-card shadow-none">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.bg}`}>
            <Icon className={`h-4 w-4 ${t.fg}`} />
          </div>
        </div>
        <div>
          <p className={`text-3xl font-heading font-bold tabular-nums leading-none tracking-tight ${valueClass}`}>{item.value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{item.sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}
