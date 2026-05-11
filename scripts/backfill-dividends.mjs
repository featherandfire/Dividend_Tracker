// One-shot: for cached tickers that have a price but no dividend, query Yahoo
// and update the cache if Yahoo has a USD-normalized dividend. Run with:
//   node scripts/backfill-dividends.mjs
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
if (!SUPABASE_URL || !SECRET) throw new Error("Missing Supabase env vars in .env.local");

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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

const candidates = await rest(
  "ticker_cache?select=ticker&annual_dividend=is.null&price=not.is.null",
  { headers: { prefer: "" } },
);
console.log(`Candidates (price set, dividend null): ${candidates.length}`);

const CONCURRENCY = 4;
let cursor = 0;
let updated = 0;
let stillNull = 0;
let errored = 0;

async function worker() {
  while (cursor < candidates.length) {
    const i = cursor++;
    const t = candidates[i].ticker;
    try {
      const r = await yf.quoteSummary(t, { modules: ["summaryDetail", "price"] });
      const sd = r.summaryDetail;
      // Use forward dividendRate (correct for ADRs); fall back to trailing.
      const annual = sd?.dividendRate ?? sd?.trailingAnnualDividendRate ?? null;
      const yieldRaw = sd?.dividendYield ?? sd?.trailingAnnualDividendYield ?? null;
      const yieldPct = yieldRaw != null ? yieldRaw * 100 : null;
      const exDate = sd?.exDividendDate ? new Date(sd.exDividendDate).toISOString().slice(0, 10) : null;
      if (annual && annual > 0) {
        await rest(`ticker_cache?ticker=eq.${encodeURIComponent(t)}`, {
          method: "PATCH",
          body: JSON.stringify({
            annual_dividend: annual,
            dividend_yield: yieldPct,
            ex_dividend_date: exDate,
          }),
        });
        updated++;
        console.log(`  ${t.padEnd(8)} +$${annual.toFixed(4)}/sh  yield=${(yieldPct ?? 0).toFixed(2)}%`);
      } else {
        stillNull++;
      }
    } catch (e) {
      errored++;
      // Yahoo throws for unknown/delisted symbols; that's expected for a microcap-heavy portfolio.
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nDone. Updated: ${updated}, still null: ${stillNull}, errors: ${errored}`);
