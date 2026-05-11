"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtCurrency, fmtPct, type HoldingMetrics } from "@/lib/calculations";

// Tone presets for each source. Both populated → coral (treat as Finnhub).
const SOURCE_STYLES: Record<"finnhub" | "yahoo" | "fmp" | "polygon", string> = {
  finnhub: "bg-[oklch(0.68_0.22_22)]/15 text-[oklch(0.78_0.2_22)]",
  yahoo:   "bg-[oklch(0.82_0.17_85)]/15 text-[oklch(0.88_0.17_85)]",
  fmp:     "bg-[oklch(0.66_0.15_230)]/15 text-[oklch(0.78_0.15_230)]",
  polygon: "bg-[oklch(0.68_0.16_160)]/15 text-[oklch(0.78_0.16_160)]",
};

export function SourceBadge({ m }: { m: HoldingMetrics }) {
  const src = m.dividendSource;
  if (!src) return <span className="text-xs text-muted-foreground">—</span>;

  const fhDiv = m.finnhubDividend;
  const yhDiv = m.yahooDividend;
  const fhYld = m.finnhubYield;
  const yhYld = m.yahooYield;
  const bothHaveValues = fhDiv != null && yhDiv != null;
  // Disagreement: > 10% relative difference between the two sources.
  const disagree =
    bothHaveValues && Math.abs((fhDiv - yhDiv) / Math.max(fhDiv, yhDiv)) > 0.1;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SOURCE_STYLES[src]} ${
              disagree ? "ring-1 ring-[oklch(0.78_0.2_22)]/40" : ""
            }`}
          >
            {src}
            {disagree && <span aria-hidden>⚠</span>}
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 border-border/40 text-xs">
        <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Dividend sources</p>
        <SourceRow label="Finnhub" annual={fhDiv} yieldPct={fhYld} chosen={src === "finnhub"} />
        <SourceRow label="Yahoo"   annual={yhDiv} yieldPct={yhYld} chosen={src === "yahoo"} />
        {disagree && (
          <p className="mt-2 rounded-md bg-[oklch(0.68_0.22_22)]/10 px-2 py-1.5 text-[11px] text-[oklch(0.78_0.2_22)]">
            Sources disagree by &gt;10%. Verify externally.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SourceRow({ label, annual, yieldPct, chosen }: { label: string; annual: number | null; yieldPct: number | null; chosen: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-md px-2 py-1.5 ${chosen ? "bg-muted/40" : ""}`}>
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{label}</span>
        {chosen && <span className="text-[9px] uppercase tracking-wide text-muted-foreground">in use</span>}
      </div>
      <div className="text-right tabular-nums">
        <p className="font-medium">{annual != null ? fmtCurrency(annual) : <span className="text-muted-foreground">—</span>}</p>
        <p className="text-[10px] text-muted-foreground">{yieldPct != null ? fmtPct(yieldPct) : "—"}</p>
      </div>
    </div>
  );
}
