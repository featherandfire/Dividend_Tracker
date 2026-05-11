"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShieldCheck, Loader2 } from "lucide-react";
import { fmtCurrency, fmtPct, type HoldingMetrics } from "@/lib/calculations";
import { toast } from "sonner";
import type { PolygonValidation } from "@/lib/polygon";

export function ValidateButton({ m }: { m: HoldingMetrics }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PolygonValidation | null>(null);

  function run() {
    setResult(null);
    start(async () => {
      try {
        const res = await fetch("/api/validate", {
          method: "POST",
          body: JSON.stringify({ ticker: m.ticker }),
          headers: { "content-type": "application/json" },
        });
        if (res.status === 429) {
          toast.error("Polygon rate-limited — wait ~60s and try again.");
          return;
        }
        if (!res.ok) {
          toast.error("Validation failed.");
          return;
        }
        const data = (await res.json()) as PolygonValidation;
        setResult(data);
        router.refresh();
      } catch {
        toast.error("Validation failed.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) run();
        else setResult(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Validate via Polygon"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[oklch(0.78_0.16_160)]" />
            Validate {m.ticker}
          </DialogTitle>
          <DialogDescription>
            Polygon.io dividend filings — sourced from exchange records.
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching from Polygon…
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* Polygon's authoritative values */}
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Polygon (authoritative)
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Annual (TTM)" value={fmtCurrency(result.annualDividend)} />
                <Stat label="Forward annual" value={fmtCurrency(result.forwardAnnual)} />
                <Stat label="Frequency" value={freqLabel(result.frequency)} />
                <Stat label="Latest ex-date" value={result.latestExDate ?? "—"} />
              </div>
            </div>

            {/* Comparison vs our stored sources */}
            <div className="rounded-xl border border-border/40 p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cross-check vs other sources
              </p>
              <CompareRow label="Finnhub" value={m.finnhubDividend} polygon={result.annualDividend} />
              <CompareRow label="Yahoo"   value={m.yahooDividend}   polygon={result.annualDividend} />
              <CompareRow label="FMP"     value={m.fmpDividend}     polygon={result.annualDividend} />
              <CompareRow label="In use"  value={m.annualIncome != null && m.shares > 0 ? m.annualIncome / m.shares : null} polygon={result.annualDividend} bold />
            </div>

            {/* Recent payments */}
            {result.payments.length > 0 && (
              <div className="rounded-xl border border-border/40 p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent payments
                </p>
                <div className="space-y-1 text-xs">
                  {result.payments.slice(0, 6).map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 tabular-nums">
                      <span className="text-muted-foreground">{p.exDividendDate}</span>
                      <span className="font-medium">{fmtCurrency(p.cashAmount)}</span>
                      <span className="text-[10px] text-muted-foreground">pay {p.payDate ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">No result.</div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          <Button type="button" onClick={run} disabled={pending}>
            {pending ? "Validating…" : "Re-fetch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CompareRow({
  label,
  value,
  polygon,
  bold,
}: {
  label: string;
  value: number | null;
  polygon: number | null;
  bold?: boolean;
}) {
  const diffPct =
    value != null && polygon != null && polygon > 0
      ? ((value - polygon) / polygon) * 100
      : null;
  const agrees = diffPct != null && Math.abs(diffPct) < 10;
  const tone =
    diffPct == null ? "text-muted-foreground"
    : agrees ? "text-[oklch(0.78_0.16_160)]"
    : "text-[oklch(0.78_0.2_22)]";

  return (
    <div className={`flex items-center justify-between gap-2 py-1.5 text-xs ${bold ? "border-t border-border/40 pt-2 mt-1 font-medium" : ""}`}>
      <span>{label}</span>
      <div className="flex items-baseline gap-2 tabular-nums">
        <span>{value != null ? fmtCurrency(value) : <span className="text-muted-foreground">—</span>}</span>
        {diffPct != null && (
          <span className={`text-[10px] ${tone}`}>
            {diffPct >= 0 ? "+" : ""}{fmtPct(diffPct, 1)}
          </span>
        )}
      </div>
    </div>
  );
}

function freqLabel(f: number | null): string {
  if (f == null) return "—";
  return f === 12 ? "Monthly" : f === 4 ? "Quarterly" : f === 2 ? "Semi-annual" : f === 1 ? "Annual" : `${f}/yr`;
}
