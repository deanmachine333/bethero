import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  fetchAccounts,
  fetchLedger,
  createTransfer,
  transferBookieToBookie,
} from "@/lib/ledger-queries";
import { accountBalance, fmtMoney } from "@/lib/ledger";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Banknote } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({ meta: [{ title: "Transfers — BetHero" }] }),
  component: TransfersPage,
});

function TransfersPage() {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const ledgerQ = useQuery({ queryKey: ["ledger"], queryFn: fetchLedger });
  const accounts = accountsQ.data ?? [];
  const entries = ledgerQ.data ?? [];
  const bank = accounts.find((a) => a.kind === "bank");
  const bookies = accounts.filter((a) => a.kind === "bookie");

  // history
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
  const singles = entries
    .filter(
      (e) =>
        !e.transfer_group_id && (e.entry_type === "deposit" || e.entry_type === "withdrawal"),
    )
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  return (
    <AppShell title="Transfers">
      <Card className="mb-4">
        <CardContent className="p-4">
          <Tabs defaultValue="b2b">
            <TabsList className="mb-3">
              <TabsTrigger value="b2b">Bookie → Bookie</TabsTrigger>
              <TabsTrigger value="bank2bookie">Bank → Bookie</TabsTrigger>
              <TabsTrigger value="bookie2bank">Bookie → Bank</TabsTrigger>
              <TabsTrigger value="topup">External top-up</TabsTrigger>
            </TabsList>

            <TabsContent value="b2b">
              <B2BForm
                bookies={bookies}
                bank={bank ?? null}
                entries={entries}
              />
            </TabsContent>
            <TabsContent value="bank2bookie">
              <SimpleTransferForm
                label="Bank → Bookie"
                fromOptions={bank ? [bank] : []}
                toOptions={bookies}
                entries={entries}
              />
            </TabsContent>
            <TabsContent value="bookie2bank">
              <SimpleTransferForm
                label="Bookie → Bank"
                fromOptions={bookies}
                toOptions={bank ? [bank] : []}
                entries={entries}
              />
            </TabsContent>
            <TabsContent value="topup">
              <TopUpForm accounts={accounts} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 text-sm font-medium">Recent movements</div>
          {transferRows.length === 0 && singles.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No transfers yet.
            </div>
          )}
          <ul className="divide-y">
            {transferRows.map((g) => {
              const sorted = [...g].sort(
                (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
              );
              const first = sorted[0];
              const last = sorted[sorted.length - 1];
              const fromAc = accounts.find((a) => a.id === first.account_id);
              const toAc = accounts.find((a) => a.id === last.account_id);
              const amt = Math.abs(Number(first.amount));
              return (
                <li
                  key={g[0].transfer_group_id ?? g[0].id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="text-muted-foreground">
                    {first.occurred_at.slice(0, 10)} · {fromAc?.name ?? "—"}{" "}
                    <ArrowRight className="inline h-3 w-3" /> {toAc?.name ?? "—"}
                    {sorted.length === 4 && (
                      <span className="ml-1 text-xs">(via bank)</span>
                    )}
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
                    {e.occurred_at.slice(0, 10)} ·{" "}
                    {e.entry_type === "deposit" ? "External in" : "External out"} ·{" "}
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

function B2BForm({
  bookies,
  bank,
  entries,
}: {
  bookies: { id: string; name: string; currency: string }[];
  bank: { id: string; name: string; currency: string } | null;
  entries: { account_id: string; amount: number | string }[];
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const amt = Number(amount);
      if (fromBal < amt) {
        const acc = bookies.find((b) => b.id === from);
        throw new Error(
          `Insufficient balance — ${acc?.name ?? "Account"} only has ${fmtMoney(fromBal)} available`,
        );
      }
      return transferBookieToBookie(
        from,
        to,
        bank!.id,
        amt,
        undefined,
        memo || undefined,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      const fromName = bookies.find((b) => b.id === from)?.name ?? "source";
      const toName = bookies.find((b) => b.id === to)?.name ?? "destination";
      toast.success(`Moved ${fmtMoney(Number(amount))} from ${fromName} to ${toName}`);
      setAmount("");
      setMemo("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!bank) {
    return (
      <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
        Add a bank/transit account first — bookie ↔ bookie transfers route through it.
      </div>
    );
  }

  const fromBal = from
    ? entries
        .filter((e) => e.account_id === from)
        .reduce((a, e) => a + Number(e.amount), 0)
    : 0;
  const amtNum = Number(amount) || 0;
  const insufficient = !!from && amtNum > 0 && amtNum > fromBal;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">From bookie</Label>
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger>
            <SelectValue placeholder="Source bookie" />
          </SelectTrigger>
          <SelectContent>
            {bookies.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {from && (
          <div className="mt-1 text-xs text-muted-foreground">
            Balance: {fmtMoney(fromBal)}
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs">To bookie</Label>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger>
            <SelectValue placeholder="Destination bookie" />
          </SelectTrigger>
          <SelectContent>
            {bookies
              .filter((b) => b.id !== from)
              .map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Amount</Label>
        <Input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <Label className="text-xs">Memo</Label>
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
      <div className="col-span-2 rounded border bg-muted/30 p-2 text-xs">
        <div className="mb-1 flex items-center gap-1 font-medium">
          <Banknote className="h-3 w-3" /> Movement
        </div>
        {from && to && amount ? (
          <div className="font-mono text-muted-foreground">
            {bookies.find((b) => b.id === from)?.name} −{fmtMoney(Number(amount))} →{" "}
            {bank.name} +{fmtMoney(Number(amount))} → {bank.name} −{fmtMoney(Number(amount))} →{" "}
            {bookies.find((b) => b.id === to)?.name} +{fmtMoney(Number(amount))}
          </div>
        ) : (
          <div className="text-muted-foreground">Pick both bookies and an amount.</div>
        )}
      </div>
      {insufficient && (
        <div className="col-span-2 rounded border border-[var(--loss)]/40 bg-[var(--loss)]/10 px-2 py-1 text-xs text-[var(--loss)]">
          Insufficient balance — {bookies.find((b) => b.id === from)?.name} only has {fmtMoney(fromBal)} available
        </div>
      )}
      <div className="col-span-2 flex justify-end">
        <Button
          disabled={save.isPending || !from || !to || !amount || Number(amount) <= 0 || insufficient}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "…" : "Record transfer"}
        </Button>
      </div>
    </div>
  );
}

function SimpleTransferForm({
  label,
  fromOptions,
  toOptions,
  entries,
}: {
  label: string;
  fromOptions: { id: string; name: string }[];
  toOptions: { id: string; name: string }[];
  entries: { account_id: string; amount: number | string }[];
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const fromBal = useMemo(
    () =>
      from
        ? entries
            .filter((e) => e.account_id === from)
            .reduce((a, e) => a + Number(e.amount), 0)
        : 0,
    [from, entries],
  );

  const fromName = fromOptions.find((o) => o.id === from)?.name;
  const toName = toOptions.find((o) => o.id === to)?.name;
  const amtNum = Number(amount) || 0;
  const insufficient = !!from && amtNum > 0 && amtNum > fromBal;

  const save = useMutation({
    mutationFn: () => {
      if (insufficient) {
        throw new Error(
          `Insufficient balance — ${fromName ?? "Account"} only has ${fmtMoney(fromBal)} available`,
        );
      }
      return createTransfer(from, to, amtNum, undefined, memo || undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(`Moved ${fmtMoney(amtNum)} from ${fromName} to ${toName}`);
      setAmount("");
      setMemo("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">From</Label>
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger>
            <SelectValue placeholder={label.split(" → ")[0]} />
          </SelectTrigger>
          <SelectContent>
            {fromOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {from && (
          <div className="mt-1 text-xs text-muted-foreground">
            Balance: {fmtMoney(fromBal)}
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger>
            <SelectValue placeholder={label.split(" → ")[1]} />
          </SelectTrigger>
          <SelectContent>
            {toOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Amount</Label>
        <Input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <Label className="text-xs">Memo</Label>
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
      {insufficient && (
        <div className="col-span-2 rounded border border-[var(--loss)]/40 bg-[var(--loss)]/10 px-2 py-1 text-xs text-[var(--loss)]">
          Insufficient balance — {fromName} only has {fmtMoney(fromBal)} available
        </div>
      )}
      <div className="col-span-2 flex justify-end">
        <Button
          disabled={save.isPending || !from || !to || !amount || amtNum <= 0 || insufficient}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "…" : "Record transfer"}
        </Button>
      </div>
    </div>
  );
}

function TopUpForm({
  accounts,
}: {
  accounts: { id: string; name: string; kind: string }[];
}) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const save = useMutation({
    mutationFn: () =>
      direction === "in"
        ? createTransfer(null, account, Number(amount), undefined, memo || undefined)
        : createTransfer(account, null, Number(amount), undefined, memo || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("Recorded");
      setAmount("");
      setMemo("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">Direction</Label>
        <Select value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in">External money IN (top-up)</SelectItem>
            <SelectItem value="out">External money OUT (cash out)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Account</Label>
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger>
            <SelectValue placeholder="Pick account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} ({a.kind})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Amount</Label>
        <Input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <Label className="text-xs">Memo</Label>
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
      <div className="col-span-2 flex justify-end">
        <Button
          disabled={save.isPending || !account || !amount || Number(amount) <= 0}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "…" : "Record"}
        </Button>
      </div>
    </div>
  );
}
