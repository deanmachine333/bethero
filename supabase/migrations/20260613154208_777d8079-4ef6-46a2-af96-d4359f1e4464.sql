
CREATE TABLE public.bookies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  country text,
  currency text NOT NULL DEFAULT 'GBP',
  opening_balance numeric NOT NULL DEFAULT 0,
  min_threshold numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bookies TO anon, authenticated, service_role;
ALTER TABLE public.bookies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access bookies" ON public.bookies FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_placed timestamptz NOT NULL,
  bookie_id uuid NOT NULL REFERENCES public.bookies(id) ON DELETE RESTRICT,
  event text NOT NULL,
  market text NOT NULL,
  stake numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  odds numeric NOT NULL DEFAULT 1,
  type text NOT NULL DEFAULT 'EV+',
  pair_id text,
  is_free_bet boolean NOT NULL DEFAULT false,
  outcome text NOT NULL DEFAULT 'open',
  return numeric NOT NULL DEFAULT 0,
  clv numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bets_dedupe_unique UNIQUE (date_placed, bookie_id, event, market, stake, odds)
);
CREATE INDEX bets_bookie_idx ON public.bets(bookie_id);
CREATE INDEX bets_pair_idx ON public.bets(pair_id) WHERE pair_id IS NOT NULL;
CREATE INDEX bets_date_idx ON public.bets(date_placed DESC);
GRANT ALL ON public.bets TO anon, authenticated, service_role;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access bets" ON public.bets FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_bookie_id uuid REFERENCES public.bookies(id) ON DELETE SET NULL,
  to_bookie_id uuid REFERENCES public.bookies(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  withdraw_date date,
  bank_cleared_date date,
  deposit_date date,
  status text NOT NULL DEFAULT 'planned',
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.transfers TO anon, authenticated, service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access transfers" ON public.transfers FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.bank_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT current_date,
  direction text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  from_label text,
  to_label text,
  reference text,
  transfer_id uuid REFERENCES public.transfers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_ledger_date_idx ON public.bank_ledger(date);
GRANT ALL ON public.bank_ledger TO anon, authenticated, service_role;
ALTER TABLE public.bank_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access bank_ledger" ON public.bank_ledger FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  field text,
  old_value jsonb,
  new_value jsonb,
  actor text NOT NULL DEFAULT 'me',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON public.audit_log(entity_type, entity_id);
CREATE INDEX audit_created_idx ON public.audit_log(created_at DESC);
GRANT ALL ON public.audit_log TO anon, authenticated, service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access audit_log" ON public.audit_log FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER bookies_updated BEFORE UPDATE ON public.bookies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bets_updated BEFORE UPDATE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER transfers_updated BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
