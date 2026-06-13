import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { bookieBalance, effectiveStakeSum, returnSum } from "./calc";

export type Bookie = Database["public"]["Tables"]["bookies"]["Row"];
export type Bet = Database["public"]["Tables"]["bets"]["Row"];
export type Transfer = Database["public"]["Tables"]["transfers"]["Row"];
export type BankLedger = Database["public"]["Tables"]["bank_ledger"]["Row"];
export type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];

export async function fetchBookies(): Promise<Bookie[]> {
  const { data, error } = await supabase.from("bookies").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchBets(): Promise<Bet[]> {
  const { data, error } = await supabase
    .from("bets")
    .select("*")
    .order("date_placed", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}

export async function fetchTransfers(): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from("transfers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchBank(): Promise<BankLedger[]> {
  const { data, error } = await supabase
    .from("bank_ledger")
    .select("*")
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAudit(): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export interface BookieWithBalance extends Bookie {
  computed_balance: number;
  open_risk: number;
}

export function deriveBookieBalances(
  bookies: Bookie[],
  bets: Bet[],
  transfers: Transfer[],
): BookieWithBalance[] {
  return bookies.map((b) => {
    const bookieBets = bets.filter((x) => x.bookie_id === b.id);
    const settled = bookieBets.filter((x) => x.outcome !== "open");
    const open = bookieBets.filter((x) => x.outcome === "open");
    const deposits = transfers
      .filter((t) => t.to_bookie_id === b.id && t.status === "deposited")
      .reduce((a, t) => a + Number(t.amount), 0);
    const withdrawals = transfers
      .filter(
        (t) =>
          t.from_bookie_id === b.id &&
          (t.status === "withdrawn" || t.status === "bank_cleared" || t.status === "deposited"),
      )
      .reduce((a, t) => a + Number(t.amount), 0);
    const balance = bookieBalance({
      opening_balance: Number(b.opening_balance),
      deposits,
      withdrawals,
      settled_returns: returnSum(settled),
      settled_stakes: effectiveStakeSum(settled),
      open_stakes: effectiveStakeSum(open),
    });
    return { ...b, computed_balance: balance, open_risk: effectiveStakeSum(open) };
  });
}
