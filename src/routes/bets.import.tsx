import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseCsv, type CsvBetRow, CSV_HEADERS, downloadCsv, toCsv } from "@/lib/csv";
import { computeReturn } from "@/lib/calc";
import { supabase } from "@/integrations/supabase/client";
import { fetchBookies } from "@/lib/queries";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { Download, Info, Upload } from "lucide-react";

function parseDateFlexible(s: string): Date | null {
  if (!s) return null;
  const t = s.trim();
  const d1 = new Date(t);
  if (!isNaN(d1.getTime())) return d1;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    const [, d, mo, y, hh = "0", mm = "0"] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const d2 = new Date(year, Number(mo) - 1, Number(d), Number(hh), Number(mm));
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

// Map row from either the native CsvBetRow schema OR the user's tracker export
// (SPORT,LEAGUE,EVENT,TIME,BET,BET TYPE,BOOK,STAKE,CURRENCY,ODDS,EV,CLV,FAIR ODDS,CURRENT FAIR ODDS,PROFILE,STATUS,PLACED,NOTES)
function mapRow(r: Record<string, string>): CsvBetRow {
  const get = (k: string) => {
    const found = Object.keys(r).find((x) => x.trim().toLowerCase() === k.toLowerCase());
    return found ? String(r[found] ?? "").trim() : "";
  };
  // Native format detection
  if (get("DatePlaced") || get("Bookie")) {
    return {
      DatePlaced: get("DatePlaced"),
      Bookie: get("Bookie"),
      Event: get("Event"),
      Market: get("Market"),
      Stake: get("Stake"),
      Currency: get("Currency") || "GBP",
      Odds: get("Odds"),
      Type: get("Type") || "EV+",
      PairID: get("PairID"),
      IsFreeBet: get("IsFreeBet") || "N",
      Outcome: get("Outcome") || "open",
      Return: get("Return"),
      CLV: get("CLV"),
      Notes: get("Notes"),
    };
  }
  // Tracker export
  const league = get("LEAGUE");
  const event = get("EVENT");
  const betType = get("BET TYPE").toLowerCase();
  const type = betType.includes("arb") ? "ARB" : betType.includes("ev") ? "EV+" : betType || "EV+";
  const outcome = normalizeOutcome(get("STATUS"));
  const clvRaw = get("CLV").replace("%", "").trim();
  const placed = get("PLACED");
  const notes = [get("NOTES"), placed ? `placed:${placed}` : "", get("PROFILE") ? `profile:${get("PROFILE")}` : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    DatePlaced: get("TIME") || placed,
    Bookie: get("BOOK"),
    Event: league ? `${league} — ${event}` : event,
    Market: get("BET"),
    Stake: get("STAKE"),
    Currency: get("CURRENCY") || "GBP",
    Odds: get("ODDS"),
    Type: type,
    PairID: "",
    IsFreeBet: "N",
    Outcome: outcome,
    Return: "",
    CLV: clvRaw,
    Notes: notes,
  };
}

const SAMPLE_ROWS = [
  {
    DatePlaced: "2026-06-10T15:00",
    Bookie: "Bet365",
    Event: "Arsenal vs Chelsea",
    Market: "Match Winner — Arsenal",
    Stake: "20",
    Currency: "GBP",
    Odds: "2.10",
    Type: "EV+",
    PairID: "",
    IsFreeBet: "N",
    Outcome: "open",
    Return: "",
    CLV: "",
    Notes: "sample",
  },
];

export const Route = createFileRoute("/bets/import")({
  head: () => ({ meta: [{ title: "Import CSV — Bookie Wallet" }] }),
  component: ImportPage,
});

interface ParsedRow extends CsvBetRow {
  __error?: string;
}

function ImportPage() {
  const qc = useQueryClient();
  const bookiesQ = useQuery({ queryKey: ["bookies"], queryFn: fetchBookies });
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mode, setMode] = useState<"upsert" | "overwrite">("upsert");
  const [fileName, setFileName] = useState("");

  const onFile = async (f: File) => {
    setFileName(f.name);
    try {
      const raw = await parseCsv<Record<string, string>>(f);
      const mapped = raw.map((r) => mapRow(r));
      const validated = mapped.map((r) => {
        const errs: string[] = [];
        if (!r.DatePlaced) errs.push("DatePlaced");
        else if (!parseDateFlexible(String(r.DatePlaced))) errs.push("DatePlaced (unparseable)");
        if (!r.Bookie) errs.push("Bookie");
        if (!r.Event) errs.push("Event");
        if (!r.Market) errs.push("Market");
        if (r.Stake === undefined || r.Stake === "" || Number.isNaN(Number(r.Stake))) {
          errs.push("Stake");
        }
        if (r.Odds === undefined || r.Odds === "" || Number.isNaN(Number(r.Odds))) {
          errs.push("Odds");
        }
        return { ...r, __error: errs.length ? `Missing/invalid: ${errs.join(", ")}` : undefined };
      });
      setRows(validated);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const run = useMutation({
    mutationFn: async () => {
      if (rows.length === 0) throw new Error("Choose a CSV file first");
      const valid = rows.filter((r) => !r.__error);
      if (valid.length === 0) throw new Error("No valid rows to import — check the Status column");

      // Build bookie lookup, creating missing
      const existing = new Map((bookiesQ.data ?? []).map((b) => [b.name.toLowerCase(), b]));
      const neededBookies = Array.from(
        new Map(
          valid.map((r) => [
            r.Bookie.toLowerCase(),
            { name: r.Bookie, currency: r.Currency || "GBP" },
          ]),
        ).values(),
      );
      const missing = neededBookies.filter((n) => !existing.has(n.name.toLowerCase()));
      if (missing.length) {
        const { data: newOnes, error } = await supabase
          .from("bookies")
          .insert(missing.map((m) => ({ name: m.name, currency: m.currency })))
          .select();
        if (error) throw error;
        for (const b of newOnes ?? []) existing.set(b.name.toLowerCase(), b);
      }

      if (mode === "overwrite") {
        const { error } = await supabase
          .from("bets")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) throw error;
      }

      const records = valid.map((r) => {
        const stake = Number(r.Stake);
        const odds = Number(r.Odds);
        const isFree = String(r.IsFreeBet).toUpperCase().startsWith("Y");
        const outcome = (r.Outcome || "open").toLowerCase();
        const ret =
          r.Return !== undefined && r.Return !== "" && !Number.isNaN(Number(r.Return))
            ? Number(r.Return)
            : computeReturn(stake, odds, isFree, outcome);
        const bookie = existing.get(r.Bookie.toLowerCase())!;
        return {
          date_placed: parseDateFlexible(String(r.DatePlaced))!.toISOString(),
          bookie_id: bookie.id,
          event: r.Event,
          market: r.Market,
          stake,
          currency: r.Currency || "GBP",
          odds,
          type: r.Type || "EV+",
          pair_id: r.PairID || null,
          is_free_bet: isFree,
          outcome,
          return: ret,
          clv: r.CLV ? Number(r.CLV) : null,
          notes: r.Notes || null,
        };
      });

      const { error: upErr, count } = await supabase.from("bets").upsert(records, {
        onConflict: "date_placed,bookie_id,event,market,stake,odds",
        count: "exact",
      });
      if (upErr) throw upErr;

      await logAudit("import", null, "import", {
        new_value: { file: fileName, mode, rows: records.length, affected: count },
      });
      return records.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["bets"] });
      qc.invalidateQueries({ queryKey: ["bookies"] });
      toast.success(`Imported ${n} rows`);
      setRows([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const errors = rows.filter((r) => r.__error).length;

  return (
    <AppShell title="Import bets from CSV">
      <Alert className="mb-4">
        <Info className="h-4 w-4" />
        <AlertTitle>Expected columns</AlertTitle>
        <AlertDescription className="text-xs font-mono">{CSV_HEADERS.join(", ")}</AlertDescription>
      </Alert>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs">CSV file</Label>
          <Input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
        <div>
          <Label className="text-xs">Mode</Label>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as "upsert" | "overwrite")}
            className="flex gap-3 h-9 items-center"
          >
            <label className="flex items-center gap-1 text-sm">
              <RadioGroupItem value="upsert" /> Upsert
            </label>
            <label className="flex items-center gap-1 text-sm">
              <RadioGroupItem value="overwrite" /> Overwrite
            </label>
          </RadioGroup>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          <Upload className="mr-2 h-4 w-4" />
          {run.isPending ? "Importing…" : `Import ${rows.length - errors} rows`}
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadCsv("sample-bets.csv", toCsv(SAMPLE_ROWS, CSV_HEADERS))}
        >
          <Download className="mr-2 h-4 w-4" /> Sample CSV
        </Button>
        <Button asChild variant="link">
          <Link to="/bets">Back to bets</Link>
        </Button>
      </div>

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {CSV_HEADERS.map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r, i) => (
                  <TableRow key={i} className={r.__error ? "bg-destructive/10" : ""}>
                    {CSV_HEADERS.map((h) => (
                      <TableCell key={h} className="text-xs">
                        {(r as unknown as Record<string, string>)[h] ?? ""}
                      </TableCell>
                    ))}
                    <TableCell className="text-xs">{r.__error ?? "ok"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 200 && (
              <p className="p-3 text-xs text-muted-foreground">
                Showing first 200 of {rows.length} rows.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
