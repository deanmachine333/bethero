import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { fetchAccounts, fetchLedger, createTransfer } from "@/lib/ledger-queries";
import { accountBalance, fmtMoney } from "@/lib/ledger";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({ meta: [{ title: "Transfers — BetHero" }] }),
  component: TransfersPage,
});

const BANK = "__bank__";
const EXTERNAL = "__external__";

function TransfersPage() {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const ledgerQ = useQuery({ queryKey: ["ledger"], queryFn: fetchLedger });
  const accounts = accountsQ.data ?? [];
  const entries = ledgerQ.data ?? [];

  // Group transfer ledger entries by transfer_group_id
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!e.transfer_group_id) continue;
    const list = groups.get(e.transfer_group_id) ?? [];
    list.push(e);
    groups.set(e.transfer_group_id, list);
  }
  const transferRows = [...groups.values()].sort(
    (a, b) => new Date(b[0].occurred_at).getTime() - new Date(a[0].occurred_at).getTime(),
  );

  // Single deposits/withdrawals (no group, top-up or cash-out)
  const singles = entries
    .filter(
      (e) =>
        !e.transfer_group_id && (e.entry_type === "deposit" || e.entry_type === "withdrawal"),
    )
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  return (
    <AppShell title="Transfers">
      <div className="mb-4 flex justify-end">
        <TransferDialog accounts={accounts} entries={entries} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 text-sm font-medium">Recent transfers</div>
          {transferRows.length === 0 && singles.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">No transfers yet.</div>
          )}
          <ul className="divide-y">
            {transferRows.map((g) => {
              const out = g.find((e) => Number(e.amount) < 0);
              const inn = g.find((e) => Number(e.amount) > 0);
              const fromAc = accounts.find((a) => a.id === out?.account_id);
              const toAc = accounts.find((a) => a.id === inn?.account_id);
              const amt = inn ? Number(inn.amount) : Math.abs(Number(out?.amount ?? 0));
              return (
                <li
                  key={g[0].transfer_group_id ?? g[0].id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="text-muted-foreground">
                    {g[0].occurred_at.slice(0, 10)} · {fromAc?.name ?? "—"}{" "}
                    <ArrowRight className="inline h-3 w-3" /> {toAc?.name ?? "—"}
                  </div>
                  <div className="font-mono">{fmtMoney(amt)}</div>
                </li>
              );
            })}
            {singles.map((e) => {
              const ac = accounts.find((a) => a.id === e.account_id);
              return (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="text-muted-foreground">
                    {e.occurred_at.slice(0, 10)} · {e.entry_type === "deposit" ? "External in" : "External out"} ·{" "}
                    {ac?.name}
                  </div>
                  <div
                    className={
                      "font-mono " +
                      (Number(e.amount) >= 0 ? "text-[var(--win)]" : "text-[var(--loss)]")
                    }
                  >
                    {fmtMoney(Number(e.amount))}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function TransferDialog({
  accounts,
  entries,
}: {
  accounts: ReturnType<typeof Array.prototype.slice> extends never[] ? never : any;
  entries: any;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const bank = (accounts as any[]).find((a) => a.kind === "bank");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const f = from === EXTERNAL ? null : from === BANK ? bank?.id ?? null : from || null;
      const t = to === EXTERNAL ? null : to === BANK ? bank?.id ?? null : to || null;
      return createTransfer(f, t, Number(amount), undefined, memo || undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("Transfer recorded");
      setOpen(false);
      setAmount("");
      setMemo("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = (accounts as any[]).map((a) => ({ value: a.id, label: a.name }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record transfer</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EXTERNAL}>🌍 External (top-up)</SelectItem>
                {bank && <SelectItem value={BANK}>🏦 {bank.name}</SelectItem>}
                {options
                  .filter((o) => o.value !== bank?.id)
                  .map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder="Destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EXTERNAL}>🌍 External (cash-out)</SelectItem>
                {bank && <SelectItem value={BANK}>🏦 {bank.name}</SelectItem>}
                {options
                  .filter((o) => o.value !== bank?.id)
                  .map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Memo</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Bookie ↔ bookie transfers should be entered as two transfers via the bank.
        </p>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !amount || (!from && !to)}
          >
            {save.isPending ? "…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
