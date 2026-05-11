// One-shot: for every cached row that has a price, fetch dividend data from BOTH
// Finnhub and Yahoo and populate finnhub_dividend / yahoo_dividend / dividend_source.
// Existing annual_dividend / dividend_yield are preserved as the canonical values.
import YahooFinance from "yahoo-finance2";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;
const FINNHUB_KEY = env.FINNHUB_API_KEY;
if (!SUPABASE_URL || !SECRET || !FINNHUB_KEY) throw new Error("Missing env vars");

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SUSPICIOUS_YIELD = 50;

async function rest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SECRET,
      authorization: `Bearer ${SECRET}`,
      "content-type": "application/json",
      prefer: "return=minimal",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function fhMetric(ticker) {
  const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FINNHUB_KEY}`);
  if (!res.ok) return null;
  const j = await res.json();
  const m = j.metric ?? {};
  const annual = m.dividendPerShareAnnual ?? m.dividendPerShareTTM ?? null;
  const yieldPct = m.dividendYieldIndicatedAnnual ?? m.currentDividendYieldTTM ?? null;
  return { annual, yieldPct };
}

async function yhDiv(ticker) {
  try {
    const r = await yf.quoteSummary(ticker, { modules: ["summaryDetail"] });
    const sd = r.summaryDetail;
    const annual = sd?.dividendRate ?? sd?.trailingAnnualDividendRate ?? null;
    const yieldRaw = sd?.dividendYield ?? sd?.trailingAnnualDividendYield ?? null;
    return { annual, yieldPct: yieldRaw != null ? yieldRaw * 100 : null };
  } catch {
    return null;
  }
}

const rows = await rest(
  "ticker_cache?select=ticker,annual_dividend,dividend_yield,price,dividend_source&price=not.is.null",
  { headers: { prefer: "" } },
);
console.log(`Cached rows with prices: ${rows.length}`);

const CONCURRENCY = 3; // Stay well under Finnhub's 60/min on the metric endpoint
let cursor = 0;
let updates = 0;
let errors = 0;

async function worker() {
  while (cursor < rows.length) {
    const i = cursor++;
    const r = rows[i];
    try {
      const [fh, yh] = await Promise.all([fhMetric(r.ticker), yhDiv(r.ticker)]);
      const fhAnnual = fh?.annual ?? null;
      const yhAnnual = yh?.annual ?? null;
      const fhYield = fh?.yieldPct ?? null;
      const yhYield = yh?.yieldPct ?? null;

      // Decide canonical source the same way as the live code.
      let source = null;
      const fhComputedYield = r.price && fhAnnual != null && r.price > 0 ? (fhAnnual / r.price) * 100 : null;
      const fhSuspicious =
        (fhYield != null && fhYield > SUSPICIOUS_YIELD) ||
        (fhComputedYield != null && fhComputedYield > SUSPICIOUS_YIELD);
      if (fhSuspicious && yhAnnual != null) source = "yahoo";
      else if (fhAnnual != null) source = "finnhub";
      else if (yhAnnual != null) source = "yahoo";

      await rest(`ticker_cache?ticker=eq.${encodeURIComponent(r.ticker)}`, {
        method: "PATCH",
        body: JSON.stringify({
          finnhub_dividend: fhAnnual,
          finnhub_yield: fhYield,
          yahoo_dividend: yhAnnual,
          yahoo_yield: yhYield,
          dividend_source: source,
        }),
      });
      updates++;
      if (updates % 25 === 0) console.log(`  ...${updates}/${rows.length}`);
    } catch {
      errors++;
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nDone. Updates: ${updates}, errors: ${errors}`);

// Quick summary
const summary = await rest(
  "ticker_cache?select=dividend_source&annual_dividend=gt.0",
  { headers: { prefer: "" } },
);
const counts = summary.reduce((m, r) => {
  m[r.dividend_source ?? "null"] = (m[r.dividend_source ?? "null"] ?? 0) + 1;
  return m;
}, {});
console.log("\nDividend payers by source:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
