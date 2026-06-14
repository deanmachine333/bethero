
REVOKE EXECUTE ON FUNCTION public.apply_leg_ledger(uuid, timestamp with time zone, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_bet(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.import_transfers_batch(jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reimport_bet(uuid, jsonb, text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_leg_ledger(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_transfer_group(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_account_with_correction(uuid, text, text, boolean, numeric, text, numeric, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_bet_with_ledger(uuid, jsonb, jsonb, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_transfer_group(uuid, text, timestamp with time zone) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_owner_signup() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_leg_ledger(uuid, timestamp with time zone, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_bet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_transfers_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reimport_bet(uuid, jsonb, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_leg_ledger(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transfer_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_account_with_correction(uuid, text, text, boolean, numeric, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bet_with_ledger(uuid, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transfer_group(uuid, text, timestamp with time zone) TO authenticated;
