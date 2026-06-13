# BetHero Refactor — Ledger-Based Bankroll Tracker

## 1. Audit Summary (current repo)

Reading the codebase, the core issues are:

- **No ledger.** `bookies.opening_balance` is a stored editable number; balances are recomputed ad-hoc in `deriveBookieBalances` by mixing `opening_balance + transfers + settled returns − settled stakes − open stakes`. Any edit to `opening_balance` silently rewrites history.
- **Transfers are a single row** (`from_bookie_id` → `to_bookie_id`) with a "status" lifecycle and a separate `bank_ledger` table that's only partially wired. Bank balance isn't a first-class account.
- **Bets store a `return` number** that's been recomputed by ad-hoc SQL backfills. There's no link from a bet to the cash movements it caused, so reconciliation is impossible.
- **No concept of "stake already accounted for"** — so importing today's open bets against today's live balance double-counts.
- **Arb bets** are modelled by a free-text `pair_id` on `bets`. No enforced 2-leg structure, no per-leg free-bet flags, no linked settlement.
- **Free bets** only have an `is_free_bet` boolean — no SNR vs SR distinction, so returns are wrong for SR free bets.
- **No auth.** App is single-user but world-open via permissive RLS (`using: true`).
- **CSV import** mutates bet rows directly and has had repeated status-mapping bugs because there's no single source of truth for outcome → cash effect.
- **Dashboard/Bookies math** is duplicated across `calc.ts`, `queries.ts`, and route files.

## 2. Proposed Supabase Schema

New, ledger-first model. Old tables (`bookies`, `bets`, `transfers`, `bank_ledger`, `audit_log`) are migrated, not dropped, so existing data can be backfilled.

```text
accounts                       -- bookies + the single bank/transit account
  id, name, kind ('bookie'|'bank'), currency,
  colour, icon, is_active, min_threshold, notes,
  user_id, created_at, updated_at

bets
  id, user_id, date_placed, bet_type ('ev'|'arb'),
  status ('open'|'settled'|'void'),
  event, market, notes, tags text[],
  created_at, updated_at
  -- NO stake/odds/return here; those live on legs

bet_legs
  id, bet_id, leg_number,
  account_id (bookie), selection, odds, stake,
  is_free_bet, free_bet_type ('snr'|'sr'|null),
  outcome ('open'|'win'|'loss'|'void'|'half_win'|'half_loss'|'push'),
  stake_prefunded boolean default false,   -- "already in opening balance"
  settled_at, created_at, updated_at

ledger_entries                 -- the single source of truth for money
  id, user_id, account_id, occurred_at,
  amount numeric,              -- signed: + credit, − debit on this account
  entry_type (
    'opening_balance' | 'deposit' | 'withdrawal' |
    'transfer_out' | 'transfer_in' |
    'bet_stake' | 'bet_settlement' | 'free_bet_settlement' |
    'manual_correction'
  ),
  transfer_group_id uuid,      -- pairs the two legs of a transfer
  bet_leg_id uuid,             -- links stake/settlement back to the leg
  memo, created_at

audit_log (kept)
```

Invariant: **every account's balance = sum(ledger_entries.amount where account_id = X)**. No stored balances anywhere.

RLS: all tables scoped to `auth.uid() = user_id`. Single allow-listed user (`djpotter333@hotmail.com`) — anyone else can sign up but sees no data (and we'll gate the auth page to email-only sign-in for this address).

## 3. Implementation Phases

**Phase A — Auth + schema**
- Add Supabase email/password auth, `/auth` route, integration-managed `_authenticated` gate, all app routes moved under it.
- Migration: create `accounts`, `bets_v2`, `bet_legs`, `ledger_entries`. RLS by `user_id`. GRANTs to `authenticated` + `service_role`.
- Backfill script (server fn, admin) to map existing `bookies`/`bets`/`transfers` into the new tables: opening_balance rows from current `bookies.opening_balance`, bet legs from `bets` (1 leg for EV+, grouped by `pair_id` for arb), ledger entries for stakes/settlements/transfers.

**Phase B — Ledger engine**
- `src/lib/ledger.ts`: pure helpers `accountBalance`, `openExposure`, `availableBalance`, `realisedPL`, `projectedPL`, `freeBetValueExtracted`.
- `src/lib/bets.functions.ts`: `createBet`, `settleBetLeg`, `voidBet` — each writes bet/leg rows AND the matching `ledger_entries` atomically. `stake_prefunded=true` skips the `bet_stake` entry.
- `src/lib/transfers.functions.ts`: `createTransfer(from, to, amount)` always writes 2 ledger entries sharing a `transfer_group_id`; bookie↔bank is one transfer, bookie↔bookie is two transfers via bank.
- Remove all balance math from routes; everything reads from these helpers.

**Phase C — Setup wizard** (`/setup`)
- Gated: shown when user has 0 accounts. Steps as specified (bookies → bank → open bets → review → confirm). Open-bet import defaults `stake_prefunded=true`.

**Phase D — Refactored UI**
- Dashboard: total bankroll, breakdown chart, open exposure, projected vs realised P/L, recent activity, quick-add buttons.
- Bookies: card-first with Available / Exposure / P/L / quick actions; table toggle.
- Bets: filters, arb legs grouped, quick-settle drawer, free-bet badges (SNR/SR).
- Transfers: guided flow (source → amount → destination, bank auto-routes).
- History: unified ledger + bets feed with filters and CSV export.
- Analytics: realised vs projected, ROI, by-bookie, by-type, free-bet value, bankroll-over-time, monthly summary.

**Phase E — Bet entry UX**
- Quick EV+ form, quick Arb form (2 legs side-by-side), live projected-profit preview, free-bet toggle + type, remembered last bookie, duplicate-bet action.

**Phase F — Seed + polish**
- Seed server fn (admin, owner-only) inserts the requested demo data into the signed-in owner account.
- Dark/light theme pass, mobile breakpoints, badges/colour coding.
- Remove dead code: old `bank_ledger` table, old `transfers` table, old CSV-import status-mapping branches once backfill is verified.

## 4. Technical Notes

- Stack stays Vite + TanStack Start + Supabase.
- Auth: Supabase email/password. Owner email `djpotter333@hotmail.com` hard-allowed via a `profiles.is_owner` flag set by trigger when that email signs up; all RLS policies check `auth.uid() = user_id` so even if someone else signs up they see nothing.
- Server-side writes (bet create/settle, transfer create, backfill, seed) go through `createServerFn` with `requireSupabaseAuth` so the bet → ledger writes happen in one transaction via an RPC (`create_bet_with_ledger`, `settle_leg_with_ledger`, `create_transfer_with_ledger`).
- Existing CSV import is rewritten to call `createBet` per row with `stake_prefunded` configurable in the preview step.

## 5. What I need from you before I start

This is a large rebuild — roughly a full day of focused work and a meaningful credit spend. Before I touch code I want to confirm:

1. **OK to migrate existing data** into the new schema and then drop the old `bank_ledger` + `transfers` tables once verified? (Old `bookies`/`bets` rows are preserved by backfill.)
2. **Auth lockdown**: do you want the `/auth` page to *only* accept `djpotter333@hotmail.com` (reject other sign-ups at the UI), or allow sign-up but show empty data to anyone else? I recommend the first.
3. **Currency**: keep multi-currency-per-bookie as today, or collapse to a single base currency (GBP) for simpler analytics?
4. **Phase order**: ship Phase A+B (auth + ledger + backfill) first so your existing data is safe and reconciled, then iterate UI in follow-up turns? Or one big drop?

Reply with answers (or just "go, your call on all four") and I'll execute.
