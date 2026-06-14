// BetHero-style transfer CSV parser & grouper.
// Columns: BOOK, PROFILE, TYPE, AMOUNT, METHOD, TIME, NOTES
import Papa from "papaparse";
import { parse as parseDate, isValid } from "date-fns";

export type TransferKind = "deposit" | "withdrawal";

export interface ParsedTransferRow {
  rowNum: number;
  importKey: string;
  bookie: string;
  profile: string;
  kind: TransferKind;
  amount: number;
  method: string;
  /** ISO string when parseable, original otherwise. */
  time: string | null;
  notes: string;
  warnings: string[];
  skip: boolean;
  /** Set during grouping. */
  groupId: string | null;
}

export type ResolvedTransfer =
  | {
      kind: "transfer"; // bookie-to-bookie via bank
      importKey: string;
      from: string; // bookie name
      to: string; // bookie name
      amount: number;
      when: string | null;
      memo: string;
      rowNums: number[];
    }
  | {
      kind: "deposit"; // external in
      importKey: string;
      to: string; // bookie name
      amount: number;
      when: string | null;
      memo: string;
      rowNums: number[];
    }
  | {
      kind: "withdrawal"; // external out
      importKey: string;
      from: string; // bookie name
      amount: number;
      when: string | null;
      memo: string;
      rowNums: number[];
    };

const DATE_FORMATS = [
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "yyyy-MM-dd'T'HH:mm:ssXXX",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd",
  "dd/MM/yyyy HH:mm",
  "dd/MM/yyyy",
  "MM/dd/yyyy HH:mm",
  "MM/dd/yyyy",
  "d MMM yyyy HH:mm",
  "d MMM yyyy",
];

function parseDateTolerant(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /^(nan|n\/a|-)$/i.test(s)) return null;
  const native = new Date(s);
  if (isValid(native) && !Number.isNaN(native.getTime())) return native.toISOString();
  for (const fmt of DATE_FORMATS) {
    const d = parseDate(s, fmt, new Date());
    if (isValid(d)) return d.toISOString();
  }
  return null;
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const s = String(raw).trim().replace(/[£$€,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normKind(raw: string | undefined): TransferKind | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (/(deposit|topup|top.?up|^in$|credit)/.test(s)) return "deposit";
  if (/(withdraw|wd|cashout|cash.?out|^out$|debit)/.test(s)) return "withdrawal";
  return null;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function hash(parts: Array<string | number | null | undefined>): string {
  const s = parts.map((p) => (p == null ? "" : String(p))).join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
    h2 = (h2 + s.charCodeAt(i) * 31) >>> 0;
  }
  return `${(h1 >>> 0).toString(16)}-${h2.toString(16)}`;
}

const HEADER_ALIASES: Record<string, string> = {
  book: "BOOK",
  bookie: "BOOK",
  bookmaker: "BOOK",
  profile: "PROFILE",
  type: "TYPE",
  amount: "AMOUNT",
  method: "METHOD",
  time: "TIME",
  date: "TIME",
  notes: "NOTES",
  note: "NOTES",
};

function normHeader(h: string): string {
  return HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toUpperCase();
}

export async function parseTransferCsv(file: File): Promise<ParsedTransferRow[]> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normHeader,
  });

  const rows: ParsedTransferRow[] = [];
  let n = 0;
  for (const raw of result.data) {
    if (!raw) continue;
    if ((raw.BOOK ?? "").toString().trim().toUpperCase() === "BOOK") continue;
    const hasAny = Object.values(raw).some((v) => v != null && String(v).trim().length > 0);
    if (!hasAny) continue;
    n += 1;

    const warnings: string[] = [];
    const bookie = (raw.BOOK ?? "").toString().trim();
    if (!bookie) warnings.push("missing BOOK");

    const kind = normKind(raw.TYPE);
    if (!kind) warnings.push(`unknown TYPE "${raw.TYPE ?? ""}"`);

    const amount = Math.abs(parseNumber(raw.AMOUNT));
    if (amount <= 0) warnings.push("invalid AMOUNT");

    const method = (raw.METHOD ?? "").toString().trim();
    const time = parseDateTolerant(raw.TIME);
    const notes = (raw.NOTES ?? "").toString().trim();
    const profile = (raw.PROFILE ?? "").toString().trim();

    const importKey = hash([
      normName(bookie),
      kind ?? "?",
      amount.toFixed(2),
      time ? time.slice(0, 16) : "",
      normName(notes),
      normName(method),
    ]);

    rows.push({
      rowNum: n,
      importKey,
      bookie,
      profile,
      kind: kind ?? "deposit",
      amount,
      method,
      time,
      notes,
      warnings,
      skip: !!warnings.length,
      groupId: null,
    });
  }
  return rows;
}

/**
 * Group withdrawal + deposit(s) that look like the same money movement:
 * same date (or within ±2 min), same notes (case-insensitive) OR exact
 * matching amounts within the same minute. Returns resolved transfers
 * with stable import keys.
 */
export function groupTransferRows(rows: ParsedTransferRow[]): ResolvedTransfer[] {
  const out: ResolvedTransfer[] = [];
  const used = new Set<number>();

  const minute = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

  // Sort by time so we group deterministically
  const ordered = [...rows]
    .filter((r) => !r.skip && r.warnings.length === 0)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  for (const row of ordered) {
    if (used.has(row.rowNum)) continue;
    if (row.kind !== "withdrawal") continue;

    // Find candidate deposits matching this withdrawal
    const candidates = ordered.filter(
      (c) =>
        !used.has(c.rowNum) &&
        c.rowNum !== row.rowNum &&
        c.kind === "deposit" &&
        Math.abs(c.amount - row.amount) < 0.005 &&
        (normName(c.notes) === normName(row.notes) || minute(c.time) === minute(row.time)),
    );

    if (candidates.length >= 1) {
      // pair with the first time-closest one
      const pick = candidates.sort((a, b) => {
        const da = Math.abs(new Date(a.time ?? 0).getTime() - new Date(row.time ?? 0).getTime());
        const db = Math.abs(new Date(b.time ?? 0).getTime() - new Date(row.time ?? 0).getTime());
        return da - db;
      })[0];
      used.add(row.rowNum);
      used.add(pick.rowNum);
      out.push({
        kind: "transfer",
        importKey: hash([row.importKey, pick.importKey].sort()),
        from: row.bookie,
        to: pick.bookie,
        amount: row.amount,
        when: row.time,
        memo: row.notes || pick.notes || row.method,
        rowNums: [row.rowNum, pick.rowNum],
      });
    }
  }

  // Remaining unpaired rows → external in/out
  for (const row of ordered) {
    if (used.has(row.rowNum)) continue;
    if (row.kind === "deposit") {
      out.push({
        kind: "deposit",
        importKey: row.importKey,
        to: row.bookie,
        amount: row.amount,
        when: row.time,
        memo: row.notes || row.method,
        rowNums: [row.rowNum],
      });
    } else {
      out.push({
        kind: "withdrawal",
        importKey: row.importKey,
        from: row.bookie,
        amount: row.amount,
        when: row.time,
        memo: row.notes || row.method,
        rowNums: [row.rowNum],
      });
    }
    used.add(row.rowNum);
  }

  return out;
}

/** Build the RPC payload for import_transfers_batch.
 *  bookieAccountId resolves a bookie name → existing account uuid.
 *  bankAccountId is the bank/transit account used for grouped transfers.
 */
export function resolvedToRpcRows(
  resolved: ResolvedTransfer[],
  bookieAccountId: (name: string) => string | null,
  bankAccountId: string | null,
): unknown[] {
  const rows: unknown[] = [];
  for (const r of resolved) {
    if (r.kind === "transfer") {
      const from = bookieAccountId(r.from);
      const to = bookieAccountId(r.to);
      if (!from || !to || !bankAccountId) continue;
      rows.push({
        import_key: r.importKey,
        type: "group",
        from_account_id: from,
        to_account_id: to,
        bank_account_id: bankAccountId,
        amount: r.amount,
        when: r.when,
        memo: r.memo,
      });
    } else if (r.kind === "deposit") {
      const to = bookieAccountId(r.to);
      if (!to) continue;
      rows.push({
        import_key: r.importKey,
        type: "deposit",
        to_account_id: to,
        amount: r.amount,
        when: r.when,
        memo: r.memo,
      });
    } else {
      const from = bookieAccountId(r.from);
      if (!from) continue;
      rows.push({
        import_key: r.importKey,
        type: "withdrawal",
        from_account_id: from,
        amount: r.amount,
        when: r.when,
        memo: r.memo,
      });
    }
  }
  return rows;
}
