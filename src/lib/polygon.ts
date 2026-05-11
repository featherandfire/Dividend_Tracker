// Polygon.io — authoritative dividend lookups for on-demand validation.
// Free tier: 5 req/min, unlimited daily. Returns SEC-filing-sourced data.
import "server-only";
import { logApiCall } from "@/lib/api-log";

const BASE = "https://api.polygon.io";

function key() {
  return process.env.POLYGON_API_KEY || null;
}

export type PolygonDividend = {
  cashAmount: number;
  exDividendDate: string;     // YYYY-MM-DD
  payDate: string | null;
  recordDate: string | null;
  declarationDate: string | null;
  frequency: number;          // 0=one-time, 1=annual, 2=semi-annual, 4=quarterly, 12=monthly
  dividendType: string;       // CD = cash dividend, SC = stock special, LT = long-term, etc.
};

export type PolygonValidation = {
  ticker: string;
  payments: PolygonDividend[];       // newest first, last 12 months
  annualDividend: number | null;     // sum of last 12 months × adjustments
  forwardAnnual: number | null;      // most recent payment × frequency
  frequency: number | null;
  latestExDate: string | null;
  latestPayDate: string | null;
  rateLimited: boolean;
};

type ApiResp = {
  status?: string;
  results?: Array<{
    cash_amount: number;
    ex_dividend_date: string;
    pay_date?: string;
    record_date?: string;
    declaration_date?: string;
    frequency: number;
    dividend_type: string;
  }>;
  error?: string;
};

export async function fetchPolygonDividends(rawTicker: string): Promise<PolygonValidation | null> {
  const k = key();
  if (!k) return null;
  const ticker = rawTicker.toUpperCase().trim();

  // Last 18 months of declarations — covers annual payers and gives buffer for frequency inference.
  const eighteenMonthsAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 548).toISOString().slice(0, 10);
  const url =
    `${BASE}/v3/reference/dividends` +
    `?ticker=${ticker}` +
    `&ex_dividend_date.gte=${eighteenMonthsAgo}` +
    `&order=desc&limit=50&apiKey=${k}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    logApiCall("polygon", "dividends", res.status);
    if (res.status === 429) {
      return { ticker, payments: [], annualDividend: null, forwardAnnual: null, frequency: null, latestExDate: null, latestPayDate: null, rateLimited: true };
    }
    if (!res.ok) return null;
    const json = (await res.json()) as ApiResp;
    const raw = json.results ?? [];

    // Keep cash dividends only — exclude special distributions / stock splits.
    const cash = raw.filter((d) => d.dividend_type === "CD" || d.dividend_type === "" || d.dividend_type == null);

    const payments: PolygonDividend[] = cash.map((d) => ({
      cashAmount: d.cash_amount,
      exDividendDate: d.ex_dividend_date,
      payDate: d.pay_date ?? null,
      recordDate: d.record_date ?? null,
      declarationDate: d.declaration_date ?? null,
      frequency: d.frequency,
      dividendType: d.dividend_type,
    }));

    // Trailing 12-month total
    const oneYearAgo = Date.now() - 1000 * 60 * 60 * 24 * 365;
    const ttm = payments.filter((p) => new Date(p.exDividendDate).getTime() >= oneYearAgo);
    const annualDividend = ttm.length ? ttm.reduce((s, p) => s + p.cashAmount, 0) : null;

    // Forward annual (most recent × declared frequency)
    const latest = payments[0];
    const frequency = latest?.frequency || null;
    const forwardAnnual = latest && frequency && frequency > 0 ? latest.cashAmount * frequency : null;

    return {
      ticker,
      payments,
      annualDividend,
      forwardAnnual,
      frequency,
      latestExDate: latest?.exDividendDate ?? null,
      latestPayDate: latest?.payDate ?? null,
      rateLimited: false,
    };
  } catch {
    return null;
  }
}
