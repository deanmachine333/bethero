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

/** Profit a leg books if THIS leg wins. */
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

/**
 * Arb scenario profit:
 * For each leg, compute the bet-level outcome IF THAT leg wins (others lose).
 * Returns best and worst case across legs. For a 2-leg arb where stakes are
 * mis-sized this correctly shows the spread.
 */
export function arbScenarios(legs: BetLeg[]): {
  scenarios: { winningLegId: string; profit: number }[];
  best: number;
  worst: number;
} {
  const scenarios = legs.map((winLeg) => {
    let profit = 0;
    for (const l of legs) {
      const stake = Number(l.stake);
      const isWinner = l.id === winLeg.id;
      const ret = legReturn(
        stake,
        Number(l.odds),
        l.is_free_bet,
        l.free_bet_type,
        isWinner ? "win" : "loss",
      );
      const cost = l.is_free_bet ? 0 : stake;
      profit += ret - cost;
    }
    return { winningLegId: winLeg.id, profit };
  });
  const profits = scenarios.map((s) => s.profit);
  return {
    scenarios,
    best: profits.length ? Math.max(...profits) : 0,
    worst: profits.length ? Math.min(...profits) : 0,
  };
}

/**
 * Projected profit for any open bet. EV bets sum per-leg projection. Arbs use
 * scenario worst-case (the guaranteed minimum).
 */
export function betProjectedProfit(
  bet: Pick<Bet, "bet_type">,
  legs: BetLeg[],
): { best: number; worst: number; expected: number } {
  if (bet.bet_type === "arb" && legs.length >= 2) {
    const s = arbScenarios(legs);
    return { best: s.best, worst: s.worst, expected: s.worst };
  }
  const sum = legs.reduce((a, l) => a + legProjectedProfit(l), 0);
  return { best: sum, worst: sum, expected: sum };
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

/** Available = balance minus cash locked in open (non-free, non-prefunded) bets. */
export function accountAvailable(entries: LedgerEntry[], legs: BetLeg[], accountId: string): number {
  const bal = accountBalance(entries, accountId);
  // Prefunded stakes are still sitting in the account balance (not deducted yet)
  // but are committed to open bets — subtract them.
  const lockedPrefunded = legs
    .filter(
      (l) =>
        l.account_id === accountId &&
        l.outcome === "open" &&
        !l.is_free_bet &&
        l.stake_prefunded,
    )
    .reduce((a, l) => a + Number(l.stake), 0);
  return bal - lockedPrefunded;
}

export function accountRealisedPL(_entries: LedgerEntry[], legs: BetLeg[], accountId: string): number {
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
