// Calculations for bets, pairs, balances.

export type Outcome = "open" | "win" | "loss" | "void" | "half_win" | "half_loss" | "push";

export interface BetLike {
  stake: number;
  odds: number;
  is_free_bet: boolean;
  outcome: Outcome | string;
  return: number;
}

/** Compute the return for a bet given its outcome. Free bet wins return stake*(odds-1). */
export function computeReturn(stake: number, odds: number, isFreeBet: boolean, outcome: string): number {
  switch (outcome) {
    case "win":
      return isFreeBet ? stake * (odds - 1) : stake * odds;
    case "half_win":
      // Half stake wins, half pushes
      return isFreeBet ? (stake / 2) * (odds - 1) : stake / 2 + (stake / 2) * odds;
    case "loss":
      return 0;
    case "half_loss":
      // Half stake loses, half pushes -> non-free returns half stake; free bet returns 0
      return isFreeBet ? 0 : stake / 2;
    case "void":
    case "push":
      return isFreeBet ? 0 : stake;
    case "open":
    default:
      return 0;
  }
}

/** P/L of a single bet (net of stake; free-bet stake excluded from cost). */
export function betProfit(b: BetLike): number {
  const cost = b.is_free_bet ? 0 : b.stake;
  return b.return - cost;
}

/** Sum stakes excluding free bets. */
export function effectiveStakeSum(bets: BetLike[]): number {
  return bets.reduce((acc, b) => acc + (b.is_free_bet ? 0 : b.stake), 0);
}

export function returnSum(bets: BetLike[]): number {
  return bets.reduce((acc, b) => acc + Number(b.return || 0), 0);
}

export function pairPL(bets: BetLike[]): number {
  return returnSum(bets) - effectiveStakeSum(bets);
}

export function pairStatus(bets: BetLike[]): "open" | "partial" | "settled" {
  const states = bets.map((b) => b.outcome);
  const allOpen = states.every((s) => s === "open");
  const noneOpen = states.every((s) => s !== "open");
  if (allOpen) return "open";
  if (noneOpen) return "settled";
  return "partial";
}

export function pairVoidRisk(bets: BetLike[]): boolean {
  const hasVoid = bets.some((b) => b.outcome === "void");
  const hasOpen = bets.some((b) => b.outcome === "open");
  if (hasVoid && hasOpen) return true; // remaining legs carry full risk
  // partial settled with negative projected P/L (treating open as worst case 0 return)
  if (hasOpen && pairPL(bets) < 0) return true;
  return false;
}

export interface BookieBalanceInput {
  opening_balance: number;
  deposits: number; // transfers Deposited TO this bookie
  withdrawals: number; // transfers Withdrawn FROM this bookie (already left)
  settled_returns: number; // sum of returns for settled bets
  settled_stakes: number; // sum of non-free stakes for settled bets
  open_stakes: number; // sum of non-free stakes for open bets
}

export function bookieBalance(i: BookieBalanceInput): number {
  return (
    i.opening_balance +
    i.deposits -
    i.withdrawals +
    i.settled_returns -
    i.settled_stakes -
    i.open_stakes
  );
}

export function fmtMoney(n: number, currency = "GBP"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
