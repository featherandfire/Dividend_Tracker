"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Polygon free tier is 5/min. We pace at 4/min (15s spacing) so a tight burst
// of clicks elsewhere doesn't push us over.
const SPACING_MS = 15_000;

export function ValidateAllButton({ tickers }: { tickers: string[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  async function runAll() {
    if (tickers.length === 0 || running) return;
    cancelRef.current = false;
    setRunning(true);
    setCompleted(0);
    setTotal(tickers.length);
    const eta = Math.ceil((tickers.length * SPACING_MS) / 60_000);
    const t = toast.loading(`Validating ${tickers.length} via Polygon — ~${eta} min`, { duration: Infinity });

    let ok = 0;
    let failed = 0;
    let rateLimited = 0;

    for (let i = 0; i < tickers.length; i++) {
      if (cancelRef.current) break;
      const start = Date.now();
      try {
        const res = await fetch("/api/validate", {
          method: "POST",
          body: JSON.stringify({ ticker: tickers[i] }),
          headers: { "content-type": "application/json" },
        });
        if (res.status === 429) {
          rateLimited++;
          // Soft backoff — if we hit 429, push the next call out by an extra minute.
          await sleep(60_000);
        } else if (res.ok) {
          ok++;
          // Refresh after each successful validation so the row's Income (POL) cell
          // lights up in real time instead of all at once at the end.
          router.refresh();
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      setCompleted(i + 1);
      toast.loading(
        `Validating… ${i + 1}/${tickers.length} (ok ${ok} · failed ${failed}${rateLimited ? ` · 429s ${rateLimited}` : ""})`,
        { id: t, duration: Infinity },
      );

      // Pace the next call so we stay under Polygon's 5/min ceiling.
      if (i < tickers.length - 1 && !cancelRef.current) {
        const elapsed = Date.now() - start;
        const wait = Math.max(0, SPACING_MS - elapsed);
        if (wait > 0) await sleep(wait);
      }
    }

    toast.success(`Validated ${ok} of ${tickers.length}${failed ? ` (${failed} failed)` : ""}`, { id: t, duration: 6000 });
    setRunning(false);
    router.refresh();
  }

  function cancel() {
    cancelRef.current = true;
    setRunning(false);
    toast.message("Validation cancelled.");
  }

  if (tickers.length === 0) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={running ? cancel : runAll}
      title={running ? "Click to cancel" : `Validate all ${tickers.length} via Polygon (~${Math.ceil((tickers.length * SPACING_MS) / 60_000)} min)`}
    >
      {running ? (
        <>
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          {completed}/{total} — cancel
        </>
      ) : (
        <>
          <ShieldCheck className="mr-1 h-4 w-4" />
          Validate all
        </>
      )}
    </Button>
  );
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
