import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  fetchAccounts,
  fetchBetLegs,
  fetchLedger,
  createAccount,
} from "@/lib/ledger-queries";
import { accountBalance, accountOpenExposure, accountRealisedPL, fmtMoney } from "@/lib/ledger";
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
import { Plus, AlertTriangle, Banknote, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "Accounts — BetHero" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const legsQ = useQuery({ queryKey: ["bet_legs"], queryFn: fetchBetLegs });
  const ledgerQ = useQuery({ queryKey: ["ledger"], queryFn: fetchLedger });

  const accounts = accountsQ.data ?? [];
  const legs = legsQ.data ?? [];
  const entries = ledgerQ.data ?? [];

  return (
    <AppShell title="Accounts">
      <div className="mb-4 flex justify-end">
        <AccountDialog />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const bal = accountBalance(entries, a.id);
          const exposure = accountOpenExposure(legs, a.id);
          const available = bal - exposure;
          const pl = accountRealisedPL(entries, legs, a.id);
          const low = Number(a.min_threshold) > 0 && available < Number(a.min_threshold);
          return (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {a.kind === "bank" ? (
                      <Banknote className="h-4 w-4" />
                    ) : (
                      <Wallet className="h-4 w-4" />
                    )}
                    <div>
                      <div className="font-semibold">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.kind} · {a.currency}
                      </div>
                    </div>
                  </div>
                  {low && <AlertTriangle className="h-4 w-4 text-[var(--loss)]" />}
                </div>
                <div className="mt-3 text-2xl font-semibold tabular-nums">
                  {fmtMoney(bal, a.currency)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                  <Stat label="Available" value={fmtMoney(available, a.currency)} />
                  <Stat label="Exposure" value={fmtMoney(exposure, a.currency)} />
                  <Stat
                    label="P/L"
                    value={fmtMoney(pl, a.currency)}
                    color={pl >= 0 ? "text-[var(--win)]" : "text-[var(--loss)]"}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {accounts.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground">
            No accounts yet. Add a bookie or bank account to start.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded bg-muted/40 px-2 py-1">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-mono text-xs ${color ?? ""}`}>{value}</div>
    </div>
  );
}

function AccountDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    kind: "bookie" as "bookie" | "bank",
    currency: "GBP",
    opening_balance: "0",
    min_threshold: "0",
  });

  const save = useMutation({
    mutationFn: () =>
      createAccount({
        name: form.name,
        kind: form.kind,
        currency: form.currency,
        opening_balance: Number(form.opening_balance) || 0,
        min_threshold: Number(form.min_threshold) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("Account added");
      setOpen(false);
      setForm({ ...form, name: "", opening_balance: "0" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Kind</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => setForm({ ...form, kind: v as "bookie" | "bank" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bookie">Bookie</SelectItem>
                <SelectItem value="bank">Bank / transit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Opening balance</Label>
            <Input
              value={form.opening_balance}
              onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Min threshold</Label>
            <Input
              value={form.min_threshold}
              onChange={(e) => setForm({ ...form, min_threshold: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
            {save.isPending ? "…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
