# Comprehensive editability, re-import & transfer CSV plan

This is a large, multi-area change. To keep the ledger correct and the work auditable I'll ship it in **four phases**, each leaving the app working and tested. Please confirm and I'll start with Phase 1.

## Phase 1 — Schema & ledger reconciliation primitives

Database migration:
- `bets_v2`: add `imported_at`, `import_source`, `last_manual_edit_at timestamptz`, `manually_overridden_fields text[]`, `is_archived bool`.
- `bet_legs`: add `last_manual_edit_at`, `manually_overridden_fields text[]`.
- `ledger_entries`: extend `entry_type` check to allow `manual_correction` (already used) and `import_reconcile`.
- New table `transfer_imports(id, user_id, import_key unique, transfer_group_id, source, created_at)` for idempotent transfer re-import.
- New table `bet_import_log(id, user_id, external_ref, action, diff jsonb, created_at)` for audit trail.

New SECURITY DEFINER RPCs:
- `update_bet_with_ledger(p_bet_id, p_bet jsonb, p_legs jsonb, p_mark_manual bool)` — diffs legs vs current state and writes **only the delta** to the ledger: stake delta when stake/account/prefunded/free-bet flags change; revoke+rewrite settlement when outcome changes. Updates `last_manual_edit_at` and `manually_overridden_fields` when `p_mark_manual=true`.
- `reimport_bet(p_bet_id, p_incoming jsonb, p_overwrite_fields text[])` — same reconciliation path but only touches fields in `p_overwrite_fields` (preserves local edits otherwise).
- `archive_bet(p_bet_id)` — soft delete, reverses ledger via offset entries tagged `import_reconcile`.
- `update_account(p_id, p_patch jsonb, p_target_balance numeric, p_memo)` — single `manual_correction` entry for the delta; zero delta no-ops.
- `update_transfer_group(p_group_id, p_patch jsonb)` — safe path for memo/date; for amount/source/destination it reverses the group and recreates atomically.
- `import_transfers_batch(p_rows jsonb)` — handles inferred grouping, idempotency via `transfer_imports.import_key`.

## Phase 2 — Editability UI

- **Bet detail dialog** (`src/components/bet/BetDetailDialog.tsx`): full editor for bet + legs, add/remove legs (arbs), per-leg outcome quick actions, duplicate, archive. Shows linked account balances, projected vs realised, "edited" badge when `last_manual_edit_at` is set. Wires to `update_bet_with_ledger`.
- **Bet cards** become clickable; cards display the richer EV / arb worst-best-guaranteed summary.
- **Accounts edit dialog**: existing flow expanded with min-threshold, memo, recent ledger list for that account; uses `update_account` RPC.
- **Transfer history rows** clickable → dialog showing the full grouped entries; edit memo/date inline; amount/source/destination edits go through reverse-and-recreate with a clear confirm.
- **History items** clickable → drawer linking to source bet/transfer/account.

## Phase 3 — Idempotent re-import with conflict resolution

- `parseBetheroCsv` already produces a deterministic `external_ref`. Extend the import RPC: when an `external_ref` matches an existing bet, classify each cash-impacting field as `unchanged | csv_only | local_override` (using `manually_overridden_fields`). Return the diff to the client instead of skipping.
- New import review step **"Conflicts"** in `bets.import.tsx`: lists bets with diffs; for each one user picks Keep local / Replace from CSV / per-field toggle (stake, odds, outcome, free-bet, prefunded, account, notes). Default = keep local for any field present in `manually_overridden_fields`, otherwise replace.
- On confirm, client calls `reimport_bet` per conflicted bet with the chosen overwrite-field list. New bets go through existing `import_bets_batch`.
- Re-import preview shows estimated balance impact per account before commit.

## Phase 4 — Transfer CSV import (BetHero format)

- `src/lib/transfers-csv.ts`: parser for `BOOK, PROFILE, TYPE, AMOUNT, METHOD, TIME, NOTES`. Normalises names, parses dates, computes a per-row `import_key` (book|type|amount|time-rounded-to-minute|notes-hash).
- Grouping: rows within ±2 min sharing method/notes and summing to zero net (one withdrawal + matching deposits) → internal grouped transfer. Otherwise classify as external deposit/withdrawal.
- New route `src/routes/_authenticated/transfers.import.tsx`: upload → review table with per-row mapping to existing accounts, group preview, auto-create-bookie toggle, skip/edit.
- Commit calls `import_transfers_batch`, which uses existing `transfer_bookie_to_bookie` / `create_transfer_with_ledger` under the hood and records `transfer_imports` rows for idempotency.

## Phase 5 — Safety, polish, tests

- `accountAvailable` already subtracts prefunded exposure — extend to also block transfers when delta would overdraw; keep `manual_correction` exempt.
- Dashboard top summary + open arbs / EV+ sections wired to existing helpers; "imported / edited / reconciled" badges from new metadata.
- Vitest tests (`src/lib/__tests__/`):
  - `ledger-reconcile.test.ts` — stake delta, account move, free-bet flip, prefunded flip, outcome change, archive reversal.
  - `bet-import.test.ts` — stable key match, duplicate skip, conflict classification, keep-local vs overwrite.
  - `transfer-import.test.ts` — parse, normalise, group one-to-one, group one-to-many, unmatched deposit/withdrawal, re-import idempotency.
  - `accounts.test.ts` — zero-delta no-op, manual_correction write, available = balance − exposure, overdraw blocked.
- Toasts, GBP formatting, empty states, mobile-friendly dialogs throughout.

## Technical notes
- All ledger mutations stay inside SECURITY DEFINER RPCs so RLS + atomicity hold.
- Edits never mutate existing ledger rows; they insert offsetting + new entries tagged `import_reconcile` so history is preserved and auditable.
- Reverse-and-recreate is the only safe path for transfer amount/source changes; UI surfaces this explicitly.
- Test suite runs via `bunx vitest run`.

## Scope check before I start

This is roughly ~15 new/edited files plus 2 migrations and a meaningful test suite. It will consume significant credits. Two questions before I proceed:

1. **Phasing** — should I ship all 5 phases in one go, or pause for your review after Phase 1+2 (schema + editability) so you can sanity-check before re-import/transfer-import land?
2. **Conflict UI granularity** — per-field toggles (more work, more control) or per-bet Keep-local / Replace-all (faster, simpler)?
