"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { parseFile, buildImportRows, COLUMN_ROLE_LABELS, type ParsedSheet, type ColumnRole, type ImportRow } from "@/lib/import";

export function ImportDialog({ trigger }: { trigger?: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [drip, setDrip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const built = useMemo(() => (sheet ? buildImportRows(sheet, roles) : { rows: [], skipped: 0 }), [sheet, roles]);
  const selected = built.rows.filter((r) => !excluded.has(r.ticker));

  function reset() {
    setSheet(null);
    setRoles([]);
    setExcluded(new Set());
    setDrip(false);
    setError(null);
  }

  async function onFile(file: File) {
    setError(null);
    try {
      const parsed = await parseFile(file);
      setSheet(parsed);
      setRoles(parsed.detectedRoles);
      setExcluded(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
    }
  }

  function toggleRow(ticker: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  function setRole(idx: number, role: ColumnRole) {
    setRoles((prev) => {
      const next = [...prev];
      // Enforce one column per role (except "ignore")
      if (role !== "ignore") {
        for (let i = 0; i < next.length; i++) if (i !== idx && next[i] === role) next[i] = "ignore";
      }
      next[idx] = role;
      return next;
    });
  }

  async function submit() {
    if (selected.length === 0) {
      toast.error("Nothing to import.");
      return;
    }

    start(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not signed in.");
        return;
      }

      const payload = selected.map((r) => ({
        user_id: user.id,
        ticker: r.ticker,
        shares: r.shares,
        cost_basis: r.costBasis,
        drip_enabled: drip,
      }));

      // Upsert by (user_id, ticker) — updates existing rows, inserts new ones.
      const { error } = await supabase.from("holdings").upsert(payload, { onConflict: "user_id,ticker" });
      if (error) {
        toast.error(error.message);
        return;
      }

      // Fire and forget — prime the Finnhub cache for all new tickers.
      const tickers = Array.from(new Set(selected.map((r) => r.ticker)));
      fetch("/api/tickers", { method: "POST", body: JSON.stringify({ tickers }) }).catch(() => {});

      toast.success(`Imported ${selected.length} holding${selected.length === 1 ? "" : "s"}`);
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm" variant="outline">
              <Upload className="mr-1 h-4 w-4" />
              Import CSV / Excel
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import holdings</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel export from your broker. We&apos;ll auto-detect Ticker / Shares / Cost columns. Adjust below if needed.
          </DialogDescription>
        </DialogHeader>

        {!sheet ? (
          <div className="grid gap-3">
            <Label htmlFor="file" className="text-sm">Choose a .csv or .xlsx file</Label>
            <Input
              id="file"
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {sheet.headers.map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left font-medium">
                        <div className="space-y-1">
                          <p className="truncate text-muted-foreground" title={h}>{h || `Column ${i + 1}`}</p>
                          <Select value={roles[i] ?? "ignore"} onValueChange={(v) => setRole(i, v as ColumnRole)}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(COLUMN_ROLE_LABELS) as ColumnRole[]).map((r) => (
                                <SelectItem key={r} value={r}>{COLUMN_ROLE_LABELS[r]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 8).map((r, ri) => (
                    <tr key={ri} className="border-t">
                      {r.map((c, ci) => (
                        <td key={ci} className="max-w-[160px] truncate px-2 py-1.5 text-muted-foreground">
                          {c == null ? "" : String(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detected import preview */}
            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
                <p>
                  <span className="font-medium">{built.rows.length}</span> parsed,{" "}
                  <span className="font-medium">{selected.length}</span> selected,{" "}
                  <span className="text-muted-foreground">{built.skipped} skipped</span>
                </p>
                <div className="flex items-center gap-2">
                  <Label htmlFor="imp-drip" className="text-xs">DRIP all</Label>
                  <Switch id="imp-drip" checked={drip} onCheckedChange={setDrip} />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {built.rows.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No valid rows detected. Make sure Ticker and Shares columns are mapped correctly.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/40 text-left">
                      <tr>
                        <th className="w-8 px-2 py-1.5"></th>
                        <th className="px-2 py-1.5 font-medium">Ticker</th>
                        <th className="px-2 py-1.5 font-medium text-right">Shares</th>
                        <th className="px-2 py-1.5 font-medium text-right">Avg cost / sh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {built.rows.map((r) => (
                        <ImportRowItem
                          key={r.ticker}
                          row={r}
                          excluded={excluded.has(r.ticker)}
                          onToggle={() => toggleRow(r.ticker)}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Existing tickers are <Badge variant="secondary" className="text-[10px]">updated</Badge> in place; new ones are added.
              Cash, money market, and total rows are filtered out automatically.
            </p>
          </div>
        )}

        <DialogFooter>
          {sheet && (
            <Button type="button" variant="ghost" onClick={reset}>
              Choose another file
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={!sheet || pending || selected.length === 0}>
            {pending ? "Importing…" : `Import ${selected.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportRowItem({ row, excluded, onToggle }: { row: ImportRow; excluded: boolean; onToggle: () => void }) {
  return (
    <tr className={excluded ? "border-t opacity-40" : "border-t"}>
      <td className="px-2 py-1.5">
        <input type="checkbox" checked={!excluded} onChange={onToggle} className="h-3.5 w-3.5" />
      </td>
      <td className="px-2 py-1.5 font-semibold">{row.ticker}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{row.shares}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {row.costBasis > 0 ? `$${row.costBasis.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}
