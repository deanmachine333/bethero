import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";

const sb = createClient(
  "https://okdgqeezzrusfrxzufkd.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rZGdxZWV6enJ1c2ZyeHp1ZmtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNDcwMDIsImV4cCI6MjA5NjkyMzAwMn0.aBDvmGrSKDckqbZcEMqzFXIgJ36kXVkiH-EKqt0UECw"
);

const csv = `DatePlaced,Bookie,Event,Market,Stake,Currency,Odds,Type,PairID,IsFreeBet,Outcome,Return,CLV,Notes
2026-06-10T15:00,SelfTestBook,Arsenal vs Chelsea,Match Winner — Arsenal,20,GBP,2.10,EV+,,N,open,,,test1
10/06/2026 15:30,SelfTestBook,Spurs vs Liverpool,Draw,15,GBP,3.40,EV+,P1,N,open,,,test2
`;

const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true }).data;
console.log("parsed", parsed.length, "rows");

function parseDateFlexible(s) {
  if (!s) return null;
  const t = s.trim();
  const d1 = new Date(t);
  if (!isNaN(d1.getTime())) return d1;
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    const [, d, mo, y, hh = "0", mm = "0"] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const d2 = new Date(year, Number(mo) - 1, Number(d), Number(hh), Number(mm));
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

for (const r of parsed) console.log(r.DatePlaced, "->", parseDateFlexible(r.DatePlaced)?.toISOString());

// Create bookie
const bk = await sb.from("bookies").insert({ name: "SelfTestBook", currency: "GBP" }).select().single();
if (bk.error) { console.log("bookie:", bk.error.message); }
const bookie = bk.data ?? (await sb.from("bookies").select().eq("name","SelfTestBook").single()).data;

const records = parsed.map(r => ({
  date_placed: parseDateFlexible(r.DatePlaced).toISOString(),
  bookie_id: bookie.id, event: r.Event, market: r.Market,
  stake: Number(r.Stake), currency: r.Currency, odds: Number(r.Odds),
  type: r.Type, pair_id: r.PairID || null,
  is_free_bet: r.IsFreeBet.toUpperCase().startsWith("Y"),
  outcome: r.Outcome.toLowerCase(), return: 0,
}));

const up = await sb.from("bets").upsert(records, {
  onConflict: "date_placed,bookie_id,event,market,stake,odds", count: "exact"
});
console.log("upsert:", up.error?.message ?? "OK", "count=", up.count);

// Re-run to test upsert idempotency
const up2 = await sb.from("bets").upsert(records, {
  onConflict: "date_placed,bookie_id,event,market,stake,odds", count: "exact"
});
console.log("upsert again:", up2.error?.message ?? "OK", "count=", up2.count);

// Cleanup
await sb.from("bets").delete().eq("bookie_id", bookie.id);
await sb.from("bookies").delete().eq("id", bookie.id);
console.log("done");
