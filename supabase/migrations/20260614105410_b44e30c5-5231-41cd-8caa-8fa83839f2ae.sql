-- Phase A: schema deltas + owner gate + new RPCs

-- 1. bets_v2 columns
ALTER TABLE public.bets_v2
  ADD COLUMN IF NOT EXISTS event_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sport TEXT,
  ADD COLUMN IF NOT EXISTS league TEXT,
  ADD COLUMN IF NOT EXISTS ev_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS clv_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS fair_odds NUMERIC,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS bets_v2_user_external_ref_uidx
  ON public.bets_v2 (user_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- 2. bet_legs columns
ALTER TABLE public.bet_legs
  ADD COLUMN IF NOT EXISTS market TEXT;

-- 3. Owner-only signup gate
CREATE OR REPLACE FUNCTION public.enforce_owner_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) <> 'djpotter333@hotmail.com' THEN
    RAISE EXCEPTION 'Sign-ups are restricted on this instance.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_owner_signup_trigger ON auth.users;
CREATE TRIGGER enforce_owner_signup_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_signup();

-- 4. Bookie -> Bookie transfer (via bank), 4 ledger entries, 1 group
CREATE OR REPLACE FUNCTION public.transfer_bookie_to_bookie(
  p_from uuid, p_to uuid, p_bank uuid, p_amount numeric,
  p_when timestamptz DEFAULT now(), p_memo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_group uuid := gen_random_uuid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_bank IS NULL THEN
    RAISE EXCEPTION 'from, to, and bank are all required';
  END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'from and to must differ'; END IF;

  -- leg 1: bookie out
  INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, transfer_group_id, memo)
  VALUES (v_user, p_from, p_when, -p_amount, 'transfer_out', v_group, COALESCE(p_memo, 'Bookie→Bookie via bank'));
  -- leg 2: bank in
  INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, transfer_group_id, memo)
  VALUES (v_user, p_bank, p_when + interval '1 ms', p_amount, 'transfer_in', v_group, COALESCE(p_memo, 'Bookie→Bookie via bank'));
  -- leg 3: bank out
  INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, transfer_group_id, memo)
  VALUES (v_user, p_bank, p_when + interval '2 ms', -p_amount, 'transfer_out', v_group, COALESCE(p_memo, 'Bookie→Bookie via bank'));
  -- leg 4: bookie in
  INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, transfer_group_id, memo)
  VALUES (v_user, p_to, p_when + interval '3 ms', p_amount, 'transfer_in', v_group, COALESCE(p_memo, 'Bookie→Bookie via bank'));

  RETURN v_group;
END $$;

-- 5. Batch CSV import RPC.
-- Input shape (jsonb array). Each element is either a single EV leg or an arb pair:
-- {
--   "external_ref": "sha1...",
--   "bet_type": "ev"|"arb",
--   "date_placed": "iso",
--   "event_time": "iso"|null,
--   "event": "...",
--   "market": "...",
--   "sport": "...", "league": "...",
--   "ev_pct": num|null, "clv_pct": num|null, "fair_odds": num|null,
--   "notes": "...",
--   "legs": [
--     { "bookie_name": "Bet365", "selection": "...", "odds": 1.9, "stake": 25,
--       "is_free_bet": false, "free_bet_type": null,
--       "stake_prefunded": true, "outcome": "open", "currency": "GBP" }
--   ]
-- }
CREATE OR REPLACE FUNCTION public.import_bets_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row jsonb;
  v_leg jsonb;
  v_bet_id uuid;
  v_leg_id uuid;
  v_account_id uuid;
  v_outcome text;
  v_ret numeric;
  v_ext text;
  v_legno int;
  v_created int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_status text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      v_ext := v_row->>'external_ref';

      IF v_ext IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.bets_v2 WHERE user_id = v_user AND external_ref = v_ext
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.bets_v2 (
        user_id, date_placed, bet_type, status, event, market, notes, tags,
        event_time, sport, league, ev_pct, clv_pct, fair_odds, source, external_ref
      ) VALUES (
        v_user,
        COALESCE((v_row->>'date_placed')::timestamptz, now()),
        v_row->>'bet_type',
        'open',
        v_row->>'event',
        v_row->>'market',
        v_row->>'notes',
        '{}',
        NULLIF(v_row->>'event_time','')::timestamptz,
        v_row->>'sport',
        v_row->>'league',
        NULLIF(v_row->>'ev_pct','')::numeric,
        NULLIF(v_row->>'clv_pct','')::numeric,
        NULLIF(v_row->>'fair_odds','')::numeric,
        'csv',
        v_ext
      ) RETURNING id INTO v_bet_id;

      v_legno := 0;
      FOR v_leg IN SELECT * FROM jsonb_array_elements(v_row->'legs')
      LOOP
        v_legno := v_legno + 1;

        -- resolve / create bookie
        SELECT id INTO v_account_id
          FROM public.accounts
         WHERE user_id = v_user
           AND kind = 'bookie'
           AND lower(name) = lower(v_leg->>'bookie_name')
         LIMIT 1;

        IF v_account_id IS NULL THEN
          INSERT INTO public.accounts (user_id, name, kind, currency)
          VALUES (v_user, v_leg->>'bookie_name', 'bookie', COALESCE(v_leg->>'currency','GBP'))
          RETURNING id INTO v_account_id;
        END IF;

        v_outcome := COALESCE(v_leg->>'outcome','open');

        INSERT INTO public.bet_legs (
          bet_id, user_id, leg_number, account_id, selection, odds, stake,
          is_free_bet, free_bet_type, outcome, stake_prefunded, settled_at, market
        ) VALUES (
          v_bet_id, v_user, v_legno, v_account_id,
          v_leg->>'selection',
          COALESCE((v_leg->>'odds')::numeric, 1),
          COALESCE((v_leg->>'stake')::numeric, 0),
          COALESCE((v_leg->>'is_free_bet')::boolean, false),
          NULLIF(v_leg->>'free_bet_type',''),
          v_outcome,
          COALESCE((v_leg->>'stake_prefunded')::boolean, false),
          CASE WHEN v_outcome <> 'open' THEN COALESCE((v_row->>'date_placed')::timestamptz, now()) END,
          v_leg->>'market'
        ) RETURNING id INTO v_leg_id;

        -- stake ledger (only if real cash AND not prefunded)
        IF NOT COALESCE((v_leg->>'is_free_bet')::boolean,false)
           AND NOT COALESCE((v_leg->>'stake_prefunded')::boolean,false) THEN
          INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, bet_leg_id, memo)
          VALUES (v_user, v_account_id,
                  COALESCE((v_row->>'date_placed')::timestamptz, now()),
                  -COALESCE((v_leg->>'stake')::numeric,0),
                  'bet_stake', v_leg_id, v_row->>'event');
        END IF;

        -- pre-settled rows
        IF v_outcome <> 'open' THEN
          v_ret := public.leg_return(
            COALESCE((v_leg->>'stake')::numeric,0),
            COALESCE((v_leg->>'odds')::numeric,1),
            COALESCE((v_leg->>'is_free_bet')::boolean,false),
            NULLIF(v_leg->>'free_bet_type',''),
            v_outcome
          );
          IF v_ret > 0 THEN
            INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, bet_leg_id, memo)
            VALUES (v_user, v_account_id,
                    COALESCE((v_row->>'date_placed')::timestamptz, now()),
                    v_ret,
                    CASE WHEN COALESCE((v_leg->>'is_free_bet')::boolean,false)
                         THEN 'free_bet_settlement' ELSE 'bet_settlement' END,
                    v_leg_id, v_row->>'event');
          END IF;
        END IF;
      END LOOP;

      -- update parent bet status
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM public.bet_legs WHERE bet_id = v_bet_id AND outcome = 'open'
      ) THEN 'settled' ELSE 'open' END INTO v_status;
      UPDATE public.bets_v2 SET status = v_status WHERE id = v_bet_id;

      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('external_ref', v_ext, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'errors', v_errors);
END $$;
