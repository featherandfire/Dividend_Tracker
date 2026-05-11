"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity } from "lucide-react";
import type { ApiUsage } from "@/app/api/usage/route";

const REFRESH_INTERVAL_MS = 15_000;

export function ApiUsageCard() {
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [pending, start] = useTransition();

  function load() {
    start(async () => {
      try {
        const res = await fetch("/api/usage", { cache: "no-store" });
        if (res.ok) setUsage(await res.json());
      } catch {
        // Silent — card just stays stale.
      }
    });
  }

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-muted-foreground" />
          API Usage
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={pending}>
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Row
          name="Finnhub"
          tone="coral"
          primary={{ used: usage?.finnhub.lastMinute ?? 0, max: 60, unit: "per min" }}
          secondary={{ label: "Last 24h", value: usage?.finnhub.last24h ?? 0 }}
        />
        <Row
          name="Yahoo"
          tone="gold"
          primary={{ used: usage?.yahoo.lastHour ?? 0, max: null, unit: "per hour" }}
          secondary={{ label: "Last 24h", value: usage?.yahoo.last24h ?? 0 }}
        />
        <Row
          name="FMP"
          tone="blue"
          primary={{ used: usage?.fmp.last24h ?? 0, max: 250, unit: "per day" }}
          secondary={{ label: "Last hour", value: usage?.fmp.lastHour ?? 0 }}
          exhausted={usage?.fmp.rateLimited ?? false}
          exhaustedAt={usage?.fmp.rateLimitedAt ?? null}
        />
      </CardContent>
    </Card>
  );
}

type RowProps = {
  name: string;
  tone: "coral" | "gold" | "blue";
  primary: { used: number; max: number | null; unit: string };
  secondary: { label: string; value: number };
  exhausted?: boolean;
  exhaustedAt?: string | null;
};

function Row({ name, tone, primary, secondary, exhausted, exhaustedAt }: RowProps) {
  const pct = primary.max ? Math.min(100, (primary.used / primary.max) * 100) : null;

  // Color the bar: when exhausted, force red regardless of count.
  const barColor =
    exhausted ? "bg-[oklch(0.68_0.22_22)]"
    : pct == null ? toneFill(tone)
    : pct >= 90 ? "bg-[oklch(0.68_0.22_22)]"     // red-coral
    : pct >= 60 ? "bg-[oklch(0.82_0.17_85)]"     // gold
    : "bg-[oklch(0.68_0.16_160)]";               // green

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{name}</p>
        {exhausted ? (
          <span className="rounded-md bg-[oklch(0.68_0.22_22)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[oklch(0.78_0.2_22)]">
            Exhausted
          </span>
        ) : (
          <p className="text-xs text-muted-foreground">{primary.unit}</p>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <p
          className={`text-2xl font-bold tabular-nums leading-none ${
            exhausted ? "text-[oklch(0.78_0.2_22)]" : ""
          }`}
        >
          {primary.used}
        </p>
        {primary.max && (
          <p className="text-xs text-muted-foreground tabular-nums">/ {primary.max}</p>
        )}
      </div>
      {primary.max != null ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: exhausted ? "100%" : `${pct}%` }}
          />
        </div>
      ) : (
        <div className="h-1.5 w-full rounded-full bg-muted/40" />
      )}
      {exhausted ? (
        <p className="text-[10px] text-[oklch(0.78_0.2_22)]">
          Rate-limited{exhaustedAt ? ` — resets at midnight UTC` : ""}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          {secondary.label}: <span className="font-medium text-foreground tabular-nums">{secondary.value}</span>
        </p>
      )}
    </div>
  );
}

function toneFill(tone: "coral" | "gold" | "blue"): string {
  if (tone === "coral") return "bg-[oklch(0.68_0.22_22)]";
  if (tone === "gold")  return "bg-[oklch(0.82_0.17_85)]";
  return "bg-[oklch(0.66_0.15_230)]";
}
