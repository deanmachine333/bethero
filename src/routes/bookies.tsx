import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  deriveBookieBalances,
  fetchBets,
  fetchBookies,
  fetchTransfers,
  type Bookie,
} from "@/lib/queries";
import { fmtMoney } from "@/lib/calc";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { Plus, Pencil, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/bookies")({
  head: () => ({ meta: [{ title: "Bookies — Bookie Wallet" }] }),
  component: BookiesPage,
});

function BookiesPage() {
  const bookiesQ = useQuery({ queryKey: ["bookies"], queryFn: fetchBookies });
  const betsQ = useQuery({ queryKey: ["bets"], queryFn: fetchBets });
  const transfersQ = useQuery({ queryKey: ["transfers"], queryFn: fetchTransfers });

  const rows = deriveBookieBalances(bookiesQ.data ?? [], betsQ.data ?? [], transfersQ.data ?? []);

  return (
    <AppShell title="Book accounts">
      <div className="mb-4 flex justify-end">
        <BookieDialog mode="create" />
      </div>
      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {rows.map((b) => {
          const low = Number(b.min_threshold) > 0 && b.available_balance < Number(b.min_threshold);
          return (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{b.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.country || "—"} · {b.currency}
                    </div>
                  </div>
                  <BookieDialog mode="edit" bookie={b} />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmtMoney(b.computed_balance, b.currency)}
                  </div>
                  {low && <AlertTriangle className="h-4 w-4 text-[var(--loss)]" />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Available {fmtMoney(b.available_balance, b.currency)} · Open risk{" "}
                  {fmtMoney(b.open_risk, b.currency)} · Min{" "}
                  {fmtMoney(Number(b.min_threshold), b.currency)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Min threshold</TableHead>
                <TableHead className="text-right">Open risk</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No bookies yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.country || "—"}</TableCell>
                  <TableCell>{b.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoney(Number(b.opening_balance), b.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoney(Number(b.min_threshold), b.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoney(b.open_risk, b.currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-semibold ${b.computed_balance < Number(b.min_threshold) ? "text-[var(--loss)]" : ""}`}
                  >
                    {fmtMoney(b.computed_balance, b.currency)}
                  </TableCell>
                  <TableCell>
                    <BookieDialog mode="edit" bookie={b} />
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

function BookieDialog({ mode, bookie }: { mode: "create" | "edit"; bookie?: Bookie }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: bookie?.name ?? "",
    country: bookie?.country ?? "",
    currency: bookie?.currency ?? "GBP",
    opening_balance: String(bookie?.opening_balance ?? "0"),
    min_threshold: String(bookie?.min_threshold ?? "0"),
    notes: bookie?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        country: form.country || null,
        currency: form.currency,
        opening_balance: Number(form.opening_balance) || 0,
        min_threshold: Number(form.min_threshold) || 0,
        notes: form.notes || null,
      };
      if (mode === "create") {
        const { data, error } = await supabase.from("bookies").insert(payload).select().single();
        if (error) throw error;
        await logAudit("bookie", data.id, "create", { new_value: data });
      } else if (bookie) {
        const { error } = await supabase.from("bookies").update(payload).eq("id", bookie.id);
        if (error) throw error;
        await logAudit("bookie", bookie.id, "update", { old_value: bookie, new_value: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookies"] });
      toast.success(mode === "create" ? "Bookie added" : "Bookie updated");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add bookie
          </Button>
        ) : (
          <Button size="icon" variant="ghost">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add bookie" : `Edit ${bookie?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Country</Label>
            <Input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
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
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
