"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function RefreshButton({ tickers }: { tickers: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function refresh() {
    if (tickers.length === 0) return;
    start(async () => {
      const t = toast.loading(`Refreshing prices for ${tickers.length} ticker${tickers.length === 1 ? "" : "s"}…`);
      try {
        const res = await fetch("/api/tickers", {
          method: "POST",
          body: JSON.stringify({ tickers }),
          headers: { "content-type": "application/json" },
        });
        if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
        const json = (await res.json()) as { snapshots: Record<string, unknown> };
        toast.success(`Refreshed ${Object.keys(json.snapshots ?? {}).length} of ${tickers.length}`, { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Refresh failed", { id: t });
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={refresh} disabled={pending || tickers.length === 0}>
      <RefreshCw className={`mr-1 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Refreshing…" : "Refresh"}
    </Button>
  );
}
