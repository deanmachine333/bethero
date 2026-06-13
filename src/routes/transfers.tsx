import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchBookies, fetchTransfers, type Transfer } from "@/lib/queries";
import { fmtMoney } from "@/lib/calc";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { downloadCsv, toCsv } from "@/lib/csv";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";

export const Route = createFileRoute("/transfers")({
  head: () => ({ meta: [{ title: "Transfers — Bookie Wallet" }] }),
  component: TransfersPage,
});

const NEXT: Record<string, string | null> = {
  planned: "withdrawn",
  withdrawn: "bank_cleared",
  bank_cleared: "deposited",
  deposited: null,
};

function TransfersPage() {
  const qc = useQueryClient();
  const transfersQ = useQuery({ queryKey: ["transfers"], queryFn: fetchTransfers });
  const bookiesQ = useQuery({ queryKey: ["bookies"], queryFn: fetchBookies });
  const bookieMap = new Map((bookiesQ.data ?? []).map((b) => [b.id, b]));

  const advance = useMutation({
    mutationFn: async (t: Transfer) => {
      const next = NEXT[t.status];
      if (!next) return;
      const today = new Date().toISOString().slice(0, 10);
      const patch: Partial<Transfer> = { status: next };
      if (next === "withdrawn") patch.withdraw_date = t.withdraw_date ?? today;
      if (next === "bank_cleared") patch.bank_cleared_date = t.bank_cleared_date ?? today;
      if (next === "deposited") patch.deposit_date = t.deposit_date ?? today;

      const { error } = await supabase.from("transfers").update(patch).eq("id", t.id);
      if (error) throw error;

      // Bank ledger entries
      if (next === "withdrawn") {
        await supabase.from("bank_ledger").insert({
          date: patch.withdraw_date!,
          direction: "in",
          amount: Number(t.amount),
          currency: t.currency,
          from_label: bookieMap.get(t.from_bookie_id ?? "")?.name ?? "Bookie",
          to_label: "Bank",
          reference: t.reference,
          transfer_id: t.id,
        });
      }
      if (next === "deposited") {
        await supabase.from("bank_ledger").insert({
          date: patch.deposit_date!,
          direction: "out",
          amount: Number(t.amount),
          currency: t.currency,
          from_label: "Bank",
          to_label: bookieMap.get(t.to_bookie_id ?? "")?.name ?? "Bookie",
          reference: t.reference,
          transfer_id: t.id,
        });
      }
      await logAudit("transfer", t.id, "update", { field: "status", old_value: t.status, new_value: next });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["bank"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const rows = (transfersQ.data ?? []).map((t) => ({
      Id: t.id,
      From: bookieMap.get(t.from_bookie_id ?? "")?.name ?? "",
      To: bookieMap.get(t.to_bookie_id ?? "")?.name ?? "",
      Amount: t.amount,
      Currency: t.currency,
      Status: t.status,
      WithdrawDate: t.withdraw_date ?? "",
      BankClearedDate: t.bank_cleared_date ?? "",
      DepositDate: t.deposit_date ?? "",
      Reference: t.reference ?? "",
      Notes: t.notes ?? "",
    }));
    downloadCsv("transfers.csv", toCsv(rows));
  };

  return (
    <AppShell title="Transfers">
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
        <TransferDialog />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Withdrawn</TableHead>
                <TableHead>Cleared</TableHead>
                <TableHead>Deposited</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transfersQ.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No transfers yet.
                  </TableCell>
                </TableRow>
              )}
              {(transfersQ.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{bookieMap.get(t.from_bookie_id ?? "")?.name ?? "—"}</TableCell>
                  <TableCell>{bookieMap.get(t.to_bookie_id ?? "")?.name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoney(Number(t.amount), t.currency)}
                  </TableCell>
                  <TableCell className="text-xs">{t.withdraw_date ?? "—"}</TableCell>
                  <TableCell className="text-xs">{t.bank_cleared_date ?? "—"}</TableCell>
                  <TableCell className="text-xs">{t.deposit_date ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={t.status === "deposited" ? "secondary" : "default"}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{t.reference ?? "—"}</TableCell>
                  <TableCell>
                    {NEXT[t.status] && (
                      <Button size="sm" variant="outline" onClick={() => advance.mutate(t)}>
                        → {NEXT[t.status]}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function TransferDialog() {
  const qc = useQueryClient();
  const bookiesQ = useQuery({ queryKey: ["bookies"], queryFn: fetchBookies });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    from_bookie_id: "",
    to_bookie_id: "",
    amount: "100",
    currency: "GBP",
    reference: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .insert({
          from_bookie_id: form.from_bookie_id || null,
          to_bookie_id: form.to_bookie_id || null,
          amount: Number(form.amount),
          currency: form.currency,
          reference: form.reference || null,
          notes: form.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit("transfer", data.id, "create", { new_value: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      toast.success("Transfer planned");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bookieOpts = bookiesQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Plan transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plan transfer</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">From bookie</Label>
            <Select value={form.from_bookie_id} onValueChange={(v) => setForm({ ...form, from_bookie_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {bookieOpts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">To bookie</Label>
            <Select value={form.to_bookie_id} onValueChange={(v) => setForm({ ...form, to_bookie_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {bookieOpts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Reference</Label>
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
