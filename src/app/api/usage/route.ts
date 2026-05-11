import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type ApiUsage = {
  finnhub: { lastMinute: number; lastHour: number; last24h: number; limitPerMin: number };
  yahoo:   { lastMinute: number; lastHour: number; last24h: number };
  fmp:     {
    lastMinute: number;
    lastHour: number;
    last24h: number;
    limitPerDay: number;
    rateLimited: boolean;
    rateLimitedAt: string | null;
  };
};

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = createServiceRoleClient();
  const now = new Date();
  const oneMinAgo = new Date(now.getTime() - 60 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  async function countSince(api: string, since: string): Promise<number> {
    const { count } = await sb
      .from("api_calls")
      .select("*", { count: "exact", head: true })
      .eq("api", api)
      .gte("ts", since);
    return count ?? 0;
  }

  // "EXHAUSTED" state: a 429 from FMP that's more recent than the most recent
  // successful call. Once quota resets and a real call goes through, this flips back.
  const { data: latestFmp } = await sb
    .from("api_calls")
    .select("status, ts")
    .eq("api", "fmp")
    .gte("ts", oneDayAgo)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rateLimitRow = latestFmp?.status === 429 ? latestFmp : null;

  const [
    fnMin, fnHour, fnDay,
    yhMin, yhHour, yhDay,
    fmpMin, fmpHour, fmpDay,
  ] = await Promise.all([
    countSince("finnhub", oneMinAgo),  countSince("finnhub", oneHourAgo), countSince("finnhub", oneDayAgo),
    countSince("yahoo",   oneMinAgo),  countSince("yahoo",   oneHourAgo), countSince("yahoo",   oneDayAgo),
    countSince("fmp",     oneMinAgo),  countSince("fmp",     oneHourAgo), countSince("fmp",     oneDayAgo),
  ]);

  const usage: ApiUsage = {
    finnhub: { lastMinute: fnMin,  lastHour: fnHour,  last24h: fnDay, limitPerMin: 60 },
    yahoo:   { lastMinute: yhMin,  lastHour: yhHour,  last24h: yhDay },
    fmp: {
      lastMinute: fmpMin,
      lastHour: fmpHour,
      last24h: fmpDay,
      limitPerDay: 250,
      rateLimited: rateLimitRow != null,
      rateLimitedAt: rateLimitRow?.ts ?? null,
    },
  };
  return NextResponse.json(usage);
}
