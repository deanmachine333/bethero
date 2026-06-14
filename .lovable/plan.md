# BetHero Refactor Plan

## 1. Audit — what's actually wrong today

Looking at the current code:

- **`bets.import.tsx`** is a literal placeholder ("CSV import is being rebuilt…"). No parser, no preview, no insert. This is the single biggest gap.
- **CSV schema mismatch**: `src/lib/csv.ts` is written for an *internal* `CsvBetRow` shape (`DatePlaced, Bookie, Stake, IsFreeBet, Outcome, PairID…`). Your real BetHero export uses `SPORT, LEAGUE, EVENT, TIME, BET, BET TYPE, BOOK, STAKE, CURRENCY, ODDS, EV, CLV, FAIR ODDS, CURRENT FAIR ODDS, PROFILE, STATUS, PLACED, NOTES`. Nothing in the app understands that format.
- **No bookie auto-create**: nothing reads `BOOK` and reconciles to `accounts`. Accounts must be hand-typed in `/setup` first.
- **No "stake already in opening balance" flag** anywhere in schema, RPC, or UI. The `create_bet_with_ledger` RPC does already honour `stake_prefunded` (good) — but the importer never sets it, and there's no UI for it.
- **No arb grouping**: schema supports it (`bets_v2.bet_type='arb'` + multiple `bet_legs`), but the import has no logic to pair rows, and the bets page (`bets.tsx`) doesn't render arbs as 2-leg cards or compute best/worst case.
- **Arb projected profit is wrong on the dashboard**: `index.tsx` sums `legProjectedProfit` across all open legs — for an arb that double-counts as if both legs win. Needs scenario math per arb.
- **Free-bet UI**: schema + `leg_return()` SQL handle SNR/SR correctly, but there's no toggle in manual entry or import review.
- **Transfers**: RPC supports bookie→bank, bank→bookie, deposit, withdrawal — but bookie→bookie is two manual steps. Needs a single guided flow that writes two `transfer_group_id`-linked pairs via bank.
- **Accounts page** is minimal (per file list); needs balance / open exposure / available / realised P/L per bookie, card layout.
- **Dashboard**: KPIs are okay but "projected" is wrong for arbs; no upcoming-bets section, no per-bookie totals, recent activity is ledger-only (no bet context).
- **History page** has no filters.
- **Login restriction** (`djpotter333@hotmail.com` only): `handle_new_user` already flags `is_owner`, but `/auth` doesn't actually block other emails. Need a gate.

## 2. Data model changes (small, additive)

Schema is mostly right. Only deltas needed:

- `bets_v2`: add `event_time TIMESTAMPTZ NULL` (kickoff, distinct from `date_placed`), `sport TEXT`, `league TEXT`, `ev_pct NUMERIC`, `clv_pct NUMERIC`, `fair_odds NUMERIC`, `source TEXT` (`'manual'|'csv'`), `external_ref TEXT` (for idempotent re-imports).
- `bet_legs`: already has `stake_prefunded` — keep. Add `market TEXT` (the "BET" text for that leg).
- New RPC `import_bets_batch(p_rows jsonb)` that: dedupes by `external_ref`, creates missing bookies, groups arb pairs, writes bets + legs + ledger in one transaction.
- New RPC `transfer_bookie_to_bookie(p_from uuid, p_to uuid, p_bank uuid, p_amount numeric, p_when, p_memo)` that writes 4 ledger entries with one shared `transfer_group_id`.
- Unique index `(user_id, external_ref)` on `bets_v2` so re-imports are idempotent.

## 3. Implementation phases

### Phase A — schema + owner gate (1 migration)
- Migration: columns above, indexes, RPCs, owner-only auth trigger that blocks signups other than `djpotter333@hotmail.com`.
- `/auth` page: also reject non-owner sign-ins client-side with clear message.

### Phase B — CSV import (the core ask)
- Rewrite `src/lib/csv.ts` around the real BetHero columns. PapaParse with `header:true, skipEmptyLines:'greedy'`, then:
  - Strip repeated header rows (rows where `BOOK === 'BOOK'`).
  - Normalize: trim, collapse whitespace, lowercase keys, parse `STAKE`/`ODDS`/`EV`/`CLV` tolerating `nan`, `-`, blanks, `£`/`$`.
  - Map `BET TYPE`: `+ev` → `ev`, `arbitrage`/`arb` → `arb`.
  - Map `STATUS`: `pending|open` → `open`; `won|win` → `win`; `lost|loss` → `loss`; `void|push|cancelled` → `void`.
  - Parse `PLACED` and `TIME` with `date-fns` (tolerant fallbacks).
  - Free-bet detection: scan `NOTES`/`BET` for `free bet`, `fb`, `snr`, `sr`; default off, user can toggle per row.
- Arb grouping heuristic: rows with `bet_type='arb'` matched on `(EVENT normalized, TIME within ±5min, PLACED within ±10min)` and different `BOOK`; surface ungrouped arb singletons as warnings.
- New `/bets/import` page with 3 steps:
  1. **Upload** (drop CSV).
  2. **Review**: table of parsed rows, editable: bookie mapping (dropdown of existing accounts + "create new"), free-bet toggle + SNR/SR, "stake already in opening balance" toggle (default ON for open bets), arb-pair grouping (drag/swap or merge buttons), status, outcome.
  3. **Confirm & import**: posts to `import_bets_batch`. Shows per-row result (created / skipped / error).
- Idempotent via deterministic `external_ref = sha1(PLACED|BOOK|EVENT|BET|STAKE|ODDS)`.

### Phase C — guided transfers
- `transfers.tsx`: tabs for **Deposit**, **Withdraw**, **Bank ↔ Bookie**, **Bookie → Bookie (via bank)**, **External top-up**.
- Bookie → Bookie: one form (From, To, Amount, Date, Memo). Calls new RPC. Shows the 4-leg breakdown as a preview before submit.

### Phase D — dashboard + accounts + bets pages
- **Dashboard**: fix arb projection — group open legs by `bet_id`; for EV bets sum `legProjectedProfit`; for arbs compute `bestCase` / `worstCase` per bet then sum separately. New KPIs: Open EV projected, Arb worst-case, Arb best-case, Realised P/L. Add "Upcoming bets" list grouped by day (uses `event_time`). Per-bookie totals strip.
- **Accounts**: card grid — balance, open exposure (sum of open cash leg stakes), available (= balance, since prefunded stakes aren't deducted), realised P/L, min threshold warning. Sort by balance / name. Click → drawer with recent activity.
- **Bets page**: separate "Open" vs "Settled" tabs; arb rows render as a single card with both legs side-by-side, showing `If A wins → £X`, `If B wins → £Y`, and Best/Worst chips. Inline settle.
- **History page**: filters (date range, status, bookie, ev/arb, cash/free, type=bet/transfer/deposit/withdrawal).

### Phase E — analytics polish
- ROI by month, by bookie, by bet type. Cumulative bankroll line already exists — keep, add markers for deposits/withdrawals.

## 4. Out of scope / explicit non-goals

- No multi-user. Only `djpotter333@hotmail.com`.
- No live odds feeds, no scrapers, no settling automation.
- No mobile app — responsive web only.
- No currency conversion (assume GBP unless `CURRENCY` says otherwise; store as-is, display per-account currency).

## 5. Technical notes

- All mutations go through SQL `SECURITY DEFINER` RPCs that own ledger writes — never insert into `ledger_entries` from the client except for the opening-balance flow already in place.
- `external_ref` makes the importer safe to re-run.
- Arb best/worst calc lives in `src/lib/ledger.ts` as a pure function so dashboard, bets page, and import preview share it.
- All new server work uses TanStack `createServerFn` only where needed (most logic is direct RPC from the browser, which is fine because RPCs are `SECURITY DEFINER` + scoped to `auth.uid()`).

---

If this matches what you want I'll start with **Phase A migration** (it has to land and be approved before the rest compiles against the new columns), then ship B → E.