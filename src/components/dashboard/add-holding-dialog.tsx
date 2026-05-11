"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Holding } from "@/lib/types";

type Props = { editing?: Holding; trigger?: React.ReactElement; onSaved?: () => void };

export function AddHoldingDialog({ editing, trigger, onSaved }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [ticker, setTicker] = useState(editing?.ticker ?? "");
  const [shares, setShares] = useState(editing?.shares?.toString() ?? "");
  const [costBasis, setCostBasis] = useState(editing?.cost_basis?.toString() ?? "");
  const [drip, setDrip] = useState(editing?.drip_enabled ?? false);
  const [notes, setNotes] = useState(editing?.notes ?? "");

  function reset() {
    if (!editing) {
      setTicker("");
      setShares("");
      setCostBasis("");
      setDrip(false);
      setNotes("");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const sym = ticker.toUpperCase().trim();
    const sh = Number(shares);
    const cb = Number(costBasis);
    if (!sym || !(sh > 0) || !(cb >= 0)) {
      toast.error("Fill in ticker, shares > 0, and avg cost ≥ 0.");
      return;
    }

    start(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not signed in.");
        return;
      }

      // Pre-fetch snapshot so the holding shows up with sector + price immediately.
      fetch("/api/tickers", { method: "POST", body: JSON.stringify({ tickers: [sym] }) }).catch(() => {});

      if (editing) {
        const { error } = await supabase
          .from("holdings")
          .update({ ticker: sym, shares: sh, cost_basis: cb, drip_enabled: drip, notes: notes || null })
          .eq("id", editing.id);
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success(`Updated ${sym}`);
      } else {
        const { error } = await supabase
          .from("holdings")
          .insert({ user_id: user.id, ticker: sym, shares: sh, cost_basis: cb, drip_enabled: drip, notes: notes || null });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success(`Added ${sym}`);
      }

      setOpen(false);
      reset();
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add holding
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit holding" : "Add holding"}</DialogTitle>
          <DialogDescription>Cost basis is your average cost per share.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ah-ticker">Ticker</Label>
            <Input id="ah-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL" autoCapitalize="characters" required disabled={!!editing} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ah-shares">Shares</Label>
              <Input id="ah-shares" type="number" step="0.0001" min="0" value={shares} onChange={(e) => setShares(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ah-cost">Avg cost / share</Label>
              <Input id="ah-cost" type="number" step="0.01" min="0" value={costBasis} onChange={(e) => setCostBasis(e.target.value)} required />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="ah-drip" className="text-sm">DRIP</Label>
              <p className="text-xs text-muted-foreground">Reinvest dividends automatically</p>
            </div>
            <Switch id="ah-drip" checked={drip} onCheckedChange={setDrip} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ah-notes">Notes</Label>
            <Input id="ah-notes" value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} placeholder="(optional)" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Add holding"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
