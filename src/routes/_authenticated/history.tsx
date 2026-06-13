import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { fetchAccounts, fetchLedger } from "@/lib/ledger-queries";
import { fmtMoney } from "@/lib/ledger";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History — BetHero" }] }),
  component: HistoryPage,
});

const TYPES = [
  "all",
  "opening_balance",
  "deposit",
  "withdrawal",
  "transfer_out",
  "transfer_in",
  "bet_stake",
  "bet_settlement",
  "free_bet_settlement",
  "manual_correction",
];

function HistoryPage() {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const ledgerQ = useQuery({ queryKey: ["ledger"], queryFn: fetchLedger });
  const accounts = accountsQ.data ?? [];
  const entries = ledgerQ.data ?? [];

  const [type, setType] = useState("all");
  const [accountId, setAccountId] = useState("all");

  const filtered = entries
    .filter((e) => type === "all" || e.entry_type === type)
    .filter((e) => accountId === "all" || e.account_id === accountId)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  function exportCsv() {
    const header = ["date", "account", "type", "amount", "memo"];
    const rows = filtered.map((e) => [
      e.occurred_at,
      accounts.find((a) => a.id === e.account_id)?.name ?? "",
      e.entry_type,
      String(e.amount),
      e.memo ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="History">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-sm"
            >
              <option value="all">all accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
          <ul className="divide-y">
            {filtered.map((e) => {
              const ac = accounts.find((a) => a.id === e.account_id);
              return (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {e.occurred_at.slice(0, 16).replace("T", " ")}
                    </div>
                    <div>
                      <span className="font-medium">{ac?.name ?? "—"}</span>
                      <span className="text-muted-foreground"> · {e.entry_type}</span>
                      {e.memo && <span className="text-muted-foreground"> · {e.memo}</span>}
                    </div>
                  </div>
                  <div
                    className={
                      "font-mono " +
                      (Number(e.amount) >= 0 ? "text-[var(--win)]" : "text-[var(--loss)]")
                    }
                  >
                    {fmtMoney(Number(e.amount), ac?.currency)}
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">No entries.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </AppShell>
  );
}
