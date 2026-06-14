import { describe, it, expect } from "vitest";
import {
  legReturn,
  legProjectedProfit,
  legRealisedProfit,
  arbScenarios,
  accountBalance,
  accountAvailable,
  betProjectedProfit,
} from "../ledger";
import type { BetLeg, LedgerEntry } from "../ledger";

function makeLeg(over: Partial<BetLeg> = {}): BetLeg {
  return {
    id: over.id ?? "L1",
    bet_id: "B1",
    user_id: "u",
    account_id: over.account_id ?? "A1",
    leg_number: 1,
    selection: null,
    odds: 2,
    stake: 10,
    is_free_bet: false,
    free_bet_type: null,
    outcome: "open",
    stake_prefunded: false,
    market: null,
    settled_at: null,
    created_at: "",
    updated_at: "",
    last_manual_edit_at: null,
    manually_overridden_fields: [],
    ...over,
  } as BetLeg;
}

function makeEntry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: over.id ?? crypto.randomUUID(),
    user_id: "u",
    account_id: over.account_id ?? "A1",
    amount: 0,
    entry_type: "manual_correction",
    occurred_at: "2026-01-01T00:00:00Z",
    bet_leg_id: null,
    transfer_group_id: null,
    memo: null,
    created_at: "",
    ...over,
  } as LedgerEntry;
}

describe("legReturn", () => {
  it("cash win returns stake * odds", () => {
    expect(legReturn(10, 2.5, false, null, "win")).toBe(25);
  });
  it("free bet SNR win returns stake * (odds - 1)", () => {
    expect(legReturn(10, 3, true, "snr", "win")).toBe(20);
  });
  it("free bet SR win returns stake * odds", () => {
    expect(legReturn(10, 3, true, "sr", "win")).toBe(30);
  });
  it("loss returns 0", () => {
    expect(legReturn(10, 2, false, null, "loss")).toBe(0);
  });
  it("void returns stake for cash, 0 for free", () => {
    expect(legReturn(10, 2, false, null, "void")).toBe(10);
    expect(legReturn(10, 2, true, "snr", "void")).toBe(0);
  });
});

describe("legProjectedProfit / legRealisedProfit", () => {
  it("cash bet profit on win = stake*(odds-1)", () => {
    const l = makeLeg({ stake: 10, odds: 2.5 });
    expect(legProjectedProfit(l)).toBe(15);
  });
  it("free bet profit on win = stake*(odds-1) regardless", () => {
    const l = makeLeg({ stake: 10, odds: 3, is_free_bet: true, free_bet_type: "snr" });
    expect(legProjectedProfit(l)).toBe(20);
  });
  it("realised profit is 0 when open", () => {
    expect(legRealisedProfit(makeLeg())).toBe(0);
  });
  it("realised profit reflects outcome", () => {
    expect(legRealisedProfit(makeLeg({ outcome: "loss" }))).toBe(-10);
    expect(legRealisedProfit(makeLeg({ outcome: "win", odds: 2 }))).toBe(10);
  });
});

describe("arbScenarios", () => {
  it("perfectly hedged 2-leg arb has near-zero spread", () => {
    const legs = [
      makeLeg({ id: "a", odds: 2, stake: 10 }),
      makeLeg({ id: "b", odds: 2, stake: 10 }),
    ];
    const s = arbScenarios(legs);
    expect(s.best).toBe(0);
    expect(s.worst).toBe(0);
  });
  it("profitable arb has positive worst case", () => {
    const legs = [
      makeLeg({ id: "a", odds: 2.1, stake: 100 }),
      makeLeg({ id: "b", odds: 2.1, stake: 100 }),
    ];
    const s = arbScenarios(legs);
    expect(s.worst).toBeCloseTo(10, 5);
  });
});

describe("betProjectedProfit", () => {
  it("EV bet sums per-leg projections", () => {
    const legs = [makeLeg({ id: "a", odds: 2, stake: 10 })];
    const p = betProjectedProfit({ bet_type: "ev" }, legs);
    expect(p.expected).toBe(10);
  });
  it("arb uses worst-case as expected", () => {
    const legs = [
      makeLeg({ id: "a", odds: 2.1, stake: 100 }),
      makeLeg({ id: "b", odds: 2.1, stake: 100 }),
    ];
    const p = betProjectedProfit({ bet_type: "arb" }, legs);
    expect(p.expected).toBeCloseTo(10, 5);
  });
});

describe("accountBalance / accountAvailable", () => {
  it("balance is sum of ledger entries", () => {
    const e = [
      makeEntry({ amount: 100, entry_type: "opening_balance" }),
      makeEntry({ amount: -10, entry_type: "bet_stake" }),
      makeEntry({ amount: 25, entry_type: "bet_settlement" }),
    ];
    expect(accountBalance(e, "A1")).toBe(115);
  });
  it("available subtracts prefunded open exposure", () => {
    const e = [makeEntry({ amount: 100, entry_type: "opening_balance" })];
    const legs = [
      makeLeg({ stake: 25, stake_prefunded: true, outcome: "open" }),
      makeLeg({ id: "L2", stake: 10, stake_prefunded: false, outcome: "open" }),
    ];
    // balance 100, locked 25 (only prefunded), non-prefunded already deducted via ledger
    expect(accountAvailable(e, legs, "A1")).toBe(75);
  });
});
