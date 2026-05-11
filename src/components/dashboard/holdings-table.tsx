"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreHorizontal, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtCurrency, fmtPct, polygonFreshness, POLYGON_STALE_DAYS, type HoldingMetrics } from "@/lib/calculations";
import { AddHoldingDialog } from "./add-holding-dialog";
import { ImportDialog } from "./import-dialog";
import { RefreshButton } from "./refresh-button";
import { ValidateButton } from "./validate-button";
import { ValidateAllButton } from "./validate-all-button";
import { toast } from "sonner";
import type { Holding } from "@/lib/types";

type Props = { holdings: Holding[]; metrics: HoldingMetrics[] };
type SortKey = "ticker" | "value" | "income" | "yield" | "yoc";

export function HoldingsTable({ holdings, metrics }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("income");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showOthers, setShowOthers] = useState(false);
  const supabase = createClient();
  const byTicker = new Map(metrics.map((m) => [m.ticker, m]));

  // Partition rows: dividend payers (full table) vs. everything else (collapsed list).
  const { payers, others } = useMemo(() => {
    const p: Holding[] = [];
    const o: Holding[] = [];
    for (const h of holdings) {
      const m = byTicker.get(h.ticker);
      if ((m?.annualIncome ?? 0) > 0) p.push(h);
      else o.push(h);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    p.sort((a, b) => {
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
      const am = byTicker.get(a.ticker);
      const bm = byTicker.get(b.ticker);
      const get = (m: HoldingMetrics | undefined) =>
        sortKey === "value" ? m?.marketValue ?? -1
        : sortKey === "income" ? m?.annualIncome ?? -1
        : sortKey === "yield" ? m?.yieldPct ?? -1
        : m?.yieldOnCostPct ?? -1;
      return (get(am) - get(bm)) * dir;
    });
    o.sort((a, b) => {
      const am = byTicker.get(a.ticker);
      const bm = byTicker.get(b.ticker);
      return (bm?.marketValue ?? 0) - (am?.marketValue ?? 0);
    });
    return { payers: p, others: o };
  }, [holdings, byTicker, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "ticker" ? "asc" : "desc");
    }
  }

  function toggleDrip(h: Holding, next: boolean) {
    start(async () => {
      const { error } = await supabase.from("holdings").update({ drip_enabled: next }).eq("id", h.id);
      if (error) toast.error(error.message);
      else router.refresh();
    });
  }

  function remove(h: Holding) {
    if (!confirm(`Remove ${h.ticker}?`)) return;
    start(async () => {
      const { error } = await supabase.from("holdings").delete().eq("id", h.id);
      if (error) toast.error(error.message);
      else {
        toast.success(`Removed ${h.ticker}`);
        router.refresh();
      }
    });
  }

  if (holdings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">No holdings yet.</p>
          <AddHoldingDialog />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">Holdings</CardTitle>
          <span className="text-xs text-muted-foreground">
            <span className="text-[oklch(0.88_0.17_85)]">{payers.length}</span> pay dividends · {others.length} other
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ValidateAllButton
            tickers={payers
              .filter((h) => !byTicker.get(h.ticker)?.polygonValidatedAt)
              .map((h) => h.ticker)}
          />
          <RefreshButton tickers={holdings.map((h) => h.ticker)} />
          <ImportDialog />
          <AddHoldingDialog />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile cards — same card layout for payers and non-payers, gated by collapse toggle */}
        <div className="grid gap-2 p-4 sm:hidden">
          {payers.length === 0 && others.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No holdings. Click Refresh to fetch prices and dividend data.
            </p>
          )}
          {payers.map((h) => (
            <MobileCard
              key={h.id}
              h={h}
              m={byTicker.get(h.ticker)}
              pending={pending}
              onToggleDrip={toggleDrip}
              onRemove={remove}
            />
          ))}

          {others.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOthers((s) => !s)}
              className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2.5 text-sm hover:bg-muted/50"
            >
              <span className="font-medium">
                {others.length} non-dividend
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {fmtCurrency(others.reduce((s, h) => s + (byTicker.get(h.ticker)?.marketValue ?? 0), 0), { compact: true })}
                <ChevronDown className={`h-4 w-4 transition-transform ${showOthers ? "rotate-180" : ""}`} />
              </span>
            </button>
          )}

          {showOthers && others.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/15 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                Scan all {others.length} for missed dividends.
              </p>
              <ValidateAllButton
                tickers={others
                  .filter((h) => !byTicker.get(h.ticker)?.polygonValidatedAt)
                  .map((h) => h.ticker)}
              />
            </div>
          )}

          {showOthers && others.map((h) => (
            <MobileCard
              key={h.id}
              h={h}
              m={byTicker.get(h.ticker)}
              pending={pending}
              onToggleDrip={toggleDrip}
              onRemove={remove}
            />
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <SortableTh label="Ticker" k="ticker" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
                  <th className="px-4 py-2 font-medium">Sector</th>
                  <th className="px-4 py-2 font-medium text-right">Shares</th>
                  <th className="px-4 py-2 font-medium text-right">Avg cost</th>
                  <SortableTh label="Value" k="value" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SourceTh label="Income (FH)"  tone="orange" />
                  <SourceTh label="Income (YH)"  tone="gold" />
                  <SourceTh label="Income (FMP)" tone="turquoise" />
                  <SourceTh label="Income (POL)" tone="blue" />
                  <SortableTh label="Yield" k="yield" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="YoC" k="yoc" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <th className="px-4 py-2 font-medium text-center">DRIP</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {payers.length === 0 && others.length === 0 && (
                  <tr>
                    <td colSpan={13} className="py-8 text-center text-sm text-muted-foreground">
                      No holdings. Click Refresh to fetch prices and dividend data.
                    </td>
                  </tr>
                )}
                {payers.map((h) => (
                  <DesktopRow
                    key={h.id}
                    h={h}
                    m={byTicker.get(h.ticker)}
                    pending={pending}
                    onToggleDrip={toggleDrip}
                    onRemove={remove}
                  />
                ))}

                {others.length > 0 && (
                  <tr className="border-t border-border/60">
                    <td colSpan={13} className="p-0">
                      <button
                        type="button"
                        onClick={() => setShowOthers((s) => !s)}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/30"
                      >
                        <span className="font-medium">
                          {others.length} non-dividend holding{others.length === 1 ? "" : "s"}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {fmtCurrency(others.reduce((s, h) => s + (byTicker.get(h.ticker)?.marketValue ?? 0), 0))} total value
                          <ChevronDown className={`h-4 w-4 transition-transform ${showOthers ? "rotate-180" : ""}`} />
                        </span>
                      </button>
                    </td>
                  </tr>
                )}

                {showOthers && others.length > 0 && (
                  <tr className="bg-muted/15">
                    <td colSpan={13} className="px-4 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Scan all {others.length} for dividends Finnhub / Yahoo / FMP missed. Throttled at 4/min.
                        </p>
                        <ValidateAllButton
                          tickers={others
                            .filter((h) => !byTicker.get(h.ticker)?.polygonValidatedAt)
                            .map((h) => h.ticker)}
                        />
                      </div>
                    </td>
                  </tr>
                )}

                {showOthers && others.map((h) => (
                  <DesktopRow
                    key={h.id}
                    h={h}
                    m={byTicker.get(h.ticker)}
                    pending={pending}
                    onToggleDrip={toggleDrip}
                    onRemove={remove}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align: "left" | "right";
}) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "";
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label} {arrow && <span aria-hidden>{arrow}</span>}
      </button>
    </th>
  );
}

// Column header for an income-by-source column. Renders a small colored dot beside the label
// so the column-color system reads at a glance.
function SourceTh({ label, tone }: { label: string; tone: "orange" | "gold" | "turquoise" | "blue" }) {
  const colorVar =
    tone === "orange"    ? "oklch(0.82 0.16 55)"
    : tone === "gold"      ? "oklch(0.88 0.17 85)"
    : tone === "turquoise" ? "oklch(0.82 0.13 190)"
    : "oklch(0.78 0.15 230)";
  return (
    <th className="px-4 py-2 font-medium text-right">
      <span className="inline-flex items-center justify-end gap-1.5">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: colorVar }} />
        {label}
      </span>
    </th>
  );
}

function DesktopRow({
  h,
  m,
  pending,
  onToggleDrip,
  onRemove,
}: {
  h: Holding;
  m: HoldingMetrics | undefined;
  pending: boolean;
  onToggleDrip: (h: Holding, next: boolean) => void;
  onRemove: (h: Holding) => void;
}) {
  const suspicious = m?.suspicious ?? false;
  // FMP is only called when at least one other source already found a dividend (likely-payer gate).
  // So the existence of any FH or YH dividend implies FMP was attempted for this ticker.
  const fmpAttempted =
    (m?.finnhubDividend != null && m.finnhubDividend > 0) ||
    (m?.yahooDividend != null && m.yahooDividend > 0);
  return (
    <tr className={`transition-colors hover:bg-muted/30 ${suspicious ? "bg-[oklch(0.68_0.22_22)]/8" : ""}`}>
      <td className="px-4 py-3 font-semibold font-mono tracking-tight">
        <div className="flex items-center gap-1.5">
          {h.ticker}
          {suspicious && (
            <span
              title="Yield > 50% — likely bad source data (foreign ADR / special distribution). Verify externally."
              className="text-[oklch(0.78_0.2_22)]"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{m?.sector ?? "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums">{h.shares}</td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtCurrency(h.cost_basis)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(m?.marketValue ?? null)}</td>
      {/* Each income source column uses its own permanent color when populated;
          bold weight marks the canonical source driving the totals. */}
      <td
        className={`px-4 py-3 text-right tabular-nums ${
          m?.finnhubIncome != null
            ? `text-[oklch(0.82_0.16_55)] ${m?.dividendSource === "finnhub" ? "font-semibold" : ""}`
            : "text-[oklch(0.82_0.16_55)]/50"
        }`}
      >
        {fmtCurrency(m?.finnhubIncome ?? null)}
      </td>
      <td
        className={`px-4 py-3 text-right tabular-nums ${
          m?.yahooIncome != null
            ? `text-[oklch(0.88_0.17_85)] ${m?.dividendSource === "yahoo" ? "font-semibold" : ""}`
            : "text-[oklch(0.88_0.17_85)]/50"
        }`}
      >
        {fmtCurrency(m?.yahooIncome ?? null)}
      </td>
      <td
        className={`px-4 py-3 text-right tabular-nums ${
          m?.fmpIncome != null
            ? `text-[oklch(0.82_0.13_190)] ${m?.dividendSource === "fmp" ? "font-semibold" : ""}`
            : fmpAttempted
              ? "text-[oklch(0.82_0.13_190)]/50"
              : "text-muted-foreground"
        }`}
      >
        {fmtCurrency(m?.fmpIncome ?? null)}
      </td>
      <td
        className={`px-4 py-3 text-right tabular-nums ${
          m?.polygonIncome != null
            ? polygonFreshness(m?.polygonValidatedAt ?? null) === "stale"
              ? "text-[oklch(0.78_0.15_230)]/60"
              : `text-[oklch(0.78_0.15_230)] ${m?.dividendSource === "polygon" ? "font-semibold" : ""}`
            : m?.polygonValidatedAt
              ? "text-[oklch(0.78_0.15_230)]/50"
              : "text-muted-foreground"
        }`}
        title={
          m?.polygonValidatedAt
            ? polygonFreshness(m.polygonValidatedAt) === "stale"
              ? `Validated ${new Date(m.polygonValidatedAt).toLocaleDateString()} — stale (>${POLYGON_STALE_DAYS} days). Re-validate to refresh.`
              : `Validated ${new Date(m.polygonValidatedAt).toLocaleDateString()}`
            : "Not yet validated"
        }
      >
        <span className="inline-flex items-center justify-end gap-1">
          {polygonFreshness(m?.polygonValidatedAt ?? null) === "stale" && (
            <span aria-hidden className="text-[10px]">⚠</span>
          )}
          {fmtCurrency(m?.polygonIncome ?? null)}
        </span>
      </td>
      <td className={`px-4 py-3 text-right tabular-nums ${suspicious ? "text-[oklch(0.78_0.2_22)]" : ""}`}>
        {fmtPct(m?.yieldPct ?? null)}
      </td>
      <td className={`px-4 py-3 text-right tabular-nums ${suspicious ? "text-[oklch(0.78_0.2_22)]" : ""}`}>
        {fmtPct(m?.yieldOnCostPct ?? null)}
      </td>
      <td className="px-4 py-3 text-center">
        <Switch checked={h.drip_enabled} onCheckedChange={(v) => onToggleDrip(h, v)} disabled={pending} />
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-0.5">
          {m && <ValidateButton m={m} />}
          <RowMenu onEdit={h} onDelete={() => onRemove(h)} disabled={pending} />
        </div>
      </td>
    </tr>
  );
}

function MobileCard({
  h,
  m,
  pending,
  onToggleDrip,
  onRemove,
}: {
  h: Holding;
  m: HoldingMetrics | undefined;
  pending: boolean;
  onToggleDrip: (h: Holding, next: boolean) => void;
  onRemove: (h: Holding) => void;
}) {
  const suspicious = m?.suspicious ?? false;
  const fmpAttempted =
    (m?.finnhubDividend != null && m.finnhubDividend > 0) ||
    (m?.yahooDividend != null && m.yahooDividend > 0);
  const polAttempted = m?.polygonValidatedAt != null;
  return (
    <div className={`rounded-xl p-3 ${suspicious ? "bg-[oklch(0.68_0.22_22)]/10" : "bg-muted/40"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-1.5 font-semibold font-mono tracking-tight">
            {h.ticker}
            {suspicious && (
              <span title="Yield > 50% — likely bad source data." className="text-[oklch(0.78_0.2_22)]">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{h.shares} sh @ {fmtCurrency(h.cost_basis)}</p>
        </div>
        <RowMenu onEdit={h} onDelete={() => onRemove(h)} disabled={pending} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <Stat label="Value" value={fmtCurrency(m?.marketValue ?? null)} />
        <Stat label="Yield" value={fmtPct(m?.yieldPct ?? null)} />
        <Stat label="Income (FH)"  value={fmtCurrency(m?.finnhubIncome ?? null)} tone="orange"    canonical={m?.dividendSource === "finnhub"} wasChecked />
        <Stat label="Income (YH)"  value={fmtCurrency(m?.yahooIncome ?? null)}   tone="gold"      canonical={m?.dividendSource === "yahoo"}   wasChecked />
        <Stat label="Income (FMP)" value={fmtCurrency(m?.fmpIncome ?? null)}     tone="turquoise" canonical={m?.dividendSource === "fmp"}     wasChecked={fmpAttempted} />
        <Stat label="Income (POL)" value={fmtCurrency(m?.polygonIncome ?? null)} tone="blue"      canonical={m?.dividendSource === "polygon"} wasChecked={polAttempted} />
        <Stat label="YoC" value={fmtPct(m?.yieldOnCostPct ?? null)} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Badge variant="outline" className="border-border/40 bg-background/40 text-[10px]">
          {m?.sector ?? "Unclassified"}
        </Badge>
        <div className="flex items-center gap-2">
          {m && <ValidateButton m={m} />}
          <span className="text-xs text-muted-foreground">DRIP</span>
          <Switch checked={h.drip_enabled} onCheckedChange={(v) => onToggleDrip(h, v)} disabled={pending} />
        </div>
      </div>
    </div>
  );
}

type StatTone = "orange" | "gold" | "turquoise" | "blue";
const STAT_TONE_CLASS: Record<StatTone, { full: string; muted: string }> = {
  orange:    { full: "text-[oklch(0.82_0.16_55)]",  muted: "text-[oklch(0.82_0.16_55)]/50" },
  gold:      { full: "text-[oklch(0.88_0.17_85)]",  muted: "text-[oklch(0.88_0.17_85)]/50" },
  turquoise: { full: "text-[oklch(0.82_0.13_190)]", muted: "text-[oklch(0.82_0.13_190)]/50" },
  blue:      { full: "text-[oklch(0.78_0.15_230)]", muted: "text-[oklch(0.78_0.15_230)]/50" },
};

function Stat({
  label,
  value,
  tone,
  canonical,
  wasChecked,
}: {
  label: string;
  value: string;
  tone?: StatTone;
  canonical?: boolean;
  // True when this source was actually called for the ticker. Drives the muted-tone "—"
  // for empty-but-checked vs. plain muted gray for empty-and-not-checked.
  wasChecked?: boolean;
}) {
  const populated = value !== "—";
  const colorClass = tone
    ? populated
      ? STAT_TONE_CLASS[tone].full
      : wasChecked
        ? STAT_TONE_CLASS[tone].muted
        : "text-muted-foreground"
    : "";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`tabular-nums ${colorClass} ${canonical ? "font-bold" : "font-medium"}`}>{value}</p>
    </div>
  );
}

function RowMenu({ onEdit, onDelete, disabled }: { onEdit: Holding; onDelete: () => void; disabled: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" disabled={disabled}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <AddHoldingDialog
          editing={onEdit}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
          }
        />
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
