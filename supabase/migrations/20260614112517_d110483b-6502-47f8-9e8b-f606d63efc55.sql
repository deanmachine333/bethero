
-- 1) Drop unused legacy tables (replaced by accounts/bets_v2/bet_legs/ledger_entries)
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.bank_ledger CASCADE;
DROP TABLE IF EXISTS public.transfers CASCADE;
DROP TABLE IF EXISTS public.bets CASCADE;
DROP TABLE IF EXISTS public.bookies CASCADE;

-- 2) Revoke EXECUTE on SECURITY DEFINER RPCs from anon; keep authenticated.
REVOKE EXECUTE ON FUNCTION public.create_bet_with_ledger(timestamptz, text, text, text, text, text[], jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.settle_leg_with_ledger(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_transfer_with_ledger(uuid, uuid, numeric, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_bookie_to_bookie(uuid, uuid, uuid, numeric, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.import_bets_batch(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leg_return(numeric, numeric, boolean, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_bet_with_ledger(timestamptz, text, text, text, text, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_leg_with_ledger(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer_with_ledger(uuid, uuid, numeric, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_bookie_to_bookie(uuid, uuid, uuid, numeric, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_bets_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leg_return(numeric, numeric, boolean, text, text) TO authenticated;

-- 3) Pin search_path on leg_return (the only function still missing it)
ALTER FUNCTION public.leg_return(numeric, numeric, boolean, text, text) SET search_path = public;
