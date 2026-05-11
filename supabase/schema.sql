-- Dividend Income Tracker — Supabase schema
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query → paste → Run).

create extension if not exists "pgcrypto";

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  shares numeric(18, 6) not null check (shares > 0),
  cost_basis numeric(18, 6) not null check (cost_basis >= 0),
  drip_enabled boolean not null default false,
  sector text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create index if not exists holdings_user_id_idx on public.holdings(user_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists holdings_set_updated_at on public.holdings;
create trigger holdings_set_updated_at
before update on public.holdings
for each row execute function public.set_updated_at();

-- Row-level security: each user only sees their own rows.
alter table public.holdings enable row level security;

drop policy if exists "holdings_select_own" on public.holdings;
create policy "holdings_select_own" on public.holdings
  for select using (auth.uid() = user_id);

drop policy if exists "holdings_insert_own" on public.holdings;
create policy "holdings_insert_own" on public.holdings
  for insert with check (auth.uid() = user_id);

drop policy if exists "holdings_update_own" on public.holdings;
create policy "holdings_update_own" on public.holdings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "holdings_delete_own" on public.holdings;
create policy "holdings_delete_own" on public.holdings
  for delete using (auth.uid() = user_id);

-- Cached lookups (shared across users) so we stay under rate limits.
create table if not exists public.ticker_cache (
  ticker text primary key,
  price numeric(18, 6),
  annual_dividend numeric(18, 6),
  dividend_yield numeric(10, 6),
  ex_dividend_date date,
  payment_date date,
  pay_frequency int,
  sector text,
  company_name text,
  fetched_at timestamptz not null default now()
);

-- API call log — used by the dashboard's "API Usage" card.
create table if not exists public.api_calls (
  id bigserial primary key,
  api text not null,
  endpoint text,
  status int,
  ts timestamptz not null default now()
);
create index if not exists api_calls_ts_idx on public.api_calls(ts desc);

alter table public.api_calls enable row level security;

drop policy if exists "api_calls_select_authed" on public.api_calls;
create policy "api_calls_select_authed" on public.api_calls
  for select using (auth.uid() is not null);
-- Inserts happen server-side via the service-role key, which bypasses RLS.

-- Source-tracking: store raw dividend values from each provider + the chosen source. Idempotent.
alter table public.ticker_cache
  add column if not exists dividend_source text,
  add column if not exists finnhub_dividend numeric(18, 6),
  add column if not exists yahoo_dividend numeric(18, 6),
  add column if not exists finnhub_yield numeric(10, 6),
  add column if not exists yahoo_yield numeric(10, 6),
  add column if not exists fmp_dividend numeric(18, 6),
  add column if not exists fmp_yield numeric(10, 6),
  -- Polygon validation: separate from the bulk source columns because it's authoritative
  -- (sourced from exchange filings) and gated behind manual triggers, not auto-refresh.
  add column if not exists polygon_dividend numeric(18, 6),
  add column if not exists polygon_yield numeric(10, 6),
  add column if not exists polygon_ex_date date,
  add column if not exists polygon_pay_date date,
  add column if not exists polygon_validated_at timestamptz;

alter table public.ticker_cache enable row level security;

drop policy if exists "ticker_cache_select_all" on public.ticker_cache;
create policy "ticker_cache_select_all" on public.ticker_cache
  for select using (auth.uid() is not null);
-- Inserts/updates happen server-side via the service-role key, which bypasses RLS.
