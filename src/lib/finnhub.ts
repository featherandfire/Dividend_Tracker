// Server-only Finnhub helpers. Never import this from client components.
import "server-only";
import type { TickerSnapshot } from "@/lib/types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchYahooDividend } from "@/lib/yahoo";
import { fetchFmpDividend } from "@/lib/fmp";
import { logApiCall } from "@/lib/api-log";

const SUSPICIOUS_YIELD_THRESHOLD_PCT = 50;

// Pick the median of up to 3 dividend candidates. Drops nulls and obviously-bad values
// (yield > SUSPICIOUS threshold against the provided price). Returns { value, source }.
function pickMedianDividend(
  candidates: Array<{ value: number | null; source: "finnhub" | "yahoo" | "fmp"; yieldPct: number | null }>,
  price: number | null,
): { value: number | null; source: "finnhub" | "yahoo" | "fmp" | null } {
  const usable = candidates.filter((c) => {
    if (c.value == null || c.value <= 0) return false;
    // Filter by reported yield first if available
    if (c.yieldPct != null && c.yieldPct > SUSPICIOUS_YIELD_THRESHOLD_PCT) return false;
    // Else compute yield against the canonical price
    if (price && price > 0) {
      const computed = (c.value / price) * 100;
      if (computed > SUSPICIOUS_YIELD_THRESHOLD_PCT) return false;
    }
    return true;
  });
  if (usable.length === 0) return { value: null, source: null };
  if (usable.length === 1) return { value: usable[0].value!, source: usable[0].source };
  // Sort by value to find the median (and the source attached to it).
  const sorted = [...usable].sort((a, b) => a.value! - b.value!);
  const mid = sorted[Math.floor(sorted.length / 2)];
  return { value: mid.value!, source: mid.source };
}

const BASE = "https://finnhub.io/api/v1";

// Two TTLs: long for rows with real data; short for "tombstone" rows where we tried
// but got nothing back (rate-limited or unsupported ticker). Short TTL keeps us from
// hammering quota on the same failing tickers, while still allowing eventual retries.
const CACHE_TTL_OK_MS = 1000 * 60 * 60 * 24;     // 24h for successful rows
const CACHE_TTL_FAIL_MS = 1000 * 60 * 60;        // 1h for tombstones

function key() {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error("FINNHUB_API_KEY not set");
  return k;
}

async function fhFetch<T>(path: string): Promise<T> {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${key()}`;
  const res = await fetch(url, { cache: "no-store" });
  // Log every call (including failures) — the usage card shows total calls regardless of status.
  const endpoint = path.split("?")[0];
  logApiCall("finnhub", endpoint, res.status);
  if (!res.ok) throw new Error(`Finnhub ${path} ${res.status}`);
  return (await res.json()) as T;
}

type Quote = { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number };
type Profile = { name?: string; finnhubIndustry?: string; ticker?: string };
type BasicFinancials = { metric?: Record<string, number | null> };
type DividendEntry = { symbol: string; date: string; amount: number; payDate?: string; recordDate?: string; declarationDate?: string };

function inferFrequency(payDates: string[]): number {
  if (payDates.length < 2) return 4;
  const oneYearAgo = Date.now() - 1000 * 60 * 60 * 24 * 400;
  const recent = payDates.filter((d) => new Date(d).getTime() > oneYearAgo);
  if (recent.length >= 11) return 12; // monthly
  if (recent.length >= 3) return 4;   // quarterly
  if (recent.length === 2) return 2;  // semi-annual
  return 1;                            // annual or unknown
}

function isUsefulSnapshot(s: TickerSnapshot): boolean {
  return (
    s.price != null ||
    s.annual_dividend != null ||
    s.sector != null ||
    s.company_name != null
  );
}

function effectiveTtl(s: TickerSnapshot): number {
  return isUsefulSnapshot(s) ? CACHE_TTL_OK_MS : CACHE_TTL_FAIL_MS;
}

function isFresh(s: TickerSnapshot): boolean {
  return Date.now() - new Date(s.fetched_at).getTime() < effectiveTtl(s);
}

// Cold path for one ticker. Performs a "full" fetch if no cache exists, or a
// "light" refresh (just price) if we already have a non-empty cached row but it's stale.
export async function fetchSnapshot(rawTicker: string): Promise<TickerSnapshot> {
  const ticker = rawTicker.toUpperCase().trim();
  const supabase = createServiceRoleClient();

  const { data: cached } = await supabase
    .from("ticker_cache")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();

  if (cached && isFresh(cached)) return cached;

  // Light refresh path: existing row has good fundamentals (sector/dividend) — they
  // change rarely, so we only re-fetch the price (1 Finnhub call instead of 4).
  if (cached && isUsefulSnapshot(cached)) {
    try {
      const quote = await fhFetch<Quote>(`/quote?symbol=${ticker}`);
      const price = quote?.c && quote.c > 0 ? quote.c : cached.price;
      const updated: TickerSnapshot = { ...cached, price, fetched_at: new Date().toISOString() };
      await supabase.from("ticker_cache").upsert(updated, { onConflict: "ticker" });
      return updated;
    } catch {
      // Fall through to full refetch on price failure.
    }
  }

  return fullFetch(ticker, cached ?? null);
}

async function fullFetch(ticker: string, cached: TickerSnapshot | null): Promise<TickerSnapshot> {
  const supabase = createServiceRoleClient();
  const today = new Date();
  const fromDate = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 400).toISOString().slice(0, 10);
  const toDate = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 60).toISOString().slice(0, 10);

  const [quote, profile, fin, divs] = await Promise.all([
    fhFetch<Quote>(`/quote?symbol=${ticker}`).catch(() => null),
    fhFetch<Profile>(`/stock/profile2?symbol=${ticker}`).catch(() => null),
    fhFetch<BasicFinancials>(`/stock/metric?symbol=${ticker}&metric=all`).catch(() => null),
    fhFetch<DividendEntry[]>(`/stock/dividend?symbol=${ticker}&from=${fromDate}&to=${toDate}`).catch(() => null),
  ]);

  const price = quote?.c && quote.c > 0 ? quote.c : null;
  const annualDividend =
    (fin?.metric?.dividendPerShareAnnual as number | null | undefined) ??
    (fin?.metric?.dividendPerShareTTM as number | null | undefined) ??
    null;
  const yieldPct =
    (fin?.metric?.dividendYieldIndicatedAnnual as number | null | undefined) ??
    (fin?.metric?.currentDividendYieldTTM as number | null | undefined) ??
    null;

  const sortedDivs = (divs ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const mostRecent = sortedDivs[0];
  const payDates = sortedDivs.map((d) => d.payDate ?? d.date).filter(Boolean) as string[];
  const frequency = inferFrequency(payDates);

  // --- Finnhub-side dividend (raw, unfiltered) -----------------------------
  const finnhubAnnualRaw: number | null =
    annualDividend ??
    (sortedDivs.length >= frequency
      ? sortedDivs.slice(0, frequency).reduce((s, d) => s + (d.amount || 0), 0)
      : null);
  const finnhubYieldRaw: number | null = yieldPct;
  let finalPrice = price;
  let finalExDate = mostRecent?.date ?? null;
  const finalCompany = profile?.name ?? cached?.company_name ?? null;
  const finalSector = profile?.finnhubIndustry ?? cached?.sector ?? null;

  // --- Always query Yahoo on a full fetch (it has no daily quota limit). FMP is gated
  // because its free tier is only 250 calls/day — we only burn one if Finnhub or Yahoo
  // already reports a non-zero dividend (i.e. this looks like an actual payer worth
  // cross-checking). Pure tiebreaker mode.
  const yh = await fetchYahooDividend(ticker);
  const yahooAnnualRaw = yh?.annualDividend ?? null;
  const yahooYieldRaw = yh?.dividendYield ?? null;
  if (yh?.price != null && finalPrice == null) finalPrice = yh.price;
  if (yh?.exDividendDate && !finalExDate) finalExDate = yh.exDividendDate;

  const likelyPayer =
    (finnhubAnnualRaw != null && finnhubAnnualRaw > 0) ||
    (yahooAnnualRaw != null && yahooAnnualRaw > 0);
  const fmp = likelyPayer ? await fetchFmpDividend(ticker) : null;
  const fmpAnnualRaw = fmp?.annualDividend ?? null;
  const fmpYieldRaw = fmp?.dividendYield ?? null;

  // --- Median tiebreak across the 3 sources --------------------------------
  // Drops null/zero values and obviously-suspicious ones (yield > 50%) before picking
  // the middle. When only one source is usable, that source wins. When two are usable,
  // sort + pick the higher index (effectively the larger of the two — but both should
  // already be sanity-checked). When three are usable, pick the true median.
  const { value: chosenAnnual, source } = pickMedianDividend(
    [
      { value: finnhubAnnualRaw, source: "finnhub", yieldPct: finnhubYieldRaw },
      { value: yahooAnnualRaw,   source: "yahoo",   yieldPct: yahooYieldRaw },
      { value: fmpAnnualRaw,     source: "fmp",     yieldPct: fmpYieldRaw },
    ],
    finalPrice,
  );
  const chosenYield =
    source === "finnhub" ? finnhubYieldRaw
    : source === "yahoo" ? yahooYieldRaw
    : source === "fmp" ? fmpYieldRaw
    : null;

  const snapshot: TickerSnapshot = {
    ticker,
    price: finalPrice,
    annual_dividend: chosenAnnual,
    dividend_yield: chosenYield,
    ex_dividend_date: finalExDate,
    payment_date: mostRecent?.payDate ?? cached?.payment_date ?? null,
    pay_frequency: payDates.length > 0 ? frequency : (cached?.pay_frequency ?? 4),
    sector: finalSector,
    company_name: finalCompany,
    fetched_at: new Date().toISOString(),
    dividend_source: source,
    finnhub_dividend: finnhubAnnualRaw,
    yahoo_dividend: yahooAnnualRaw,
    fmp_dividend: fmpAnnualRaw,
    finnhub_yield: finnhubYieldRaw,
    yahoo_yield: yahooYieldRaw,
    fmp_yield: fmpYieldRaw,
    // Polygon validation fields are managed by /api/validate — carry over cached values
    // (or null) through a normal refresh so we don't clobber an earlier validation.
    polygon_dividend: cached?.polygon_dividend ?? null,
    polygon_yield: cached?.polygon_yield ?? null,
    polygon_ex_date: cached?.polygon_ex_date ?? null,
    polygon_pay_date: cached?.polygon_pay_date ?? null,
    polygon_validated_at: cached?.polygon_validated_at ?? null,
  };

  // Always upsert — even tombstones. The TTL split (1h fail vs 24h ok) handles
  // when to retry without permanently silencing missing tickers.
  await supabase.from("ticker_cache").upsert(snapshot, { onConflict: "ticker" });
  return snapshot;
}

// Free-tier Finnhub allows 60 req/min. Each cold fetch makes up to 4 sub-requests,
// so running more than ~3 in parallel risks 429s. Light refreshes (1 call) tolerate
// higher concurrency, but we use the same pool for simplicity.
const SNAPSHOT_CONCURRENCY = 3;

// Read-only fast path: returns whatever is in the cache. Never calls Finnhub.
// Use this on the dashboard so render stays instant regardless of portfolio size.
export async function fetchSnapshotsCached(tickers: string[]): Promise<Record<string, TickerSnapshot>> {
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase().trim()))).filter(Boolean);
  if (unique.length === 0) return {};
  const supabase = createServiceRoleClient();
  const out: Record<string, TickerSnapshot> = {};
  // Supabase has a hard limit of ~1000 elements in an `in` filter; chunk to be safe.
  const chunkSize = 500;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data } = await supabase.from("ticker_cache").select("*").in("ticker", chunk);
    for (const c of data ?? []) {
      // Skip tombstones — caller treats missing tickers as snapshot-less.
      if (isUsefulSnapshot(c)) out[c.ticker] = c;
    }
  }
  return out;
}

// Cold path: throttled bulk refresh. Used by /api/tickers — slow for large portfolios.
export async function fetchSnapshots(tickers: string[]): Promise<Record<string, TickerSnapshot>> {
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase().trim()))).filter(Boolean);
  if (unique.length === 0) return {};

  // Read raw cache (including tombstones) to decide which tickers are stale.
  const supabase = createServiceRoleClient();
  const cached = new Map<string, TickerSnapshot>();
  const chunkSize = 500;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data } = await supabase.from("ticker_cache").select("*").in("ticker", chunk);
    for (const c of data ?? []) cached.set(c.ticker, c);
  }

  const out: Record<string, TickerSnapshot> = {};
  for (const [t, c] of cached) if (isUsefulSnapshot(c)) out[t] = c;

  const stale = unique.filter((t) => {
    const c = cached.get(t);
    return !c || !isFresh(c);
  });

  let cursor = 0;
  async function worker() {
    while (cursor < stale.length) {
      const i = cursor++;
      const t = stale[i];
      try {
        const fresh = await fetchSnapshot(t);
        if (isUsefulSnapshot(fresh)) out[t] = fresh;
      } catch {
        // fetchSnapshot now writes a tombstone instead of throwing in most cases,
        // but defensive catch covers any unexpected errors.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SNAPSHOT_CONCURRENCY, stale.length) }, worker));
  return out;
}
