import type { Holding, TickerSnapshot } from "@/lib/types";

export type HoldingMetrics = {
  ticker: string;
  shares: number;
  costBasisPerShare: number;
  totalCost: number;
  marketValue: number | null;
  annualIncome: number | null;
  yieldPct: number | null;
  yieldOnCostPct: number | null;
  sector: string | null;
  payFrequency: number;
  drip: boolean;
  suspicious: boolean;
  // Source tracking — exposed so the UI can show provenance + both raw values.
  dividendSource: "finnhub" | "yahoo" | "fmp" | "polygon" | null;
  finnhubDividend: number | null;
  yahooDividend: number | null;
  fmpDividend: number | null;
  polygonDividend: number | null;
  finnhubYield: number | null;
  yahooYield: number | null;
  fmpYield: number | null;
  polygonYield: number | null;
  // Per-source yearly income (= shares × that source's dividend). Useful for side-by-side comparison.
  finnhubIncome: number | null;
  yahooIncome: number | null;
  fmpIncome: number | null;
  polygonIncome: number | null;
  polygonValidatedAt: string | null;
};

// A yield above this is almost certainly bad data (Finnhub sometimes returns local-currency
// dividends for foreign ADRs, or annualizes special one-time distributions).
const SUSPICIOUS_YIELD_THRESHOLD_PCT = 50;

export type PortfolioMetrics = {
  totalCost: number;
  marketValue: number;
  annualIncome: number;
  monthlyIncome: number;
  weightedYield: number | null;
  weightedYoC: number | null;
  unrealizedGain: number;
  unrealizedGainPct: number | null;
};

export function computeHoldingMetrics(h: Holding, snap: TickerSnapshot | null): HoldingMetrics {
  const totalCost = h.shares * h.cost_basis;
  const marketValue = snap?.price != null ? h.shares * snap.price : null;
  const annualIncome = snap?.annual_dividend != null ? h.shares * snap.annual_dividend : null;
  const yieldPct = snap?.price && snap?.annual_dividend != null && snap.price > 0 ? (snap.annual_dividend / snap.price) * 100 : null;
  const yieldOnCostPct = snap?.annual_dividend != null && h.cost_basis > 0 ? (snap.annual_dividend / h.cost_basis) * 100 : null;

  // Flag rows where the yield is impossibly high — almost certainly bad data from Finnhub.
  // Both yieldPct (vs price) and yieldOnCostPct (vs cost) are checked — either one tripping flags it.
  const suspicious =
    (yieldPct != null && yieldPct > SUSPICIOUS_YIELD_THRESHOLD_PCT) ||
    (yieldOnCostPct != null && yieldOnCostPct > SUSPICIOUS_YIELD_THRESHOLD_PCT);

  return {
    ticker: h.ticker,
    shares: h.shares,
    costBasisPerShare: h.cost_basis,
    totalCost,
    marketValue,
    annualIncome,
    yieldPct,
    yieldOnCostPct,
    sector: snap?.sector ?? null,
    payFrequency: snap?.pay_frequency ?? 4,
    drip: h.drip_enabled,
    suspicious,
    dividendSource: (snap?.dividend_source as "finnhub" | "yahoo" | "fmp" | "polygon" | null) ?? null,
    finnhubDividend: snap?.finnhub_dividend ?? null,
    yahooDividend: snap?.yahoo_dividend ?? null,
    fmpDividend: snap?.fmp_dividend ?? null,
    finnhubYield: snap?.finnhub_yield ?? null,
    yahooYield: snap?.yahoo_yield ?? null,
    fmpYield: snap?.fmp_yield ?? null,
    // Treat 0 the same as null at the metrics layer so empty cells render uniformly as "—".
    // Yahoo specifically returns 0 for non-payers where Finnhub returns null; this normalizes them.
    finnhubIncome: snap?.finnhub_dividend && snap.finnhub_dividend > 0 ? h.shares * snap.finnhub_dividend : null,
    yahooIncome:   snap?.yahoo_dividend && snap.yahoo_dividend > 0 ? h.shares * snap.yahoo_dividend : null,
    fmpIncome:     snap?.fmp_dividend && snap.fmp_dividend > 0 ? h.shares * snap.fmp_dividend : null,
    polygonDividend: snap?.polygon_dividend ?? null,
    polygonYield: snap?.polygon_yield ?? null,
    polygonIncome: snap?.polygon_dividend && snap.polygon_dividend > 0 ? h.shares * snap.polygon_dividend : null,
    polygonValidatedAt: snap?.polygon_validated_at ?? null,
  };
}

export function computePortfolioMetrics(rows: HoldingMetrics[]): PortfolioMetrics {
  const totalCost = sum(rows.map((r) => r.totalCost));
  const marketValue = sum(rows.map((r) => r.marketValue ?? 0));
  const annualIncome = sum(rows.map((r) => r.annualIncome ?? 0));
  const weightedYield = marketValue > 0 ? (annualIncome / marketValue) * 100 : null;
  const weightedYoC = totalCost > 0 ? (annualIncome / totalCost) * 100 : null;
  const unrealizedGain = marketValue - totalCost;
  const unrealizedGainPct = totalCost > 0 ? (unrealizedGain / totalCost) * 100 : null;

  return {
    totalCost,
    marketValue,
    annualIncome,
    monthlyIncome: annualIncome / 12,
    weightedYield,
    weightedYoC,
    unrealizedGain,
    unrealizedGainPct,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

// --- Calendar projection ---------------------------------------------------

export type ProjectedPayment = {
  ticker: string;
  amount: number;
  date: string; // YYYY-MM-DD
};

// Project the next 12 months of payments based on the most recent ex-date and frequency.
export function projectNextYearPayments(rows: HoldingMetrics[], snapshots: Record<string, TickerSnapshot | null>): ProjectedPayment[] {
  const out: ProjectedPayment[] = [];
  const today = new Date();
  const horizon = new Date(today);
  horizon.setFullYear(horizon.getFullYear() + 1);

  for (const r of rows) {
    const snap = snapshots[r.ticker];
    if (!snap?.annual_dividend || snap.annual_dividend <= 0) continue;
    const freq = snap.pay_frequency || 4;
    const perPayment = (snap.annual_dividend / freq) * r.shares;
    const monthsBetween = Math.max(1, Math.round(12 / freq));

    // Anchor to most recent payment_date (preferred) or ex_dividend_date; fall back to today.
    const anchorStr = snap.payment_date ?? snap.ex_dividend_date ?? today.toISOString().slice(0, 10);
    const anchor = new Date(anchorStr + "T00:00:00");

    // Step forward in increments of monthsBetween starting from the anchor; emit only future events within horizon.
    const cursor = new Date(anchor);
    while (cursor < today) cursor.setMonth(cursor.getMonth() + monthsBetween);
    while (cursor <= horizon) {
      out.push({ ticker: r.ticker, amount: perPayment, date: cursor.toISOString().slice(0, 10) });
      cursor.setMonth(cursor.getMonth() + monthsBetween);
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function bucketByMonth(payments: ProjectedPayment[]): { month: string; total: number; payments: ProjectedPayment[] }[] {
  const map = new Map<string, ProjectedPayment[]>();
  for (const p of payments) {
    const month = p.date.slice(0, 7); // YYYY-MM
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(p);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, ps]) => ({ month, total: sum(ps.map((p) => p.amount)), payments: ps }));
}

export function bucketBySector(rows: HoldingMetrics[]): { sector: string; value: number; income: number }[] {
  const map = new Map<string, { value: number; income: number }>();
  for (const r of rows) {
    const key = r.sector || "Unclassified";
    const cur = map.get(key) ?? { value: 0, income: 0 };
    cur.value += r.marketValue ?? r.totalCost;
    cur.income += r.annualIncome ?? 0;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([sector, v]) => ({ sector, ...v }))
    .sort((a, b) => b.value - a.value);
}

export function fmtCurrency(n: number | null | undefined, opts?: { compact?: boolean }) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts?.compact && Math.abs(n) >= 1000 ? 0 : 2,
    notation: opts?.compact && Math.abs(n) >= 10_000 ? "compact" : "standard",
  }).format(n);
}

export function fmtPct(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

// Polygon validations age fast — companies usually announce dividend changes around
// quarterly earnings, so anything older than ~3 weeks may have missed an update.
export const POLYGON_STALE_DAYS = 20;

export type PolygonFreshness = "missing" | "fresh" | "stale";

export function polygonFreshness(validatedAt: string | null): PolygonFreshness {
  if (!validatedAt) return "missing";
  const ageMs = Date.now() - new Date(validatedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > POLYGON_STALE_DAYS ? "stale" : "fresh";
}
