import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { fetchPolygonDividends } from "@/lib/polygon";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const Body = z.object({
  ticker: z.string().min(1).max(10),
  // When true, the result is persisted to ticker_cache for the dashboard to read.
  persist: z.boolean().default(true),
});

// POST /api/validate — body: { ticker: "AAPL" } → fetches Polygon dividend history,
// computes trailing-12mo and forward-annualized values, writes to the cache.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { ticker, persist } = parsed.data;
  const result = await fetchPolygonDividends(ticker);

  if (!result) return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  if (result.rateLimited) return NextResponse.json({ error: "rate_limited", retryAfter: 60 }, { status: 429 });

  if (persist) {
    const annual = result.annualDividend ?? result.forwardAnnual;
    const sb = createServiceRoleClient();
    const { data: cached } = await sb
      .from("ticker_cache")
      .select("price, annual_dividend, finnhub_dividend, yahoo_dividend, fmp_dividend, dividend_source")
      .eq("ticker", result.ticker)
      .maybeSingle();
    const price = cached?.price ?? null;
    const yieldPct = annual != null && price && price > 0 ? (annual / price) * 100 : null;

    // Polygon "promotion": if Polygon found a real dividend AND none of the other 3
    // sources reported anything, treat Polygon as the canonical source so the row moves
    // out of the "non-payers" bucket on the dashboard. We don't override existing
    // canonical values from Finnhub/Yahoo/FMP — those keep priority.
    const noOtherSourceHasDividend =
      !(cached?.finnhub_dividend && cached.finnhub_dividend > 0) &&
      !(cached?.yahoo_dividend && cached.yahoo_dividend > 0) &&
      !(cached?.fmp_dividend && cached.fmp_dividend > 0);
    const shouldPromote = annual != null && annual > 0 && noOtherSourceHasDividend;

    const update: TablesUpdate<"ticker_cache"> = {
      polygon_dividend: annual,
      polygon_yield: yieldPct,
      polygon_ex_date: result.latestExDate,
      polygon_pay_date: result.latestPayDate,
      polygon_validated_at: new Date().toISOString(),
    };
    if (shouldPromote) {
      update.annual_dividend = annual;
      update.dividend_yield = yieldPct;
      update.dividend_source = "polygon";
    }

    await sb.from("ticker_cache").update(update).eq("ticker", result.ticker);
  }

  return NextResponse.json(result);
}
