import { SummaryCard, type Item, type Tone } from "./summary-cards";
import { fmtCurrency, type HoldingMetrics } from "@/lib/calculations";
import { PiggyBank, ShieldCheck } from "lucide-react";

type Props = { metrics: HoldingMetrics[] };

// Per-source annual income totals across the entire portfolio. Useful for spotting
// which providers report meaningfully different totals — if Finnhub says $5,400 but
// Yahoo says $6,100, something is being missed or misattributed somewhere.
export function IncomeBySource({ metrics }: Props) {
  const totals = {
    finnhub: aggregate(metrics, (m) => m.finnhubIncome),
    yahoo:   aggregate(metrics, (m) => m.yahooIncome),
    fmp:     aggregate(metrics, (m) => m.fmpIncome),
    polygon: aggregate(metrics, (m) => m.polygonIncome),
  };

  const items: Item[] = [
    {
      label: "Finnhub annual",
      value: fmtCurrency(totals.finnhub.sum),
      sub: `${totals.finnhub.count} of ${metrics.length} tickers`,
      icon: PiggyBank,
      tone: "orange" as Tone,
    },
    {
      label: "Yahoo annual",
      value: fmtCurrency(totals.yahoo.sum),
      sub: `${totals.yahoo.count} of ${metrics.length} tickers`,
      icon: PiggyBank,
      tone: "gold" as Tone,
    },
    {
      label: "FMP annual",
      value: fmtCurrency(totals.fmp.sum),
      sub: `${totals.fmp.count} of ${metrics.length} tickers`,
      icon: PiggyBank,
      tone: "turquoise" as Tone,
    },
    {
      label: "Polygon annual",
      value: fmtCurrency(totals.polygon.sum),
      sub: `${totals.polygon.count} of ${metrics.length} validated`,
      icon: ShieldCheck,
      tone: "blue" as Tone,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {items.map((it) => (
        <SummaryCard key={it.label} item={it} />
      ))}
    </div>
  );
}

function aggregate(rows: HoldingMetrics[], pick: (m: HoldingMetrics) => number | null) {
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v != null && v > 0) {
      sum += v;
      count++;
    }
  }
  return { sum, count };
}
