
-- =====================================================================
-- BetHero ledger-based refactor: Phase A schema
-- Adds: profiles, accounts (bookies + bank), bets_v2, bet_legs, ledger_entries
-- Backfills from existing bookies/bets/transfers
-- RLS by auth.uid() = user_id on every table
-- =====================================================================

-- --- profiles -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  is_owner boolean NOT NULL DEFAULT false,
  setup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read"   ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Auto-create profile on signup; flag owner email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_owner)
  VALUES (NEW.id, NEW.email, lower(NEW.email) = 'djpotter333@hotmail.com')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --- accounts (bookies + bank) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bookie','bank')),
  currency text NOT NULL DEFAULT 'GBP',
  colour text,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  min_threshold numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.accounts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX accounts_user_idx ON public.accounts(user_id);

-- --- bets_v2 ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bets_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_placed timestamptz NOT NULL DEFAULT now(),
  bet_type text NOT NULL CHECK (bet_type IN ('ev','arb')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','void')),
  event text NOT NULL,
  market text,
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bets_v2 TO authenticated;
GRANT ALL ON public.bets_v2 TO service_role;
ALTER TABLE public.bets_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bets" ON public.bets_v2 FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX bets_v2_user_idx ON public.bets_v2(user_id, date_placed DESC);

-- --- bet_legs -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bet_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL REFERENCES public.bets_v2(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leg_number int NOT NULL DEFAULT 1,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  selection text,
  odds numeric NOT NULL DEFAULT 1,
  stake numeric NOT NULL DEFAULT 0,
  is_free_bet boolean NOT NULL DEFAULT false,
  free_bet_type text CHECK (free_bet_type IN ('snr','sr')),
  outcome text NOT NULL DEFAULT 'open'
    CHECK (outcome IN ('open','win','loss','void','half_win','half_loss','push')),
  stake_prefunded boolean NOT NULL DEFAULT false,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bet_legs TO authenticated;
GRANT ALL ON public.bet_legs TO service_role;
ALTER TABLE public.bet_legs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bet legs" ON public.bet_legs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX bet_legs_bet_idx ON public.bet_legs(bet_id);
CREATE INDEX bet_legs_account_idx ON public.bet_legs(account_id);

-- --- ledger_entries -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  amount numeric NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN (
    'opening_balance','deposit','withdrawal',
    'transfer_out','transfer_in',
    'bet_stake','bet_settlement','free_bet_settlement',
    'manual_correction'
  )),
  transfer_group_id uuid,
  bet_leg_id uuid REFERENCES public.bet_legs(id) ON DELETE SET NULL,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ledger" ON public.ledger_entries FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ledger_account_idx ON public.ledger_entries(account_id, occurred_at);
CREATE INDEX ledger_user_idx ON public.ledger_entries(user_id, occurred_at DESC);
CREATE INDEX ledger_transfer_idx ON public.ledger_entries(transfer_group_id);
CREATE INDEX ledger_bet_leg_idx ON public.ledger_entries(bet_leg_id);

-- --- updated_at triggers ------------------------------------------------
CREATE TRIGGER accounts_updated_at  BEFORE UPDATE ON public.accounts  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bets_v2_updated_at   BEFORE UPDATE ON public.bets_v2   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bet_legs_updated_at  BEFORE UPDATE ON public.bet_legs  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- RPCs: atomic bet + ledger writes
-- =====================================================================

-- Compute the cash return from outcome (matches src/lib/calc.ts)
CREATE OR REPLACE FUNCTION public.leg_return(
  p_stake numeric, p_odds numeric, p_is_free boolean, p_free_type text, p_outcome text
) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_outcome
    WHEN 'win' THEN
      CASE WHEN p_is_free THEN
        CASE WHEN p_free_type = 'sr' THEN p_stake * p_odds          -- SR: bookie returns stake too (rare)
             ELSE p_stake * (p_odds - 1)                            -- SNR: profit only
        END
      ELSE p_stake * p_odds END
    WHEN 'half_win' THEN
      CASE WHEN p_is_free THEN
        CASE WHEN p_free_type = 'sr' THEN p_stake / 2 + (p_stake / 2) * p_odds
             ELSE (p_stake / 2) * (p_odds - 1)
        END
      ELSE p_stake / 2 + (p_stake / 2) * p_odds END
    WHEN 'loss' THEN 0
    WHEN 'half_loss' THEN CASE WHEN p_is_free THEN 0 ELSE p_stake / 2 END
    WHEN 'void' THEN CASE WHEN p_is_free THEN 0 ELSE p_stake END
    WHEN 'push' THEN CASE WHEN p_is_free THEN 0 ELSE p_stake END
    ELSE 0
  END;
$$;

-- Create a bet with N legs and the matching ledger rows (one shot).
-- p_legs is jsonb array: [{account_id, leg_number, selection, odds, stake, is_free_bet, free_bet_type, stake_prefunded, outcome?}]
CREATE OR REPLACE FUNCTION public.create_bet_with_ledger(
  p_date timestamptz, p_bet_type text, p_event text, p_market text,
  p_notes text, p_tags text[], p_legs jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bet_id uuid;
  v_leg jsonb;
  v_leg_id uuid;
  v_outcome text;
  v_ret numeric;
  v_status text := 'open';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO public.bets_v2 (user_id, date_placed, bet_type, status, event, market, notes, tags)
  VALUES (v_user, p_date, p_bet_type, 'open', p_event, p_market, p_notes, COALESCE(p_tags, '{}'))
  RETURNING id INTO v_bet_id;

  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    v_outcome := COALESCE(v_leg->>'outcome', 'open');
    INSERT INTO public.bet_legs (
      bet_id, user_id, leg_number, account_id, selection, odds, stake,
      is_free_bet, free_bet_type, outcome, stake_prefunded, settled_at
    ) VALUES (
      v_bet_id, v_user,
      COALESCE((v_leg->>'leg_number')::int, 1),
      (v_leg->>'account_id')::uuid,
      v_leg->>'selection',
      COALESCE((v_leg->>'odds')::numeric, 1),
      COALESCE((v_leg->>'stake')::numeric, 0),
      COALESCE((v_leg->>'is_free_bet')::boolean, false),
      NULLIF(v_leg->>'free_bet_type', ''),
      v_outcome,
      COALESCE((v_leg->>'stake_prefunded')::boolean, false),
      CASE WHEN v_outcome <> 'open' THEN p_date ELSE NULL END
    ) RETURNING id INTO v_leg_id;

    -- bet_stake ledger entry (skip cash leak when prefunded or free bet)
    IF NOT COALESCE((v_leg->>'is_free_bet')::boolean, false)
       AND NOT COALESCE((v_leg->>'stake_prefunded')::boolean, false) THEN
      INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, bet_leg_id, memo)
      VALUES (v_user, (v_leg->>'account_id')::uuid, p_date,
              -COALESCE((v_leg->>'stake')::numeric, 0),
              'bet_stake', v_leg_id, p_event);
    END IF;

    -- if leg was created already settled, also write the settlement
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
        VALUES (v_user, (v_leg->>'account_id')::uuid, p_date, v_ret,
                CASE WHEN COALESCE((v_leg->>'is_free_bet')::boolean,false)
                     THEN 'free_bet_settlement' ELSE 'bet_settlement' END,
                v_leg_id, p_event);
      END IF;
    END IF;
  END LOOP;

  -- bet status: settled if all legs settled
  IF NOT EXISTS (SELECT 1 FROM public.bet_legs WHERE bet_id = v_bet_id AND outcome = 'open') THEN
    UPDATE public.bets_v2 SET status = 'settled' WHERE id = v_bet_id;
  END IF;

  RETURN v_bet_id;
END $$;

-- Settle a single leg: replace any existing settlement entry for this leg, then write fresh one.
CREATE OR REPLACE FUNCTION public.settle_leg_with_ledger(
  p_leg_id uuid, p_outcome text, p_settled_at timestamptz DEFAULT now()
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_leg public.bet_legs%ROWTYPE;
  v_ret numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_leg FROM public.bet_legs WHERE id = p_leg_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'leg not found'; END IF;

  DELETE FROM public.ledger_entries
   WHERE bet_leg_id = p_leg_id
     AND entry_type IN ('bet_settlement','free_bet_settlement');

  UPDATE public.bet_legs
     SET outcome = p_outcome,
         settled_at = CASE WHEN p_outcome = 'open' THEN NULL ELSE p_settled_at END
   WHERE id = p_leg_id;

  IF p_outcome <> 'open' THEN
    v_ret := public.leg_return(v_leg.stake, v_leg.odds, v_leg.is_free_bet, v_leg.free_bet_type, p_outcome);
    IF v_ret > 0 THEN
      INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, bet_leg_id, memo)
      VALUES (v_user, v_leg.account_id, p_settled_at, v_ret,
              CASE WHEN v_leg.is_free_bet THEN 'free_bet_settlement' ELSE 'bet_settlement' END,
              p_leg_id, 'settlement');
    END IF;
  END IF;

  -- recompute parent bet status
  UPDATE public.bets_v2 b SET status =
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.bet_legs WHERE bet_id = b.id AND outcome = 'open')
         THEN 'settled' ELSE 'open' END
   WHERE id = v_leg.bet_id;
END $$;

-- Create a transfer = two ledger entries with shared transfer_group_id
CREATE OR REPLACE FUNCTION public.create_transfer_with_ledger(
  p_from uuid, p_to uuid, p_amount numeric, p_when timestamptz DEFAULT now(), p_memo text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_group uuid := gen_random_uuid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF p_from IS NULL AND p_to IS NULL THEN RAISE EXCEPTION 'from or to required'; END IF;

  IF p_from IS NOT NULL THEN
    INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, transfer_group_id, memo)
    VALUES (v_user, p_from, p_when, -p_amount,
            CASE WHEN p_to IS NULL THEN 'withdrawal' ELSE 'transfer_out' END,
            v_group, p_memo);
  END IF;
  IF p_to IS NOT NULL THEN
    INSERT INTO public.ledger_entries (user_id, account_id, occurred_at, amount, entry_type, transfer_group_id, memo)
    VALUES (v_user, p_to, p_when, p_amount,
            CASE WHEN p_from IS NULL THEN 'deposit' ELSE 'transfer_in' END,
            v_group, p_memo);
  END IF;
  RETURN v_group;
END $$;

GRANT EXECUTE ON FUNCTION public.create_bet_with_ledger(timestamptz,text,text,text,text,text[],jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_leg_with_ledger(uuid,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer_with_ledger(uuid,uuid,numeric,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leg_return(numeric,numeric,boolean,text,text) TO authenticated, anon;

-- =====================================================================
-- Tighten existing tables to authenticated-only + per-user scoping going forward.
-- Keep existing rows readable so the backfill server fn (running as service_role)
-- can migrate them. We drop the "world" policy and keep no public policy;
-- service_role bypasses RLS so backfill still works.
-- =====================================================================
DROP POLICY IF EXISTS "open access bookies"    ON public.bookies;
DROP POLICY IF EXISTS "open access bets"       ON public.bets;
DROP POLICY IF EXISTS "open access transfers"  ON public.transfers;
DROP POLICY IF EXISTS "open access bank_ledger" ON public.bank_ledger;
DROP POLICY IF EXISTS "open access audit_log"  ON public.audit_log;

-- Audit log: keep authenticated read/write scoped to user later; for now allow authenticated all
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
CREATE POLICY "own audit insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "own audit read"   ON public.audit_log FOR SELECT TO authenticated USING (true);
