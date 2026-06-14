# Plan: Working Import + Editable Bookie Balances

## What's already in place
- `/bets/import` route exists with a 3-step wizard (upload → review → import) wired to `parseBetheroCsv` + `import_bets_batch` RPC.
- Nav link "Import" is in the AppShell header.
- Accounts page only **creates** accounts — no edit, no balance adjustment.

The import page may be working, but you've reported it isn't. Before touching the wizard I'll actually upload your CSV in the preview browser and capture the failure.

## 1. Prove the import works (or find the bug)
- Open `/bets/import` in the preview browser, upload the BetHero CSV (or a sample I generate from the schema you shared), step through review, and click Import.
- Watch console + network for the `import_bets_batch` RPC response.
- If it fails, fix the root cause:
  - Common suspects: column header casing/spacing, date parsing on your specific format, RPC payload shape mismatch, bookie auto-create path, RLS on a new bookie insert.
  - Re-test until a fresh CSV upload results in: bets visible on `/bets`, ledger entries on `/accounts`, bookies auto-created where unmapped.
- Confirm re-uploading the same file shows `skipped` > 0 (idempotency via `external_ref`).

## 2. Make the Import action impossible to miss
- Add a prominent **"Import CSV"** button on:
  - Dashboard (`/`) — top-right next to KPIs
  - Bets page (`/bets`) — next to "Add bet"
- Keep the existing nav link.

## 3. Editable bookie/bank balances
- Add an **Edit** action on each account card on `/accounts`:
  - Rename / change min threshold / change currency / toggle active.
  - **Adjust balance**: dedicated section that writes a single `ledger_entries` row of type `adjustment` with the delta needed to reach the new target balance, plus a memo (required). This keeps balances ledger-derived — no destructive overwrites.
  - Optional **Archive** (sets `is_active = false`) instead of delete, so historical bets/ledger stay intact.
- Use the existing supabase client + invalidate `accounts` / `ledger` queries.

## 4. Verification pass (I will actually click through)
- Upload CSV → import succeeds → bets visible → balances updated.
- Re-upload same CSV → duplicates skipped.
- Edit a bookie name → reflected on Accounts + Bets.
- Adjust a bookie balance by +£50 → card shows new balance, ledger row appears in History.
- Mobile viewport: nav + Import button still reachable.

## Out of scope (say so explicitly)
- No changes to arb grouping heuristic, RPC signatures, or schema.
- No new analytics/dashboard widgets beyond the Import button placement.
- No bulk-edit of bets, no CSV column remapper UI (header aliases stay in code).

## Technical notes
- Balance adjustment uses `entry_type = 'adjustment'` in `ledger_entries` (already allowed by the schema's text column; no migration needed).
- Account edit is a direct `update accounts set ...` under RLS (`user_id = auth.uid()`), no new RPC.
- If import bug requires SQL changes (e.g. a fix to `import_bets_batch`), that goes in a follow-up migration — I'll flag before running it.
