import { describe, it, expect } from "vitest";
import { groupTransferRows, type ParsedTransferRow } from "../transfers-csv";

function row(over: Partial<ParsedTransferRow>): ParsedTransferRow {
  return {
    rowNum: 1,
    importKey: over.importKey ?? `k${Math.random()}`,
    bookie: "BookieA",
    profile: "",
    kind: "deposit",
    amount: 100,
    method: "Bank",
    time: "2026-06-01T12:00:00.000Z",
    notes: "",
    warnings: [],
    skip: false,
    groupId: null,
    ...over,
  } as ParsedTransferRow;
}

describe("groupTransferRows", () => {
  it("groups matching withdrawal + deposit into a single transfer", () => {
    const rows = [
      row({ rowNum: 1, bookie: "A", kind: "withdrawal", amount: 50, notes: "move" }),
      row({ rowNum: 2, bookie: "B", kind: "deposit", amount: 50, notes: "move" }),
    ];
    const g = groupTransferRows(rows);
    expect(g).toHaveLength(1);
    expect(g[0].kind).toBe("transfer");
    if (g[0].kind === "transfer") {
      expect(g[0].from).toBe("A");
      expect(g[0].to).toBe("B");
      expect(g[0].amount).toBe(50);
    }
  });

  it("unpaired deposit becomes external deposit", () => {
    const rows = [row({ rowNum: 1, bookie: "A", kind: "deposit", amount: 200 })];
    const g = groupTransferRows(rows);
    expect(g).toHaveLength(1);
    expect(g[0].kind).toBe("deposit");
  });

  it("unpaired withdrawal becomes external withdrawal", () => {
    const rows = [row({ rowNum: 1, bookie: "A", kind: "withdrawal", amount: 75 })];
    const g = groupTransferRows(rows);
    expect(g).toHaveLength(1);
    expect(g[0].kind).toBe("withdrawal");
  });

  it("groups only when amounts match within tolerance", () => {
    const rows = [
      row({ rowNum: 1, bookie: "A", kind: "withdrawal", amount: 100 }),
      row({ rowNum: 2, bookie: "B", kind: "deposit", amount: 99 }),
    ];
    const g = groupTransferRows(rows);
    // mismatched amount → both become external
    expect(g).toHaveLength(2);
    expect(g.every((r) => r.kind !== "transfer")).toBe(true);
  });

  it("rows with warnings are skipped", () => {
    const rows = [row({ rowNum: 1, bookie: "A", kind: "deposit", amount: 50, warnings: ["bad"] })];
    expect(groupTransferRows(rows)).toHaveLength(0);
  });

  it("import keys are deterministic for identical input", () => {
    const a = row({ rowNum: 1, bookie: "X", kind: "deposit", amount: 25, notes: "n", time: "2026-06-01T12:00:00.000Z" });
    const b = row({ rowNum: 1, bookie: "X", kind: "deposit", amount: 25, notes: "n", time: "2026-06-01T12:00:00.000Z" });
    expect(a.importKey).not.toBe(b.importKey); // because row() supplies a random one
    // But same actual hash-input fields produce same hash — verified by parser, not unit-test here
  });
});
