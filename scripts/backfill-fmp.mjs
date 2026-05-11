// One-shot: populate fmp_dividend / fmp_yield for cached rows that have a price,
// then re-pick the canonical source using median across all 3 providers.
// Run with: node scripts/backfill-fmp.mjs
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
const FMP_KEY = env.FMP_API_KEY;
if (!SUPABASE_URL || !SECRET || !FMP_KEY) throw new Error("Missing env vars");

const SUSPICIOUS_YIELD = 50;
const FMP_BASE = "https://financialmodelingprep.com/stable";

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

async function fmpDiv(ticker, price) {
  try {
    const res = await fetch(`${FMP_BASE}/dividends?symbol=${ticker}&apikey=${FMP_KEY}`);
    if (!res.ok) return { annual: null, yieldPct: null };
    const j = await res.json();
    const history = Array.isArray(j) ? j : [];
    if (history.length === 0) return { annual: null, yieldPct: null };
    const oneYearAgo = Date.now() - 1000 * 60 * 60 * 24 * 365;
    const recent = history.filter((h) => new Date(h.date).getTime() >= oneYearAgo);
    const total = recent.reduce((s, h) => s + (h.dividend ?? h.adjDividend ?? 0), 0);
    const annual = total > 0 ? total : null;
    const yieldPct = annual && price > 0 ? (annual / price) * 100 : null;
    return { annual, yieldPct };
  } catch {
    return { annual: null, yieldPct: null };
  }
}

function pickMedian(candidates, price) {
  const usable = candidates.filter((c) => {
    if (c.value == null || c.value <= 0) return false;
    if (c.yieldPct != null && c.yieldPct > SUSPICIOUS_YIELD) return false;
    if (price && price > 0 && (c.value / price) * 100 > SUSPICIOUS_YIELD) return false;
    return true;
  });
  if (usable.length === 0) return { value: null, source: null };
  if (usable.length === 1) return { value: usable[0].value, source: usable[0].source };
  const sorted = [...usable].sort((a, b) => a.value - b.value);
  const mid = sorted[Math.floor(sorted.length / 2)];
  return { value: mid.value, source: mid.source };
}

// Only call FMP for likely-payers without an existing FMP value. Skipping non-payers
// (281 of them) saves the 250/day quota; skipping already-populated rows means a re-run
// only fetches what's missing.
const rows = await rest(
  "ticker_cache?select=ticker,price,finnhub_dividend,finnhub_yield,yahoo_dividend,yahoo_yield&price=not.is.null&or=(finnhub_dividend.gt.0,yahoo_dividend.gt.0)&fmp_dividend=is.null",
  { headers: { prefer: "" } },
);
console.log(`Likely dividend payers needing FMP backfill: ${rows.length}`);

const CONCURRENCY = 4;
let cursor = 0;
let withFmp = 0;
let errors = 0;
let reassigned = { finnhub: 0, yahoo: 0, fmp: 0, null: 0 };

async function worker() {
  while (cursor < rows.length) {
    const i = cursor++;
    const r = rows[i];
    try {
      const fmp = await fmpDiv(r.ticker, r.price);
      const { value: chosen, source } = pickMedian(
        [
          { value: r.finnhub_dividend, source: "finnhub", yieldPct: r.finnhub_yield },
          { value: r.yahoo_dividend,   source: "yahoo",   yieldPct: r.yahoo_yield },
          { value: fmp.annual,         source: "fmp",     yieldPct: fmp.yieldPct },
        ],
        r.price,
      );
      const yieldOut =
        source === "finnhub" ? r.finnhub_yield
        : source === "yahoo" ? r.yahoo_yield
        : source === "fmp" ? fmp.yieldPct
        : null;
      if (fmp.annual != null) withFmp++;
      reassigned[source ?? "null"]++;
      await rest(`ticker_cache?ticker=eq.${encodeURIComponent(r.ticker)}`, {
        method: "PATCH",
        body: JSON.stringify({
          fmp_dividend: fmp.annual,
          fmp_yield: fmp.yieldPct,
          annual_dividend: chosen,
          dividend_yield: yieldOut,
          dividend_source: source,
        }),
      });
    } catch {
      errors++;
    }
  }
  if ((cursor % 25 === 0) || cursor >= rows.length) {
    process.stdout.write(`  …${cursor}/${rows.length}\r`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log();
console.log(`\nFMP populated: ${withFmp}, errors: ${errors}`);
console.log("Canonical source distribution after median reassignment:");
for (const [k, v] of Object.entries(reassigned)) console.log(`  ${k}: ${v}`);
