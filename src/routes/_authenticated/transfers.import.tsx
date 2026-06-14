import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, Upload, CheckCircle2, FileText, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  parseTransferCsv,
  groupTransferRows,
  resolvedToRpcRows,
  type ParsedTransferRow,
  type ResolvedTransfer,
} from "@/lib/transfers-csv";
import { fetchAccounts, importTransfersBatch } from "@/lib/ledger-queries";
import { fmtMoney } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/transfers/import")({
  head: () => ({ meta: [{ title: "Import transfers — BetHero" }] }),
  component: ImportTransfersPage,
});

type Step = "upload" | "review" | "done";

function ImportTransfersPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const accounts = accountsQ.data ?? [];
  const bookies = accounts.filter((a) => a.kind === "bookie");
  const bank = accounts.find((a) => a.kind === "bank");

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ParsedTransferRow[]>([]);
  const [resolved, setResolved] = useState<ResolvedTransfer[]>([]);
  const [bookieMap, setBookieMap] = useState<Record<string, string>>({});
  const [bankId, setBankId] = useState<string>(bank?.id ?? "");
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: { error: string }[];
  } | null>(null);

  const uniqueBookies = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.bookie && set.add(r.bookie));
    return [...set].sort();
  }, [rows]);

  async function onFile(file: File) {
    try {
      const parsed = await parseTransferCsv(file);
      if (!parsed.length) {
        toast.error("No rows parsed from CSV");
        return;
      }
      setRows(parsed);
      const grouped = groupTransferRows(parsed);
      setResolved(grouped);
      // Auto-map bookies
      const map: Record<string, string> = {};
      const uniques = new Set(parsed.map((r) => r.bookie).filter(Boolean));
      uniques.forEach((name) => {
        const existing = bookies.find((b) => b.name.toLowerCase() === name.toLowerCase());
        if (existing) map[name] = existing.id;
      });
      setBookieMap(map);
      if (bank) setBankId(bank.id);
      setStep("review");
      toast.success(`Parsed ${parsed.length} rows → ${grouped.length} movements`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void onFile(f);
  }

  const importMut = useMutation({
    mutationFn: () => {
      const lookup = (name: string) => bookieMap[name] || null;
      // Validate all required bookies are mapped
      const missing = resolved
        .flatMap((r) =>
          r.kind === "transfer"
            ? [r.from, r.to]
            : r.kind === "deposit"
              ? [r.to]
              : [r.from],
        )
        .filter((n) => !lookup(n));
      if (missing.length) throw new Error(`Map all bookies first: ${[...new Set(missing)].join(", ")}`);
      const hasGroup = resolved.some((r) => r.kind === "transfer");
      if (hasGroup && !bankId) throw new Error("Pick a bank/transit account for grouped transfers");
      const payload = resolvedToRpcRows(resolved, lookup, bankId || null);
      return importTransfersBatch(payload);
    },
    onSuccess: (res) => {
      setResult(res);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(`Imported ${res.created}, skipped ${res.skipped}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = {
    transfers: resolved.filter((r) => r.kind === "transfer").length,
    deposits: resolved.filter((r) => r.kind === "deposit").length,
    withdrawals: resolved.filter((r) => r.kind === "withdrawal").length,
  };

  return (
    <AppShell title="Import transfers">
      {step === "upload" && (
        <Card>
          <CardContent className="p-4 sm:p-8">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={onDrop}
              className={
                "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition sm:p-12 " +
                (dragActive
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/20 hover:border-primary hover:bg-primary/5")
              }
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
                {dragActive ? <FileText className="h-7 w-7 text-primary" /> : <Upload className="h-7 w-7 text-primary" />}
              </div>
              <div className="text-lg font-semibold">Drop your BetHero transfers CSV</div>
              <div className="mt-1 text-sm text-muted-foreground">or browse to choose a file</div>
              <Button type="button" className="mt-5" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <Upload className="mr-2 h-4 w-4" /> Browse CSV file
              </Button>
              <div className="mt-5 max-w-3xl text-xs leading-5 text-muted-foreground">
                Expected columns: BOOK, PROFILE, TYPE (deposit/withdrawal), AMOUNT, METHOD,
                TIME, NOTES. Withdrawal+deposit pairs with matching amount and time/notes
                are auto-grouped as bookie ↔ bookie transfers via your bank account.
                Re-importing the same file is safe — already-imported rows are skipped.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <>
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="mb-2 text-sm font-medium">Bookie mapping</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {uniqueBookies.map((name) => (
                  <div key={name} className="flex items-center gap-2 rounded border p-2">
                    <div className="flex-1 truncate text-sm">{name}</div>
                    <Select
                      value={bookieMap[name] ?? ""}
                      onValueChange={(v) => setBookieMap((m) => ({ ...m, [name]: v }))}
                    >
                      <SelectTrigger className="h-8 w-48 text-xs">
                        <SelectValue placeholder="-- pick account --" />
                      </SelectTrigger>
                      <SelectContent>
                        {bookies.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {counts.transfers > 0 && (
                <div className="mt-3">
                  <Label className="text-xs">Bank / transit account for grouped transfers</Label>
                  <Select value={bankId} onValueChange={setBankId}>
                    <SelectTrigger className="h-9 max-w-md">
                      <SelectValue placeholder="Pick bank/transit account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((a) => a.kind === "bank")
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardContent className="p-3">
              <div className="mb-2 text-xs text-muted-foreground">
                {counts.transfers} transfers · {counts.deposits} deposits · {counts.withdrawals} withdrawals
              </div>
              <ul className="divide-y text-sm">
                {resolved.map((r) => (
                  <li key={r.importKey} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={r.kind === "transfer" ? "secondary" : "outline"}>
                        {r.kind}
                      </Badge>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.when ? r.when.slice(0, 16).replace("T", " ") : "—"}
                      </div>
                      <div className="truncate">
                        {r.kind === "transfer" ? (
                          <>
                            {r.from} <ArrowRight className="inline h-3 w-3" /> {r.to}
                          </>
                        ) : r.kind === "deposit" ? (
                          <>External <ArrowRight className="inline h-3 w-3" /> {r.to}</>
                        ) : (
                          <>{r.from} <ArrowRight className="inline h-3 w-3" /> External</>
                        )}
                      </div>
                      {r.memo && (
                        <span className="truncate text-xs text-muted-foreground">· {r.memo}</span>
                      )}
                    </div>
                    <div className="font-mono">{fmtMoney(r.amount)}</div>
                  </li>
                ))}
              </ul>
              {rows.some((r) => r.warnings.length) && (
                <div className="mt-3 flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  {rows.filter((r) => r.warnings.length).length} rows have warnings and were skipped.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="sticky bottom-2 flex items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-sm">
            <div className="text-sm text-muted-foreground">
              {resolved.length} movements ready to import
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button
                disabled={importMut.isPending || resolved.length === 0}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending ? "Importing…" : `Import ${resolved.length}`}
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
              {result.created} movements created · {result.skipped} duplicates skipped ·{" "}
              {result.errors.length} errors
            </div>
            {result.errors.length > 0 && (
              <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-xs">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="rounded bg-muted/40 px-2 py-1">{e.error}</li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <Button asChild>
                <Link to="/transfers">View transfers</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setResolved([]);
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
