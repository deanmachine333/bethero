import { supabase } from "@/integrations/supabase/client";
import type { Account, Bet, BetLeg, LedgerEntry } from "./ledger";

export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("kind", { ascending: false })
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchBets(): Promise<Bet[]> {
  const { data, error } = await supabase
    .from("bets_v2")
    .select("*")
    .eq("is_archived", false)
    .order("date_placed", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return data ?? [];
}

export async function fetchBetLegs(): Promise<BetLeg[]> {
  const { data, error } = await supabase.from("bet_legs").select("*").limit(5000);
  if (error) throw error;
  return data ?? [];
}

export async function fetchLedger(): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("*")
    .order("occurred_at", { ascending: true })
    .limit(10000);
  if (error) throw error;
  return data ?? [];
}

export async function fetchProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
  return data;
}

// ---- mutations via RPCs ----------------------------------------------------

export interface NewLegInput {
  account_id: string;
  leg_number?: number;
  selection?: string;
  odds: number;
  stake: number;
  is_free_bet?: boolean;
  free_bet_type?: "snr" | "sr" | null;
  stake_prefunded?: boolean;
  outcome?: string;
}

export async function createBet(input: {
  date: string;
  bet_type: "ev" | "arb";
  event: string;
  market?: string;
  notes?: string;
  tags?: string[];
  legs: NewLegInput[];
}) {
  const { data, error } = await supabase.rpc("create_bet_with_ledger", {
    p_date: input.date,
    p_bet_type: input.bet_type,
    p_event: input.event,
    p_market: (input.market ?? null) as never,
    p_notes: (input.notes ?? null) as never,
    p_tags: input.tags ?? [],
    p_legs: input.legs as never,
  });
  if (error) throw error;
  return data as string;
}

export interface UpdateLegInput extends NewLegInput {
  id?: string;
  market?: string | null;
}

export async function updateBet(
  betId: string,
  bet: {
    event?: string;
    market?: string | null;
    notes?: string | null;
    bet_type?: "ev" | "arb";
    date_placed?: string;
    event_time?: string | null;
    sport?: string | null;
    league?: string | null;
  },
  legs: UpdateLegInput[],
) {
  const { data, error } = await supabase.rpc("update_bet_with_ledger", {
    p_bet_id: betId,
    p_bet: bet as never,
    p_legs: legs as never,
    p_mark_manual: true,
  });
  if (error) throw error;
  return data as string;
}

export async function archiveBet(betId: string) {
  const { error } = await supabase.rpc("archive_bet", { p_bet_id: betId });
  if (error) throw error;
}

export async function reimportBet(betId: string, incoming: unknown, overwriteFields: string[]) {
  const { data, error } = await supabase.rpc("reimport_bet", {
    p_bet_id: betId,
    p_incoming: incoming as never,
    p_overwrite_fields: overwriteFields,
  });
  if (error) throw error;
  return data as string;
}

export async function settleLeg(leg_id: string, outcome: string, when?: string) {
  const { error } = await supabase.rpc("settle_leg_with_ledger", {
    p_leg_id: leg_id,
    p_outcome: outcome,
    p_settled_at: when ?? new Date().toISOString(),
  });
  if (error) throw error;
}

export async function createTransfer(
  from: string | null,
  to: string | null,
  amount: number,
  when?: string,
  memo?: string,
) {
  const { error } = await supabase.rpc("create_transfer_with_ledger", {
    p_from: from as never,
    p_to: to as never,
    p_amount: amount,
    p_when: when ?? new Date().toISOString(),
    p_memo: (memo ?? null) as never,
  });
  if (error) throw error;
}

export async function transferBookieToBookie(
  from: string,
  to: string,
  bank: string,
  amount: number,
  when?: string,
  memo?: string,
) {
  const { error } = await supabase.rpc("transfer_bookie_to_bookie", {
    p_from: from as never,
    p_to: to as never,
    p_bank: bank as never,
    p_amount: amount,
    p_when: when ?? new Date().toISOString(),
    p_memo: (memo ?? null) as never,
  });
  if (error) throw error;
}

export async function importBetsBatch(rows: unknown[]): Promise<{
  created: number;
  skipped: number;
  errors: { external_ref?: string; error: string }[];
}> {
  const { data, error } = await supabase.rpc("import_bets_batch", {
    p_rows: rows as never,
  });
  if (error) throw error;
  return data as {
    created: number;
    skipped: number;
    errors: { external_ref?: string; error: string }[];
  };
}

export async function importTransfersBatch(rows: unknown[]): Promise<{
  created: number;
  skipped: number;
  errors: { import_key?: string; error: string }[];
}> {
  const { data, error } = await supabase.rpc("import_transfers_batch", {
    p_rows: rows as never,
  });
  if (error) throw error;
  return data as {
    created: number;
    skipped: number;
    errors: { import_key?: string; error: string }[];
  };
}

export async function updateAccountWithCorrection(input: {
  id: string;
  name?: string;
  currency?: string;
  is_active?: boolean;
  min_threshold?: number;
  notes?: string | null;
  target_balance?: number;
  memo?: string | null;
}) {
  const { error } = await supabase.rpc("update_account_with_correction", {
    p_id: input.id,
    p_name: (input.name ?? null) as never,
    p_currency: (input.currency ?? null) as never,
    p_is_active: (input.is_active ?? null) as never,
    p_min_threshold: (input.min_threshold ?? null) as never,
    p_notes: (input.notes ?? null) as never,
    p_target_balance: (input.target_balance ?? null) as never,
    p_memo: (input.memo ?? null) as never,
  });
  if (error) throw error;
}

export async function updateTransferGroup(groupId: string, memo?: string, when?: string) {
  const { error } = await supabase.rpc("update_transfer_group", {
    p_group_id: groupId,
    p_memo: (memo ?? null) as never,
    p_when: (when ?? null) as never,
  });
  if (error) throw error;
}

export async function reverseTransferGroup(groupId: string) {
  const { error } = await supabase.rpc("reverse_transfer_group", {
    p_group_id: groupId,
  });
  if (error) throw error;
}

export async function createAccount(input: {
  name: string;
  kind: "bookie" | "bank";
  currency?: string;
  min_threshold?: number;
  opening_balance?: number;
  colour?: string;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("not signed in");
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: u.user.id,
      name: input.name,
      kind: input.kind,
      currency: input.currency ?? "GBP",
      min_threshold: input.min_threshold ?? 0,
      colour: input.colour ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  if (input.opening_balance && input.opening_balance !== 0) {
    const { error: lerr } = await supabase.from("ledger_entries").insert({
      user_id: u.user.id,
      account_id: data.id,
      amount: input.opening_balance,
      entry_type: "opening_balance",
      memo: "Opening balance",
    });
    if (lerr) throw lerr;
  }
  return data;
}

/** Look up existing bets that match given external refs. Returns map ref → bet+legs. */
export async function findBetsByExternalRefs(refs: string[]) {
  if (refs.length === 0) return new Map<string, { bet: Bet; legs: BetLeg[] }>();
  const { data: bets, error } = await supabase
    .from("bets_v2")
    .select("*")
    .in("external_ref", refs);
  if (error) throw error;
  const betIds = (bets ?? []).map((b) => b.id);
  const { data: legs, error: legErr } = betIds.length
    ? await supabase.from("bet_legs").select("*").in("bet_id", betIds)
    : { data: [] as BetLeg[], error: null };
  if (legErr) throw legErr;
  const map = new Map<string, { bet: Bet; legs: BetLeg[] }>();
  for (const b of bets ?? []) {
    if (!b.external_ref) continue;
    map.set(b.external_ref, {
      bet: b,
      legs: (legs ?? []).filter((l) => l.bet_id === b.id),
    });
  }
  return map;
}
