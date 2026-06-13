import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchBank } from "@/lib/queries";
import { fmtMoney } from "@/lib/calc";

export const Route = createFileRoute("/bank")({
  head: () => ({ meta: [{ title: "Bank ledger — Bookie Wallet" }] }),
  component: BankPage,
});

function BankPage() {
  const bankQ = useQuery({ queryKey: ["bank"], queryFn: fetchBank });
  const rows = bankQ.data ?? [];

  // Per-currency running balance
  const running = new Map<string, number>();
  const withRun = rows.map((r) => {
    const cur = r.currency || "GBP";
    const prev = running.get(cur) ?? 0;
    const next = r.direction === "in" ? prev + Number(r.amount) : prev - Number(r.amount);
    running.set(cur, next);
    return { ...r, running_balance: next };
  });

  return (
    <AppShell title="Bank ledger">
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Running</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withRun.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No bank movements yet. Advance a transfer's status to populate this.
                  </TableCell>
                </TableRow>
              )}
              {withRun.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.date}</TableCell>
                  <TableCell className={r.direction === "in" ? "text-[var(--profit)]" : "text-[var(--loss)]"}>
                    {r.direction === "in" ? "In ↓" : "Out ↑"}
                  </TableCell>
                  <TableCell>{r.from_label}</TableCell>
                  <TableCell>{r.to_label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoney(Number(r.amount), r.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmtMoney(r.running_balance, r.currency)}
                  </TableCell>
                  <TableCell className="text-xs">{r.reference ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
