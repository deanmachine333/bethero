
# Bookie Wallet & Bet Tracker — MVP Plan

## Scope decisions (locked from your answers)
- **Single-user, no login.** No auth, no RLS gating by user. All routes public to you.
- **Your existing Supabase project** (not Lovable Cloud). You'll connect it via the Supabase integration in Lovable so the app gets `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. All DB access goes through TanStack server functions using the admin client (since there's no user to scope by).
- **Native currency only.** Each bookie has its own currency; P/L totals shown per currency. No FX conversion.
- **Deferred:** demo video, unit tests, 2FA, field-level encryption.

## Database schema (migrations against your Supabase)

```text
bookies
  id (uuid pk), name (unique), country, currency (text, 3-letter),
  opening_balance numeric, min_threshold numeric, notes, created_at

bets
  id (uuid pk), date_placed timestamptz, bookie_id fk, event, market,
  stake numeric, currency text, odds numeric, type text ('EV+'|'Arb'|'Other'),
  pair_id text null, is_free_bet bool, outcome text ('open'|'win'|'loss'|'void'|'half_win'|'half_loss'|'push'),
  return numeric, clv numeric, notes, created_at, updated_at

transfers
  id (uuid pk), from_bookie_id fk null, to_bookie_id fk null,
  amount numeric, currency text,
  withdraw_date date null, bank_cleared_date date null, deposit_date date null,
  status text ('planned'|'withdrawn'|'bank_cleared'|'deposited'),
  reference text, notes, created_at, updated_at

bank_ledger
  id (uuid pk), date date, direction text ('in'|'out'),
  amount numeric, currency text, from_label text, to_label text,
  reference text, transfer_id fk null, running_balance numeric

audit_log
  id (uuid pk), entity_type text, entity_id uuid, action text ('create'|'update'|'delete'|'import'),
  field text null, old_value jsonb, new_value jsonb, actor text default 'me', created_at
```

`current_balance` and `Pair` are **derived** (computed in views/server fns), not stored — keeps math honest and avoids drift.

## Derived calculations (server-side)

- **Free bet return** stored as `stake * (odds - 1)` when outcome=win and `is_free_bet=true`.
- **Bookie current balance** (per currency):
  `opening_balance + Σ(deposits to this bookie) − Σ(withdrawals from this bookie) + Σ(settled returns) − Σ(stakes on open bets, excluding free-bet stakes) − open_risk_buffer`
- **Pair P/L**: group bets by `pair_id`, `Σ(returns) − Σ(non-free-bet stakes)`.
- **Void risk flag**: any leg in pair with `outcome='void'` while others still `open`, or pair partially settled with negative projected P/L.

## App structure (TanStack Start, single-page sections via routes)

```text
src/routes/
  index.tsx              → Dashboard: alerts, per-currency totals, quick links
  bets.tsx               → Bet Ledger (filters, inline edit outcome + free bet)
  bets.import.tsx        → CSV import wizard (preview → upsert/overwrite)
  pairs.tsx              → Pair Reconciliation (expandable rows)
  bookies.tsx            → Book Accounts (balances, edit opening/min)
  transfers.tsx          → Transfers Plan + workflow actions
  bank.tsx               → Bank Ledger (running balance)
  audit.tsx              → Audit trail (filter by entity)
  api/public/import-bets.ts → optional POST endpoint (documented)
```

Server functions in `src/lib/*.functions.ts`:
- `bets.functions.ts` — list, upsert, updateOutcome, toggleFreeBet, exportCsv, importCsv
- `bookies.functions.ts` — list (with computed balances), upsert
- `pairs.functions.ts` — list pairs with computed P/L + void risk
- `transfers.functions.ts` — list, create, advanceStatus (writes bank_ledger rows on transitions)
- `audit.functions.ts` — list
- `alerts.functions.ts` — low balance, void risk, pending transfer >3 days

Every write also inserts an `audit_log` row.

## CSV import behavior
- Upload → parse with PapaParse client-side → preview table with row-level validation errors.
- Mode: **Upsert** (default, dedupe key = `date_placed + bookie + event + market + stake + odds`) or **Overwrite** (truncate + insert).
- Auto-creates missing `bookies` by name (with currency from row).
- Logs one `audit_log` row per inserted/updated bet plus one `import` summary row.
- Sample CSV header matches your brief exactly.

## Transfer workflow
Status transitions write bank ledger entries:
- `Planned → Withdrawn`: bank_ledger `in` from bookie (date = withdraw_date).
- `Withdrawn → Bank Cleared`: stamp date, no ledger row (already counted).
- `Bank Cleared → Deposited`: bank_ledger `out` to bookie (date = deposit_date).
Running balance recomputed on read, ordered by date.

## Alerts (dashboard cards)
- Bookies where `current_balance < min_threshold`.
- Pairs flagged void risk.
- Transfers where `status != 'deposited'` and `withdraw_date < now - 3 days`.

## UI/UX
- shadcn/ui tables, sortable columns, filter bar (date range, bookie, type, outcome, free bet).
- Negative P/L red, positive green (semantic tokens added to `styles.css`).
- Pair rows expand to show legs.
- Mobile: bookie balances rendered as cards; sticky "Add bet" FAB opening a modal.
- CSV export buttons on Bets and Transfers pages.

## What you need to do
1. Connect your Supabase project to this Lovable project (Integrations → Supabase). I cannot do that step.
2. After connection, I'll run migrations and a seed script that loads a handful of demo bookies, the sample CSV row, one arb pair, and one in-flight transfer.

## Deliverables in this build
- Full app code + Supabase migrations + seed server function.
- README with run steps, schema overview, and CSV format.
- One-page in-app user guide (`/help` route) covering import, free bets, transfers.
- API doc snippet for `POST /api/public/import-bets`.

## Explicitly NOT in this build
- Auth, 2FA, encryption at rest beyond Supabase defaults.
- Multi-currency conversion / FX rates.
- Unit tests and recorded video walkthrough.
- Real-time sync between tabs (refetch on focus only).

Approve and I'll build it. After you approve, please connect your Supabase project before I start so migrations can run on first pass.
