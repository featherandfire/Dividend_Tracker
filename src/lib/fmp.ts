// Financial Modeling Prep — third dividend source for cross-checking Finnhub + Yahoo.
// Free tier: 250 req/day, US-listed stocks only. Foreign ADRs typically return empty.
import "server-only";
import { logApiCall } from "@/lib/api-log";

// FMP migrated to `/stable/` endpoints in Aug 2025. Keys issued after that date can only
// hit /stable/ paths — /api/v3/ returns a "Legacy Endpoint" error.
const BASE = "https://financialmodelingprep.com/stable";

function key(): string | null {
  return process.env.FMP_API_KEY || null;
}

export type FmpDividendInfo = {
  ticker: string;
  annualDividend: number | null;
  dividendYield: number | null; // percent
};

type DividendEntry = {
  symbol?: string;
  date: string;
  adjDividend?: number;
  dividend?: number;
  yield?: number;
  frequency?: string;
};

// Sum the last 12 months of payments to get a trailing annual dividend.
function sumLast12Months(history: DividendEntry[]): number | null {
  if (!history?.length) return null;
  const oneYearAgo = Date.now() - 1000 * 60 * 60 * 24 * 365;
  const recent = history.filter((h) => new Date(h.date).getTime() >= oneYearAgo);
  if (recent.length === 0) return null;
  const total = recent.reduce((s, h) => s + (h.dividend ?? h.adjDividend ?? 0), 0);
  return total > 0 ? total : null;
}

export async function fetchFmpDividend(rawTicker: string): Promise<FmpDividendInfo | null> {
  const k = key();
  if (!k) return null;
  const ticker = rawTicker.toUpperCase().trim();

  try {
    // /stable/ endpoints take `symbol=` as a query param (different from /api/v3).
    const [divRes, quoteRes] = await Promise.all([
      fetch(`${BASE}/dividends?symbol=${ticker}&apikey=${k}`, { cache: "no-store" }),
      fetch(`${BASE}/quote?symbol=${ticker}&apikey=${k}`, { cache: "no-store" }),
    ]);
    if (!divRes.ok) {
      logApiCall("fmp", "dividends", divRes.status);
      logApiCall("fmp", "quote", quoteRes.status);
      return null;
    }
    const divs = await divRes.json();
    // FMP returns 200 with { "Error Message": "Limit Reach..." } when out of quota.
    // We log it as a sentinel 429 so the dashboard's API Usage card can flag "exhausted".
    if (!Array.isArray(divs)) {
      const isRateLimit =
        divs && typeof divs === "object" && "Error Message" in divs &&
        typeof divs["Error Message"] === "string" &&
        /limit reach/i.test(divs["Error Message"]);
      logApiCall("fmp", "dividends", isRateLimit ? 429 : divRes.status);
      logApiCall("fmp", "quote", quoteRes.status);
      return null;
    }
    logApiCall("fmp", "dividends", divRes.status);
    logApiCall("fmp", "quote", quoteRes.status);
    const annual = sumLast12Months(divs as DividendEntry[]);

    let price: number | null = null;
    if (quoteRes.ok) {
      const q = await quoteRes.json();
      if (Array.isArray(q) && typeof q[0]?.price === "number") price = q[0].price;
    }
    const yieldPct = annual != null && price && price > 0 ? (annual / price) * 100 : null;

    return { ticker, annualDividend: annual, dividendYield: yieldPct };
  } catch {
    return null;
  }
}
