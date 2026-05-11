import type { Database } from "./supabase/database.types";

export type Holding = Database["public"]["Tables"]["holdings"]["Row"];
export type HoldingInsert = Database["public"]["Tables"]["holdings"]["Insert"];
export type HoldingUpdate = Database["public"]["Tables"]["holdings"]["Update"];

export type TickerSnapshot = Database["public"]["Tables"]["ticker_cache"]["Row"];
export type TickerSnapshotInsert = Database["public"]["Tables"]["ticker_cache"]["Insert"];

export type HoldingWithSnapshot = Holding & { snapshot: TickerSnapshot | null };
