# Dividend Tracker

Personal-portfolio dividend tracker. Stores holdings in Supabase, cross-references dividend data from **four sources** (Finnhub, Yahoo Finance, Financial Modeling Prep, Polygon.io), and renders a dashboard with projected income, payment calendar, sector breakdown, and per-source validation.

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **Supabase** (Postgres + Auth) for persistence; Row Level Security so holdings are per-user
- **Tailwind v4** + **shadcn/ui** components (Base UI under the hood)
- **Recharts** for the payment calendar bars and sector pie
- Fonts: **Fraunces** (display) + **Outfit** (body) + **JetBrains Mono** (tabular)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project
2. Open the SQL editor and paste the contents of [`supabase/schema.sql`](supabase/schema.sql), then **Run**
3. From Project Settings → API, copy your **Project URL**, **publishable key**, and **secret key**

### 3. Get API keys for the four dividend sources

| Source | Free tier | Sign up |
|---|---|---|
| **Finnhub** | 60 req/min | [finnhub.io](https://finnhub.io/dashboard) |
| **Yahoo Finance** | No key needed (via `yahoo-finance2`) | — |
| **Financial Modeling Prep** | 250 req/day | [financialmodelingprep.com](https://site.financialmodelingprep.com/developer/docs/dashboard) |
| **Polygon.io** | 5 req/min, unlimited daily | [polygon.io](https://polygon.io/dashboard) |

### 4. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
FINNHUB_API_KEY=...
FMP_API_KEY=...
POLYGON_API_KEY=...
SUPABASE_ACCESS_TOKEN=sbp_...   # only needed for `supabase gen types` regeneration
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up with email + password — the proxy middleware will gate every route behind auth.

## Architecture

- **`src/lib/supabase/`** — typed Supabase clients (browser, server, service-role)
- **`src/lib/finnhub.ts`** — orchestrates the full snapshot fetch: Finnhub primary, Yahoo always queried in parallel, FMP gated on likely-payers. Median tiebreak picks the canonical dividend. Row-cached for 24h (1h for failed lookups so retries aren't blocked).
- **`src/lib/yahoo.ts`** — Yahoo Finance via `yahoo-finance2`. Uses forward `dividendRate` over `trailingAnnualDividendRate` to correctly handle foreign ADRs.
- **`src/lib/fmp.ts`** — Financial Modeling Prep via `/stable/` endpoints. Detects rate-limit responses and surfaces them to the dashboard's API Usage card.
- **`src/lib/polygon.ts`** — Polygon.io for authoritative per-row validation. Records a validation timestamp so the column can distinguish "checked, no data" from "not yet checked".
- **`src/lib/api-log.ts`** — buffered fire-and-forget logger of every external API call, surfaced in the API Usage dashboard card.
- **`src/lib/calculations.ts`** — pure functions: per-holding metrics, portfolio aggregates, payment calendar projection from `pay_frequency` + most-recent ex-date.

## One-shot scripts (`scripts/`)

Run from the project root (each reads `.env.local` directly):

```bash
node scripts/<name>.mjs
```

- **`backfill-dividends.mjs`** — for cached rows with a price but no dividend, query Yahoo and patch any found.
- **`populate-sources.mjs`** — for every cached row with a price, re-fetch from Finnhub + Yahoo and write the raw values + chosen source. Useful after schema changes that add new source columns.
- **`backfill-fmp.mjs`** — for likely-payers without FMP data, fetch from FMP and re-pick the canonical source via median across providers.

## Visual system

- **Column colors** are consistent everywhere:
  - 🟠 Orange — Finnhub
  - 🟡 Gold — Yahoo
  - 💎 Turquoise — FMP
  - 🔵 Blue — Polygon
- **Bold** weight marks the canonical source driving the portfolio totals.
- **Coral red** is reserved for the suspicious-yield warning (>50% yield = likely bad source data, e.g. foreign-ADR currency bugs).
- An empty `—` cell in a **muted source tone** means "API checked, no dividend found"; an empty `—` in **plain gray** means "API hasn't checked this ticker yet."

## Notes

- Free-tier quotas are tight, especially FMP (250/day). The codebase gates FMP behind a "likely-payer" check so non-payers don't burn the daily cap.
- Polygon's bulk validation is throttled at 4/min to stay under the 5/min free-tier limit. ~25 min for the dividend payers; ~70 min for non-payers.
- The proxy middleware (`src/proxy.ts`) gates every page behind Supabase Auth using the Next.js 16 Proxy convention (previously called Middleware).
