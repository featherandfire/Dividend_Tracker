// Yahoo Finance fallback for tickers where Finnhub returns suspicious data.
// Yahoo correctly normalizes ADR dividends to USD per ADR, where Finnhub sometimes
// returns the local-currency per-ordinary-share value.
import "server-only";
import YahooFinance from "yahoo-finance2";
import { logApiCall } from "@/lib/api-log";

const yahooFinance = new YahooFinance();

export type YahooDividendInfo = {
  ticker: string;
  price: number | null;
  annualDividend: number | null;
  dividendYield: number | null; // percent
  exDividendDate: string | null; // YYYY-MM-DD
};

type SummaryDetail = {
  previousClose?: number;
  trailingAnnualDividendRate?: number;
  dividendRate?: number;
  trailingAnnualDividendYield?: number;
  dividendYield?: number;
  exDividendDate?: Date | string | number;
};
type PriceModule = { regularMarketPrice?: number };
type QuoteSummaryResult = { summaryDetail?: SummaryDetail; price?: PriceModule };

export async function fetchYahooDividend(rawTicker: string): Promise<YahooDividendInfo | null> {
  const ticker = rawTicker.toUpperCase().trim();
  try {
    const summary = (await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail", "price"],
    })) as QuoteSummaryResult;
    logApiCall("yahoo", "quoteSummary", 200);

    const sd = summary.summaryDetail;
    const px = summary.price;

    const price = (px?.regularMarketPrice ?? sd?.previousClose) ?? null;
    // Prefer Yahoo's forward "dividendRate" over "trailingAnnualDividendRate":
    // for foreign ADRs (NPSCY, SFTBY, etc.) the trailing field returns the local-currency
    // per-ordinary-share value; only the forward field is correctly normalized to USD per ADR.
    // For US-listed stocks the two fields are equal.
    const annual = (sd?.dividendRate ?? sd?.trailingAnnualDividendRate) ?? null;
    const yieldRaw = (sd?.dividendYield ?? sd?.trailingAnnualDividendYield) ?? null;
    // Yahoo returns the yield as a decimal (0.025 = 2.5%); normalize to percent.
    const yieldPct = yieldRaw != null ? yieldRaw * 100 : null;
    const exDate = sd?.exDividendDate ? new Date(sd.exDividendDate).toISOString().slice(0, 10) : null;

    return {
      ticker,
      price: typeof price === "number" ? price : null,
      annualDividend: typeof annual === "number" ? annual : null,
      dividendYield: typeof yieldPct === "number" ? yieldPct : null,
      exDividendDate: exDate,
    };
  } catch {
    logApiCall("yahoo", "quoteSummary", 0);
    return null;
  }
}
