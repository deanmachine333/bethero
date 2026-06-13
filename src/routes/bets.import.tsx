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
import { parseCsv, type CsvBetRow, CSV_HEADERS } from "@/lib/csv";
import { computeReturn } from "@/lib/calc";
import { supabase } from "@/integrations/supabase/client";
import { fetchBookies } from "@/lib/queries";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { Info, Upload } from "lucide-react";

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
      const parsed = await parseCsv<CsvBetRow>(f);
      const validated = parsed.map((r) => {
        const errs: string[] = [];
        if (!r.DatePlaced) errs.push("DatePlaced");
        if (!r.Bookie) errs.push("Bookie");
        if (!r.Event) errs.push("Event");
        if (!r.Market) errs.push("Market");
        if (!r.Stake) errs.push("Stake");
        if (!r.Odds) errs.push("Odds");
        return { ...r, __error: errs.length ? `Missing: ${errs.join(", ")}` : undefined };
      });
      setRows(validated);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const run = useMutation({
    mutationFn: async () => {
      const valid = rows.filter((r) => !r.__error);
      if (valid.length === 0) throw new Error("No valid rows");

      // Build bookie lookup, creating missing
      const existing = new Map((bookiesQ.data ?? []).map((b) => [b.name.toLowerCase(), b]));
      const neededBookies = Array.from(
        new Map(
          valid.map((r) => [r.Bookie.toLowerCase(), { name: r.Bookie, currency: r.Currency || "GBP" }]),
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
        const { error } = await supabase.from("bets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
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
          date_placed: new Date(r.DatePlaced).toISOString(),
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

      const { error: upErr, count } = await supabase
        .from("bets")
        .upsert(records, {
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
        <AlertDescription className="text-xs font-mono">
          {CSV_HEADERS.join(", ")}
        </AlertDescription>
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
        <Button onClick={() => run.mutate()} disabled={rows.length === 0 || run.isPending}>
          <Upload className="mr-2 h-4 w-4" />
          {run.isPending ? "Importing…" : `Import ${rows.length - errors} rows`}
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
                    <TableCell className="text-xs">
                      {r.__error ?? "ok"}
                    </TableCell>
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
