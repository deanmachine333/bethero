import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { parseBetheroCsv, rowsToBetPayload, type ParsedRow } from "@/lib/csv";
import { fetchAccounts, importBetsBatch } from "@/lib/ledger-queries";
import { fmtMoney } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/bets/import")({
  head: () => ({ meta: [{ title: "Import — BetHero" }] }),
  component: ImportPage,
});

type Step = "upload" | "review" | "done";

function ImportPage() {
  const qc = useQueryClient();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const accounts = accountsQ.data ?? [];
  const bookies = accounts.filter((a) => a.kind === "bookie");

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: { error: string }[] } | null>(null);

  /** Bookie name → mapped existing account id ("" = create new on import). */
  const [bookieMap, setBookieMap] = useState<Record<string, string>>({});

  const uniqueBookies = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.bookie && set.add(r.bookie));
    return [...set].sort();
  }, [rows]);

  const importMut = useMutation({
    mutationFn: async () => {
      // Apply bookie mapping: replace each row's bookie with the chosen existing name.
      const mapped = rows.map((r) => {
        const id = bookieMap[r.bookie];
        if (id) {
          const acct = bookies.find((b) => b.id === id);
          if (acct) return { ...r, bookie: acct.name };
        }
        return r;
      });
      const payload = rowsToBetPayload(mapped);
      return importBetsBatch(payload);
    },
    onSuccess: (res) => {
      setResult(res);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["bets_v2"] });
      qc.invalidateQueries({ queryKey: ["bet_legs"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success(`Imported ${res.created}, skipped ${res.skipped}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(file: File) {
    try {
      const parsed = await parseBetheroCsv(file);
      if (!parsed.length) {
        toast.error("No rows parsed from CSV");
        return;
      }
      setRows(parsed);
      // pre-fill bookie map: exact lowercase match
      const map: Record<string, string> = {};
      const uniques = new Set(parsed.map((r) => r.bookie).filter(Boolean));
      uniques.forEach((name) => {
        const existing = bookies.find((b) => b.name.toLowerCase() === name.toLowerCase());
        if (existing) map[name] = existing.id;
      });
      setBookieMap(map);
      setStep("review");
      toast.success(`Parsed ${parsed.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
    }
  }

  const updateRow = (i: number, patch: Partial<ParsedRow>) =>
    setRows((curr) => curr.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const toImport = rows.filter((r) => !r.skip);
  const willCreateBookies = uniqueBookies.filter((n) => !bookieMap[n]).length;

  return (
    <AppShell title="Import bets">
      {step === "upload" && (
        <Card>
          <CardContent className="p-8 text-center">
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <div className="mb-1 font-medium">Drop your BetHero CSV export</div>
            <div className="mb-4 text-sm text-muted-foreground">
              Columns expected: SPORT, LEAGUE, EVENT, TIME, BET, BET TYPE, BOOK, STAKE,
              CURRENCY, ODDS, EV, CLV, FAIR ODDS, CURRENT FAIR ODDS, PROFILE, STATUS,
              PLACED, NOTES. Re-uploading the same file is safe — duplicates are skipped.
            </div>
            <input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <Button asChild>
              <label htmlFor="csv" className="cursor-pointer">
                Choose CSV file
              </label>
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <>
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="mb-2 text-sm font-medium">Bookie mapping</div>
              <div className="text-xs text-muted-foreground mb-3">
                Each unique bookie in the CSV maps to an existing account or will be
                auto-created on import.
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {uniqueBookies.map((name) => (
                  <div key={name} className="flex items-center gap-2 rounded border p-2">
                    <div className="flex-1 truncate text-sm">{name}</div>
                    <Select
                      value={bookieMap[name] ?? "__new__"}
                      onValueChange={(v) =>
                        setBookieMap((m) => ({ ...m, [name]: v === "__new__" ? "" : v }))
                      }
                    >
                      <SelectTrigger className="h-8 w-48 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__new__">+ Create new bookie</SelectItem>
                        {bookies.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            Map to {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardContent className="p-3">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="p-1">Skip</th>
                      <th className="p-1">Placed</th>
                      <th className="p-1">Event</th>
                      <th className="p-1">Type</th>
                      <th className="p-1">Bookie</th>
                      <th className="p-1">Stake</th>
                      <th className="p-1">Odds</th>
                      <th className="p-1">Status</th>
                      <th className="p-1">Free?</th>
                      <th className="p-1">Prefunded</th>
                      <th className="p-1">Arb pair</th>
                      <th className="p-1">⚠</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={r.skip ? "opacity-40" : ""}>
                        <td className="p-1">
                          <Switch
                            checked={!r.skip}
                            onCheckedChange={(v) => updateRow(i, { skip: !v })}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          {r.placed ? r.placed.slice(0, 16).replace("T", " ") : "—"}
                        </td>
                        <td className="p-1 max-w-[200px] truncate">{r.event}</td>
                        <td className="p-1">
                          <Badge variant={r.betType === "arb" ? "secondary" : "default"}>
                            {r.betType}
                          </Badge>
                        </td>
                        <td className="p-1">{r.bookie}</td>
                        <td className="p-1 font-mono">{r.stake}</td>
                        <td className="p-1 font-mono">{r.odds}</td>
                        <td className="p-1">
                          <Select
                            value={r.status}
                            onValueChange={(v) =>
                              updateRow(i, {
                                status: v as ParsedRow["status"],
                                stakePrefunded: v === "open" ? r.stakePrefunded : false,
                              })
                            }
                          >
                            <SelectTrigger className="h-7 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">open</SelectItem>
                              <SelectItem value="win">win</SelectItem>
                              <SelectItem value="loss">loss</SelectItem>
                              <SelectItem value="void">void</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-1">
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={r.isFreeBet}
                              onCheckedChange={(v) =>
                                updateRow(i, {
                                  isFreeBet: v,
                                  freeBetType: v ? r.freeBetType ?? "snr" : null,
                                })
                              }
                            />
                            {r.isFreeBet && (
                              <Select
                                value={r.freeBetType ?? "snr"}
                                onValueChange={(v) =>
                                  updateRow(i, { freeBetType: v as "snr" | "sr" })
                                }
                              >
                                <SelectTrigger className="h-6 w-16 text-[10px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="snr">SNR</SelectItem>
                                  <SelectItem value="sr">SR</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </td>
                        <td className="p-1">
                          <Switch
                            checked={r.stakePrefunded}
                            disabled={r.status !== "open"}
                            onCheckedChange={(v) => updateRow(i, { stakePrefunded: v })}
                          />
                        </td>
                        <td className="p-1">
                          {r.betType === "arb" ? (
                            <Input
                              className="h-7 w-20 text-xs"
                              value={r.arbGroupKey ?? ""}
                              onChange={(e) =>
                                updateRow(i, { arbGroupKey: e.target.value || null })
                              }
                              placeholder="—"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-1">
                          {r.warnings.length > 0 && (
                            <span title={r.warnings.join("; ")}>
                              <AlertTriangle className="h-3 w-3 text-[var(--loss)]" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-2 flex items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-sm">
            <div className="text-sm text-muted-foreground">
              {toImport.length} rows will be imported · {willCreateBookies} new bookies will be
              created · open bets default to "stake already in opening balance"
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                disabled={importMut.isPending || toImport.length === 0}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending ? "Importing…" : `Import ${toImport.length} rows`}
              </Button>
            </div>
          </div>
        </>
      )}

      {step === "done" && result && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-[var(--win)]" />
            <div className="text-xl font-semibold">Import complete</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {result.created} bets created · {result.skipped} duplicates skipped ·{" "}
              {result.errors.length} errors
            </div>
            {result.errors.length > 0 && (
              <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-xs">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="rounded bg-muted/40 px-2 py-1">
                    {e.error}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <Button asChild>
                <Link to="/bets">View bets</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setResult(null);
                }}
              >
                Import another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

// silence unused-import warning when fmtMoney isn't referenced (kept for future row preview)
void fmtMoney;
