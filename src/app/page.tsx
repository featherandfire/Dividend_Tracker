import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchSnapshotsCached } from "@/lib/finnhub";
import {
  bucketByMonth,
  bucketBySector,
  computeHoldingMetrics,
  computePortfolioMetrics,
  projectNextYearPayments,
} from "@/lib/calculations";
import { DashboardHeader } from "@/components/dashboard/header";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { IncomeBySource } from "@/components/dashboard/income-by-source";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { PaymentCalendar } from "@/components/dashboard/payment-calendar";
import { SectorBreakdown } from "@/components/dashboard/sector-breakdown";
import { AddHoldingDialog } from "@/components/dashboard/add-holding-dialog";
import { ImportDialog } from "@/components/dashboard/import-dialog";
import { ApiUsageCard } from "@/components/dashboard/api-usage-card";
import type { TickerSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: holdings } = await supabase
    .from("holdings")
    .select("*")
    .order("ticker", { ascending: true });

  const rows = holdings ?? [];
  const tickers = rows.map((h) => h.ticker);

  // Fetch snapshots concurrently — fetchSnapshots returns cached values when fresh.
  const snapshots: Record<string, TickerSnapshot> = tickers.length
    ? await fetchSnapshotsCached(tickers).catch(() => ({}))
    : {};

  const metrics = rows.map((h) => computeHoldingMetrics(h, snapshots[h.ticker] ?? null));
  const portfolio = computePortfolioMetrics(metrics);
  const payments = projectNextYearPayments(metrics, snapshots);
  const monthBuckets = bucketByMonth(payments);
  const sectorRows = bucketBySector(metrics);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <DashboardHeader email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">
        {rows.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl bg-card p-10 text-center">
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Welcome to Dividend Tracker</h2>
              <p className="text-sm text-muted-foreground">
                Add your first dividend-paying holding to see projected income, yield, and a 12-month pay calendar.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <AddHoldingDialog />
                <ImportDialog />
              </div>
            </div>
          </div>
        ) : (
          <>
            <SummaryCards m={portfolio} />
            <IncomeBySource metrics={metrics} />
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <PaymentCalendar buckets={monthBuckets} />
              </div>
              <div className="lg:col-span-2">
                <SectorBreakdown rows={sectorRows} />
              </div>
            </div>
            <ApiUsageCard />
            <HoldingsTable holdings={rows} metrics={metrics} />
          </>
        )}
      </main>
    </div>
  );
}
