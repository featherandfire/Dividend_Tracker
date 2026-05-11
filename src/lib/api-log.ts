// Fire-and-forget logger that records every external API call to public.api_calls.
// Used by the "API Usage" card on the dashboard. Server-only.
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type ApiName = "finnhub" | "yahoo" | "fmp" | "polygon";

// Buffer + periodic flush keeps the log lightweight under high call rates (e.g. a 379-ticker
// refresh = ~1500 inserts). One flush per batch instead of one insert per call.
type Entry = { api: ApiName; endpoint?: string | null; status?: number | null; ts: string };
let buffer: Entry[] = [];
let timer: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL_MS = 1500;
const FLUSH_MAX_BATCH = 100;

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    const sb = createServiceRoleClient();
    await sb.from("api_calls").insert(batch);
  } catch {
    // Swallow — logging must never break the underlying fetch.
  }
}

export function logApiCall(api: ApiName, endpoint?: string, status?: number): void {
  buffer.push({
    api,
    endpoint: endpoint ?? null,
    status: status ?? null,
    ts: new Date().toISOString(),
  });
  if (buffer.length >= FLUSH_MAX_BATCH) {
    void flush();
  } else {
    scheduleFlush();
  }
}
