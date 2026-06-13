// Pure helpers for ledger-derived numbers. NO balances are stored anywhere —
// every account balance is the sum of its ledger_entries.

import type { Database } from "@/integrations/supabase/types";

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type Bet = Database["public"]["Tables"]["bets_v2"]["Row"];
export type BetLeg = Database["public"]["Tables"]["bet_legs"]["Row"];
export type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];

export type Outcome =
  | "open"
  | "win"
  | "loss"
  | "void"
  | "half_win"
  | "half_loss"
  | "push";

/** Cash return from a leg given outcome. Matches the SQL leg_return(). */
export function legReturn(
  stake: number,
  odds: number,
  isFree: boolean,
  freeType: string | null,
  outcome: string,
): number {
  switch (outcome) {
    case "win":
      return isFree
        ? freeType === "sr"
          ? stake * odds
          : stake * (odds - 1)
        : stake * odds;
    case "half_win":
      return isFree
        ? freeType === "sr"
          ? stake / 2 + (stake / 2) * odds
          : (stake / 2) * (odds - 1)
        : stake / 2 + (stake / 2) * odds;
    case "loss":
      return 0;
    case "half_loss":
      return isFree ? 0 : stake / 2;
    case "void":
    case "push":
      return isFree ? 0 : stake;
    default:
      return 0;
  }
}

/** Profit a leg would book if it wins right now (before settlement). */
export function legProjectedProfit(leg: BetLeg): number {
  const stake = Number(leg.stake);
  const odds = Number(leg.odds);
  const ret = legReturn(stake, odds, leg.is_free_bet, leg.free_bet_type, "win");
  const cost = leg.is_free_bet ? 0 : stake;
  return ret - cost;
}

/** Realised profit for a settled leg. */
export function legRealisedProfit(leg: BetLeg): number {
  if (leg.outcome === "open") return 0;
  const stake = Number(leg.stake);
  const odds = Number(leg.odds);
  const ret = legReturn(stake, odds, leg.is_free_bet, leg.free_bet_type, leg.outcome);
  const cost = leg.is_free_bet ? 0 : stake;
  return ret - cost;
}

export function accountBalance(entries: LedgerEntry[], accountId: string): number {
  return entries
    .filter((e) => e.account_id === accountId)
    .reduce((a, e) => a + Number(e.amount), 0);
}

/** Open exposure at a bookie: sum of cash stakes locked in open bets there. */
export function accountOpenExposure(legs: BetLeg[], accountId: string): number {
  return legs
    .filter((l) => l.account_id === accountId && l.outcome === "open" && !l.is_free_bet)
    .reduce((a, l) => a + Number(l.stake), 0);
}

/** Available = balance − (open stakes that were NOT prefunded, so they actually moved cash). */
export function accountAvailable(
  entries: LedgerEntry[],
  legs: BetLeg[],
  accountId: string,
): number {
  return accountBalance(entries, accountId);
}

export function accountRealisedPL(entries: LedgerEntry[], legs: BetLeg[], accountId: string): number {
  return legs
    .filter((l) => l.account_id === accountId && l.outcome !== "open")
    .reduce((a, l) => a + legRealisedProfit(l), 0);
}

export function fmtMoney(n: number, currency = "GBP"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
