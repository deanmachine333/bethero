
-- ===== Phase 1: editability, audit, and idempotent import =====

-- 1. Tracking columns on bets_v2 / bet_legs
ALTER TABLE public.bets_v2
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_manual_edit_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_overridden_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.bet_legs
  ADD COLUMN IF NOT EXISTS last_manual_edit_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_overridden_fields text[] NOT NULL DEFAULT '{}';

-- backfill imported_at for rows already marked as csv-sourced
UPDATE public.bets_v2 SET imported_at = created_at
  WHERE imported_at IS NULL AND source = 'csv';

-- 2. transfer_imports (idempotency for transfer CSV)
CREATE TABLE IF NOT EXISTS public.transfer_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  import_key text NOT NULL,
  transfer_group_id uuid,
  source text NOT NULL DEFAULT 'csv',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, import_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_imports TO authenticated;
GRANT ALL ON public.transfer_imports TO service_role;

ALTER TABLE public.transfer_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own transfer imports"
  ON public.transfer_imports
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. bet_import_log (audit trail)
CREATE TABLE IF NOT EXISTS public.bet_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bet_id uuid,
  external_ref text,
  action text NOT NULL,           -- 'created' | 'skipped' | 'updated' | 'conflict' | 'archived'
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.bet_import_log TO authenticated;
GRANT ALL ON public.bet_import_log TO service_role;

ALTER TABLE public.bet_import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own bet import log"
  ON public.bet_import_log
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===== Helper: reverse the ledger effects of a single leg =====
-- Inserts offsetting entries instead of deleting history, tagged import_reconcile.
CREATE OR REPLACE FUNCTION public.reverse_leg_ledger(p_leg_id uuid, p_memo text DEFAULT 'reconcile')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_entry RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  FOR v_entry IN
    SELECT * FROM public.ledger_entries
     WHERE bet_leg_id = p_leg_id
       AND user_id = v_user
       AND entry_type IN ('bet_stake','bet_settlement','free_bet_settlement')
  LOOP
    INSERT INTO public.ledger_entries
      (user_id, account_id, occurred_at, amount, entry_type, bet_leg_id, memo)
    VALUES
      (v_user, v_entry.account_id, now(), -v_entry.amount,
       'import_reconcile', p_leg_id, p_memo);
  END LOOP;
END $$;

-- ===== Helper: re-apply the ledger effects of a single leg =====
CREATE OR REPLACE FUNCTION public.apply_leg_ledger(p_leg_id uuid, p_occurred_at timestamptz, p_memo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_leg public.bet_legs%ROWTYPE;
  v_ret numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_leg FROM public.bet_legs WHERE id = p_leg_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'leg not found'; END IF;

  IF NOT v_leg.is_free_bet AND NOT v_leg.stake_prefunded THEN
    INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, bet_leg_id, memo)
    VALUES (v_user, v_leg.account_id, p_occurred_at, -v_leg.stake, 'bet_stake', p_leg_id, p_memo);
  END IF;

  IF v_leg.outcome <> 'open' THEN
    v_ret := public.leg_return(v_leg.stake, v_leg.odds, v_leg.is_free_bet, v_leg.free_bet_type, v_leg.outcome);
    IF v_ret > 0 THEN
      INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, bet_leg_id, memo)
      VALUES (v_user, v_leg.account_id, COALESCE(v_leg.settled_at, p_occurred_at), v_ret,
              CASE WHEN v_leg.is_free_bet THEN 'free_bet_settlement' ELSE 'bet_settlement' END,
              p_leg_id, p_memo);
    END IF;
  END IF;
END $$;

-- ===== update_bet_with_ledger =====
-- Reconciles ledger by reversing existing leg entries and re-applying with the new state.
CREATE OR REPLACE FUNCTION public.update_bet_with_ledger(
  p_bet_id uuid,
  p_bet jsonb,
  p_legs jsonb,
  p_mark_manual boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_leg jsonb;
  v_leg_id uuid;
  v_legno int;
  v_existing_ids uuid[];
  v_incoming_ids uuid[] := '{}';
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bets_v2 WHERE id = p_bet_id AND user_id = v_user) THEN
    RAISE EXCEPTION 'bet not found';
  END IF;

  -- update parent bet
  UPDATE public.bets_v2 SET
    bet_type = COALESCE(p_bet->>'bet_type', bet_type),
    event = COALESCE(p_bet->>'event', event),
    market = COALESCE(p_bet->>'market', market),
    notes = COALESCE(p_bet->>'notes', notes),
    date_placed = COALESCE(NULLIF(p_bet->>'date_placed','')::timestamptz, date_placed),
    event_time = COALESCE(NULLIF(p_bet->>'event_time','')::timestamptz, event_time),
    sport = COALESCE(p_bet->>'sport', sport),
    league = COALESCE(p_bet->>'league', league),
    last_manual_edit_at = CASE WHEN p_mark_manual THEN now() ELSE last_manual_edit_at END
  WHERE id = p_bet_id;

  -- existing leg ids
  SELECT array_agg(id) INTO v_existing_ids FROM public.bet_legs WHERE bet_id = p_bet_id;

  v_legno := 0;
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    v_legno := v_legno + 1;
    v_leg_id := NULLIF(v_leg->>'id','')::uuid;

    IF v_leg_id IS NULL THEN
      -- new leg
      INSERT INTO public.bet_legs (
        bet_id, user_id, leg_number, account_id, selection, odds, stake,
        is_free_bet, free_bet_type, outcome, stake_prefunded, settled_at, market,
        last_manual_edit_at
      ) VALUES (
        p_bet_id, v_user, v_legno,
        (v_leg->>'account_id')::uuid,
        v_leg->>'selection',
        COALESCE((v_leg->>'odds')::numeric, 1),
        COALESCE((v_leg->>'stake')::numeric, 0),
        COALESCE((v_leg->>'is_free_bet')::boolean, false),
        NULLIF(v_leg->>'free_bet_type',''),
        COALESCE(v_leg->>'outcome','open'),
        COALESCE((v_leg->>'stake_prefunded')::boolean, false),
        CASE WHEN COALESCE(v_leg->>'outcome','open') <> 'open' THEN now() END,
        v_leg->>'market',
        CASE WHEN p_mark_manual THEN now() END
      ) RETURNING id INTO v_leg_id;

      PERFORM public.apply_leg_ledger(v_leg_id, now(), 'leg added');
    ELSE
      -- existing leg: reverse old ledger, update, re-apply
      PERFORM public.reverse_leg_ledger(v_leg_id, 'leg edited');

      UPDATE public.bet_legs SET
        leg_number = v_legno,
        account_id = (v_leg->>'account_id')::uuid,
        selection = v_leg->>'selection',
        odds = COALESCE((v_leg->>'odds')::numeric, odds),
        stake = COALESCE((v_leg->>'stake')::numeric, stake),
        is_free_bet = COALESCE((v_leg->>'is_free_bet')::boolean, is_free_bet),
        free_bet_type = NULLIF(v_leg->>'free_bet_type',''),
        outcome = COALESCE(v_leg->>'outcome', outcome),
        stake_prefunded = COALESCE((v_leg->>'stake_prefunded')::boolean, stake_prefunded),
        market = COALESCE(v_leg->>'market', market),
        settled_at = CASE WHEN COALESCE(v_leg->>'outcome', outcome) = 'open' THEN NULL ELSE COALESCE(settled_at, now()) END,
        last_manual_edit_at = CASE WHEN p_mark_manual THEN now() ELSE last_manual_edit_at END
      WHERE id = v_leg_id AND user_id = v_user;

      PERFORM public.apply_leg_ledger(v_leg_id, now(), 'leg edited');
    END IF;

    v_incoming_ids := v_incoming_ids || v_leg_id;
  END LOOP;

  -- remove legs no longer present
  IF v_existing_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_existing_ids LOOP
      IF NOT (v_id = ANY(v_incoming_ids)) THEN
        PERFORM public.reverse_leg_ledger(v_id, 'leg removed');
        DELETE FROM public.bet_legs WHERE id = v_id AND user_id = v_user;
      END IF;
    END LOOP;
  END IF;

  -- recompute bet status
  UPDATE public.bets_v2 b SET status =
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.bet_legs WHERE bet_id = b.id AND outcome = 'open')
         THEN 'settled' ELSE 'open' END
   WHERE id = p_bet_id;

  RETURN p_bet_id;
END $$;

-- ===== archive_bet: soft delete with ledger reversal =====
CREATE OR REPLACE FUNCTION public.archive_bet(p_bet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_leg uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bets_v2 WHERE id = p_bet_id AND user_id = v_user) THEN
    RAISE EXCEPTION 'bet not found';
  END IF;

  FOR v_leg IN SELECT id FROM public.bet_legs WHERE bet_id = p_bet_id AND user_id = v_user LOOP
    PERFORM public.reverse_leg_ledger(v_leg, 'bet archived');
  END LOOP;

  UPDATE public.bets_v2 SET is_archived = true, status = 'archived' WHERE id = p_bet_id;
END $$;

-- ===== update_account_with_correction =====
CREATE OR REPLACE FUNCTION public.update_account_with_correction(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_min_threshold numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_target_balance numeric DEFAULT NULL,
  p_memo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current numeric;
  v_delta numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_id AND user_id = v_user) THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  UPDATE public.accounts SET
    name = COALESCE(p_name, name),
    currency = COALESCE(p_currency, currency),
    is_active = COALESCE(p_is_active, is_active),
    min_threshold = COALESCE(p_min_threshold, min_threshold),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_id;

  IF p_target_balance IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_current
      FROM public.ledger_entries WHERE account_id = p_id AND user_id = v_user;
    v_delta := p_target_balance - v_current;
    IF v_delta <> 0 THEN
      INSERT INTO public.ledger_entries (user_id, account_id, amount, entry_type, memo, occurred_at)
      VALUES (v_user, p_id, v_delta, 'manual_correction',
              COALESCE(p_memo, 'Balance correction'), now());
    END IF;
  END IF;

  RETURN p_id;
END $$;

-- ===== update_transfer_group (memo/date only safe path) =====
CREATE OR REPLACE FUNCTION public.update_transfer_group(
  p_group_id uuid,
  p_memo text DEFAULT NULL,
  p_when timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.ledger_entries
     SET memo = COALESCE(p_memo, memo),
         occurred_at = COALESCE(p_when, occurred_at)
   WHERE transfer_group_id = p_group_id AND user_id = v_user;
  RETURN p_group_id;
END $$;

-- ===== reverse_transfer_group =====
CREATE OR REPLACE FUNCTION public.reverse_transfer_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM public.ledger_entries
   WHERE transfer_group_id = p_group_id AND user_id = v_user;
  DELETE FROM public.transfer_imports
   WHERE transfer_group_id = p_group_id AND user_id = v_user;
END $$;

-- ===== import_transfers_batch =====
-- Each row: { import_key, type: 'deposit'|'withdrawal'|'transfer', from_account_id, to_account_id, amount, when, memo }
-- Group rows: { import_key, type: 'group', from_account_id, bank_account_id, to_account_id, amount, when, memo }
CREATE OR REPLACE FUNCTION public.import_transfers_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row jsonb;
  v_key text;
  v_group uuid;
  v_type text;
  v_amount numeric;
  v_when timestamptz;
  v_memo text;
  v_from uuid;
  v_to uuid;
  v_bank uuid;
  v_created int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      v_key := v_row->>'import_key';
      IF v_key IS NULL OR length(v_key) = 0 THEN
        v_errors := v_errors || jsonb_build_object('error','missing import_key');
        CONTINUE;
      END IF;

      IF EXISTS (SELECT 1 FROM public.transfer_imports WHERE user_id = v_user AND import_key = v_key) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_type := v_row->>'type';
      v_amount := COALESCE((v_row->>'amount')::numeric, 0);
      v_when := COALESCE(NULLIF(v_row->>'when','')::timestamptz, now());
      v_memo := v_row->>'memo';
      v_from := NULLIF(v_row->>'from_account_id','')::uuid;
      v_to := NULLIF(v_row->>'to_account_id','')::uuid;
      v_bank := NULLIF(v_row->>'bank_account_id','')::uuid;

      IF v_type = 'deposit' THEN
        v_group := public.create_transfer_with_ledger(NULL, v_to, v_amount, v_when, v_memo);
      ELSIF v_type = 'withdrawal' THEN
        v_group := public.create_transfer_with_ledger(v_from, NULL, v_amount, v_when, v_memo);
      ELSIF v_type = 'transfer' THEN
        v_group := public.create_transfer_with_ledger(v_from, v_to, v_amount, v_when, v_memo);
      ELSIF v_type = 'group' THEN
        v_group := public.transfer_bookie_to_bookie(v_from, v_to, v_bank, v_amount, v_when, v_memo);
      ELSE
        v_errors := v_errors || jsonb_build_object('import_key', v_key, 'error','unknown type');
        CONTINUE;
      END IF;

      INSERT INTO public.transfer_imports (user_id, import_key, transfer_group_id, notes)
      VALUES (v_user, v_key, v_group, v_memo);

      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('import_key', v_key, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'errors', v_errors);
END $$;

-- ===== reimport_bet =====
-- p_incoming is the same shape as a bet payload row (with legs[]).
-- p_overwrite_fields lists which bet/leg fields to take from CSV; others preserved.
CREATE OR REPLACE FUNCTION public.reimport_bet(
  p_bet_id uuid,
  p_incoming jsonb,
  p_overwrite_fields text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_patch jsonb := '{}'::jsonb;
  v_legs jsonb;
  v_leg jsonb;
  v_new_legs jsonb := '[]'::jsonb;
  v_existing RECORD;
  v_idx int := 0;
  v_merged jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF 'event' = ANY(p_overwrite_fields) THEN v_patch := v_patch || jsonb_build_object('event', p_incoming->>'event'); END IF;
  IF 'market' = ANY(p_overwrite_fields) THEN v_patch := v_patch || jsonb_build_object('market', p_incoming->>'market'); END IF;
  IF 'notes' = ANY(p_overwrite_fields) THEN v_patch := v_patch || jsonb_build_object('notes', p_incoming->>'notes'); END IF;
  IF 'bet_type' = ANY(p_overwrite_fields) THEN v_patch := v_patch || jsonb_build_object('bet_type', p_incoming->>'bet_type'); END IF;

  v_legs := p_incoming->'legs';

  FOR v_existing IN
    SELECT * FROM public.bet_legs WHERE bet_id = p_bet_id AND user_id = v_user ORDER BY leg_number
  LOOP
    v_idx := v_idx + 1;
    v_leg := v_legs->(v_idx-1);

    v_merged := jsonb_build_object(
      'id', v_existing.id,
      'account_id', v_existing.account_id,
      'selection', v_existing.selection,
      'odds', v_existing.odds,
      'stake', v_existing.stake,
      'is_free_bet', v_existing.is_free_bet,
      'free_bet_type', v_existing.free_bet_type,
      'outcome', v_existing.outcome,
      'stake_prefunded', v_existing.stake_prefunded,
      'market', v_existing.market
    );

    IF v_leg IS NOT NULL THEN
      IF 'stake' = ANY(p_overwrite_fields) THEN v_merged := v_merged || jsonb_build_object('stake', v_leg->'stake'); END IF;
      IF 'odds' = ANY(p_overwrite_fields) THEN v_merged := v_merged || jsonb_build_object('odds', v_leg->'odds'); END IF;
      IF 'outcome' = ANY(p_overwrite_fields) THEN v_merged := v_merged || jsonb_build_object('outcome', v_leg->>'outcome'); END IF;
      IF 'is_free_bet' = ANY(p_overwrite_fields) THEN v_merged := v_merged || jsonb_build_object('is_free_bet', v_leg->'is_free_bet', 'free_bet_type', v_leg->>'free_bet_type'); END IF;
      IF 'stake_prefunded' = ANY(p_overwrite_fields) THEN v_merged := v_merged || jsonb_build_object('stake_prefunded', v_leg->'stake_prefunded'); END IF;
    END IF;

    v_new_legs := v_new_legs || v_merged;
  END LOOP;

  PERFORM public.update_bet_with_ledger(p_bet_id, v_patch, v_new_legs, false);

  INSERT INTO public.bet_import_log (user_id, bet_id, external_ref, action, diff)
  VALUES (v_user, p_bet_id, p_incoming->>'external_ref', 'updated',
          jsonb_build_object('overwrote', to_jsonb(p_overwrite_fields)));

  RETURN p_bet_id;
END $$;
