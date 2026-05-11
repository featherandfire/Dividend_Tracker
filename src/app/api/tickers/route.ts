import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fetchSnapshots } from "@/lib/finnhub";

const Body = z.object({ tickers: z.array(z.string().min(1).max(10)).min(1).max(1000) });

// POST /api/tickers — body: { tickers: ["AAPL", "MSFT"] } — returns cached snapshots, refreshing stale ones.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  try {
    const snapshots = await fetchSnapshots(parsed.data.tickers);
    return NextResponse.json({ snapshots });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 });
  }
}
