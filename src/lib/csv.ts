// BetHero CSV parser. Tolerant of messy real-world exports: repeated header
// rows, mixed casing/spacing, NaN/blank values, currency symbols, etc.
import Papa from "papaparse";
import { parse as parseDate, isValid } from "date-fns";

export type BetType = "ev" | "arb";
export type Outcome = "open" | "win" | "loss" | "void";

export interface ParsedRow {
  /** Stable index in original file (1-based, post-cleanup). */
  rowNum: number;
  /** Deterministic external reference for idempotent re-imports. */
  externalRef: string;
  sport: string;
  league: string;
  event: string;
  /** Kickoff time (ISO) if parseable. */
  eventTime: string | null;
  market: string; // "BET" column
  betType: BetType;
  bookie: string;
  stake: number;
  currency: string;
  odds: number;
  evPct: number | null;
  clvPct: number | null;
  fairOdds: number | null;
  status: Outcome;
  /** When the bet was placed (ISO) if parseable. */
  placed: string | null;
  notes: string;
  isFreeBet: boolean;
  freeBetType: "snr" | "sr" | null;
  /** Default for open imports: stake already reflected in your manual opening balance. */
  stakePrefunded: boolean;
  /** Set by the grouping step; rows with the same value form one arb. */
  arbGroupKey: string | null;
  /** UI-only: row marked for skip in review. */
  skip: boolean;
  /** Issues found during parsing (display as warnings). */
  warnings: string[];
}

type RawRow = Record<string, string | undefined>;

const HEADER_ALIASES: Record<string, keyof RawRow> = {
  sport: "SPORT",
  league: "LEAGUE",
  event: "EVENT",
  time: "TIME",
  bet: "BET",
  "bet type": "BET TYPE",
  bettype: "BET TYPE",
  book: "BOOK",
  bookie: "BOOK",
  bookmaker: "BOOK",
  stake: "STAKE",
  currency: "CURRENCY",
  odds: "ODDS",
  ev: "EV",
  clv: "CLV",
  "fair odds": "FAIR ODDS",
  "current fair odds": "CURRENT FAIR ODDS",
  profile: "PROFILE",
  status: "STATUS",
  placed: "PLACED",
  notes: "NOTES",
};

function normHeader(h: string): string {
  return (HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toUpperCase()).toString();
}

function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/[£$€,]/g, "").replace(/%/g, "");
  if (!s || /^(nan|n\/a|-|—)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

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
  // try native first
  const native = new Date(s);
  if (isValid(native) && !Number.isNaN(native.getTime())) return native.toISOString();
  for (const fmt of DATE_FORMATS) {
    const d = parseDate(s, fmt, new Date());
    if (isValid(d)) return d.toISOString();
  }
  return null;
}

function mapBetType(raw: string | undefined): BetType {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.includes("arb")) return "arb";
  return "ev"; // default to EV (covers "+ev", "ev+", "value", blank)
}

function mapStatus(raw: string | undefined): Outcome {
  const s = (raw ?? "").trim().toLowerCase();
  if (/(^won$|^win$|^w$)/.test(s)) return "win";
  if (/(^lost$|^loss$|^l$)/.test(s)) return "loss";
  if (/(void|push|cancel|refund)/.test(s)) return "void";
  return "open"; // pending, open, or blank
}

function detectFreeBet(market: string, notes: string): { isFree: boolean; type: "snr" | "sr" | null } {
  const blob = `${market} ${notes}`.toLowerCase();
  if (/\b(free\s*bet|freebet|\bfb\b|token)\b/.test(blob)) {
    if (/\bsr\b|stake\s*returned/.test(blob)) return { isFree: true, type: "sr" };
    return { isFree: true, type: "snr" };
  }
  return { isFree: false, type: null };
}

function normEvent(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function externalRef(parts: Array<string | number | null | undefined>): string {
  // Deterministic, browser-safe (no crypto.subtle). Good enough as a dedupe key
  // within one user_id namespace.
  const s = parts.map((p) => (p == null ? "" : String(p))).join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
    h2 = (h2 + s.charCodeAt(i) * 31) >>> 0;
  }
  return `${(h1 >>> 0).toString(16)}-${h2.toString(16)}-${s.length}`;
}

export async function parseBetheroCsv(file: File): Promise<ParsedRow[]> {
  const text = await file.text();
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normHeader(h),
  });

  const rows: ParsedRow[] = [];
  let rowNum = 0;

  for (const raw of result.data) {
    if (!raw) continue;
    // Drop repeated header rows that some exporters embed mid-file.
    if ((raw.BOOK ?? "").toString().trim().toUpperCase() === "BOOK") continue;
    // Drop completely empty lines.
    const hasAny = Object.values(raw).some((v) => v != null && String(v).trim().length > 0);
    if (!hasAny) continue;

    rowNum += 1;
    const warnings: string[] = [];

    const bookie = (raw.BOOK ?? "").toString().trim();
    if (!bookie) warnings.push("missing BOOK");

    const event = (raw.EVENT ?? "").toString().trim();
    if (!event) warnings.push("missing EVENT");

    const market = (raw.BET ?? "").toString().trim();
    const notes = (raw.NOTES ?? "").toString().trim();
    const stake = parseNumber(raw.STAKE) ?? 0;
    const odds = parseNumber(raw.ODDS) ?? 0;
    if (stake <= 0) warnings.push("invalid STAKE");
    if (odds <= 1) warnings.push("invalid ODDS");

    const placed = parseDateTolerant(raw.PLACED);
    const eventTime = parseDateTolerant(raw.TIME);
    const status = mapStatus(raw.STATUS);
    const betType = mapBetType(raw["BET TYPE"]);
    const fb = detectFreeBet(market, notes);

    const sport = (raw.SPORT ?? "").toString().trim();
    const league = (raw.LEAGUE ?? "").toString().trim();
    const currency = ((raw.CURRENCY ?? "GBP").toString().trim() || "GBP").toUpperCase();
    const evPct = parseNumber(raw.EV);
    const clvPct = parseNumber(raw.CLV);
    const fairOdds = parseNumber(raw["FAIR ODDS"]);

    rows.push({
      rowNum,
      externalRef: externalRef([placed, bookie, normEvent(event), market, stake, odds, betType]),
      sport,
      league,
      event,
      eventTime,
      market,
      betType,
      bookie,
      stake,
      currency,
      odds,
      evPct,
      clvPct,
      fairOdds,
      status,
      placed,
      notes,
      isFreeBet: fb.isFree,
      freeBetType: fb.type,
      // Default ON for OPEN bets (assumed already reflected in opening balance);
      // OFF for already-settled imports so historical P/L flows through ledger.
      stakePrefunded: status === "open",
      arbGroupKey: null,
      skip: false,
      warnings,
    });
  }

  // Auto-group arbs: same normalised event, same eventTime within ±5min,
  // placed within ±15min, different bookies. Pair greedily.
  const arbs = rows.filter((r) => r.betType === "arb");
  const used = new Set<number>();
  let g = 0;
  for (let i = 0; i < arbs.length; i++) {
    const a = arbs[i];
    if (used.has(a.rowNum)) continue;
    let bestJ = -1;
    let bestDelta = Infinity;
    for (let j = i + 1; j < arbs.length; j++) {
      const b = arbs[j];
      if (used.has(b.rowNum)) continue;
      if (normEvent(a.event) !== normEvent(b.event)) continue;
      if (a.bookie.toLowerCase() === b.bookie.toLowerCase()) continue;
      const placedDelta =
        a.placed && b.placed
          ? Math.abs(new Date(a.placed).getTime() - new Date(b.placed).getTime())
          : 0;
      const eventDelta =
        a.eventTime && b.eventTime
          ? Math.abs(new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime())
          : 0;
      if (placedDelta > 15 * 60_000) continue;
      if (eventDelta > 5 * 60_000) continue;
      const total = placedDelta + eventDelta;
      if (total < bestDelta) {
        bestDelta = total;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      const b = arbs[bestJ];
      g += 1;
      const key = `arb-${g}`;
      a.arbGroupKey = key;
      b.arbGroupKey = key;
      used.add(a.rowNum);
      used.add(b.rowNum);
    } else {
      // single arb leg — flag it
      a.warnings.push("arb has no pair");
    }
  }

  return rows;
}

/** Group parsed rows into bets ready to send to import_bets_batch. */
export function rowsToBetPayload(rows: ParsedRow[]): unknown[] {
  const out: unknown[] = [];
  const byGroup = new Map<string, ParsedRow[]>();
  for (const r of rows) {
    if (r.skip) continue;
    if (r.betType === "arb" && r.arbGroupKey) {
      const list = byGroup.get(r.arbGroupKey) ?? [];
      list.push(r);
      byGroup.set(r.arbGroupKey, list);
    } else {
      out.push(buildBet([r]));
    }
  }
  for (const legs of byGroup.values()) {
    out.push(buildBet(legs));
  }
  return out;
}

function buildBet(legs: ParsedRow[]) {
  const head = legs[0];
  return {
    external_ref:
      legs.length > 1
        ? externalRef(legs.map((l) => l.externalRef).sort())
        : head.externalRef,
    bet_type: head.betType,
    date_placed: head.placed ?? new Date().toISOString(),
    event_time: head.eventTime,
    event: head.event,
    market: head.market,
    sport: head.sport,
    league: head.league,
    ev_pct: head.evPct,
    clv_pct: head.clvPct,
    fair_odds: head.fairOdds,
    notes: head.notes,
    legs: legs.map((l) => ({
      bookie_name: l.bookie,
      selection: l.market,
      market: l.market,
      odds: l.odds,
      stake: l.stake,
      is_free_bet: l.isFreeBet,
      free_bet_type: l.freeBetType,
      stake_prefunded: l.stakePrefunded,
      outcome: l.status,
      currency: l.currency,
    })),
  };
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
