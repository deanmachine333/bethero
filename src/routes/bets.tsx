import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fetchBets, fetchBookies, type Bet } from "@/lib/queries";
import { betProfit, computeReturn, fmtMoney } from "@/lib/calc";
import { downloadCsv, toCsv, CSV_HEADERS } from "@/lib/csv";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { Plus, Download, Trash2 } from "lucide-react";

export const Route = createFileRoute("/bets")({
  head: () => ({ meta: [{ title: "Bets — Bookie Wallet" }] }),
  component: BetsPage,
});

const OUTCOMES = ["open", "win", "loss", "void", "half_win", "half_loss", "push"];

function BetsPage() {
  const qc = useQueryClient();
  const betsQ = useQuery({ queryKey: ["bets"], queryFn: fetchBets });
  const bookiesQ = useQuery({ queryKey: ["bookies"], queryFn: fetchBookies });

  const [bookieFilter, setBookieFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const bookieMap = useMemo(
    () => new Map((bookiesQ.data ?? []).map((b) => [b.id, b])),
    [bookiesQ.data],
  );

  const rows = useMemo(() => {
    const all = betsQ.data ?? [];
    return all.filter((b) => {
      if (bookieFilter !== "all" && b.bookie_id !== bookieFilter) return false;
      if (typeFilter !== "all" && b.type !== typeFilter) return false;
      if (outcomeFilter !== "all" && b.outcome !== outcomeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!`${b.event} ${b.market} ${b.notes ?? ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [betsQ.data, bookieFilter, typeFilter, outcomeFilter, search]);

  const updateBet = useMutation({
    mutationFn: async ({
      id,
      patch,
      old,
    }: {
      id: string;
      patch: Partial<Bet>;
      old: Bet;
    }) => {
      // If outcome or is_free_bet or stake/odds changed, recompute return
      const next: Partial<Bet> = { ...patch };
      const stake = Number(patch.stake ?? old.stake);
      const odds = Number(patch.odds ?? old.odds);
      const freeBet = patch.is_free_bet ?? old.is_free_bet;
      const outcome = patch.outcome ?? old.outcome;
      next.return = computeReturn(stake, odds, freeBet, outcome);
      const { error } = await supabase.from("bets").update(next).eq("id", id);
      if (error) throw error;
      await logAudit("bet", id, "update", { new_value: patch, old_value: old });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBet = useMutation({
    mutationFn: async (b: Bet) => {
      const { error } = await supabase.from("bets").delete().eq("id", b.id);
      if (error) throw error;
      await logAudit("bet", b.id, "delete", { old_value: b });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets"] });
      toast.success("Bet deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const out = rows.map((b) => ({
      DatePlaced: b.date_placed,
      Bookie: bookieMap.get(b.bookie_id)?.name ?? "",
      Event: b.event,
      Market: b.market,
      Stake: b.stake,
      Currency: b.currency,
      Odds: b.odds,
      Type: b.type,
      PairID: b.pair_id ?? "",
      IsFreeBet: b.is_free_bet ? "Y" : "N",
      Outcome: b.outcome,
      Return: b.return,
      CLV: b.clv ?? "",
      Notes: b.notes ?? "",
    }));
    downloadCsv("bets.csv", toCsv(out, CSV_HEADERS));
  };

  return (
    <AppShell title="Bet Ledger">
      <div className="mb-4 flex flex-wrap gap-2 items-end">
        <div className="grow min-w-[180px]">
          <Label className="text-xs">Search event/market</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="…" />
        </div>
        <FilterSelect
          label="Bookie"
          value={bookieFilter}
          onChange={setBookieFilter}
          options={[
            { value: "all", label: "All" },
            ...(bookiesQ.data ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All" },
            { value: "EV+", label: "EV+" },
            { value: "Arb", label: "Arb" },
            { value: "Other", label: "Other" },
          ]}
        />
        <FilterSelect
          label="Outcome"
          value={outcomeFilter}
          onChange={setOutcomeFilter}
          options={[{ value: "all", label: "All" }, ...OUTCOMES.map((o) => ({ value: o, label: o }))]}
        />
        <div className="ml-auto flex gap-2">
          <AddBetDialog />
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Bookie</TableHead>
                <TableHead>Event / Market</TableHead>
                <TableHead className="text-right">Stake</TableHead>
                <TableHead className="text-right">Odds</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Free</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Return</TableHead>
                <TableHead className="text-right">P/L</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    No bets match.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((b) => {
                const pl = betProfit(b);
                const book = bookieMap.get(b.bookie_id);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(b.date_placed).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{book?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{b.event}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.market}
                        {b.pair_id ? (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            pair {b.pair_id}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(Number(b.stake), b.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(b.odds).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">{b.type}</TableCell>
                    <TableCell>
                      <Checkbox
                        checked={b.is_free_bet}
                        onCheckedChange={(v) =>
                          updateBet.mutate({ id: b.id, patch: { is_free_bet: !!v }, old: b })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={b.outcome}
                        onValueChange={(v) =>
                          updateBet.mutate({ id: b.id, patch: { outcome: v }, old: b })
                        }
                      >
                        <SelectTrigger className="h-8 w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OUTCOMES.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(Number(b.return), b.currency)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${pl > 0 ? "text-[var(--profit)]" : pl < 0 ? "text-[var(--loss)]" : ""}`}
                    >
                      {b.outcome === "open" ? "—" : fmtMoney(pl, b.currency)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete bet?")) deleteBet.mutate(b);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AddBetDialog() {
  const qc = useQueryClient();
  const bookiesQ = useQuery({ queryKey: ["bookies"], queryFn: fetchBookies });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date_placed: new Date().toISOString().slice(0, 16),
    bookie_id: "",
    event: "",
    market: "",
    stake: "10",
    odds: "2.00",
    type: "EV+",
    pair_id: "",
    is_free_bet: false,
    outcome: "open",
    currency: "GBP",
    clv: "",
    notes: "",
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.bookie_id) throw new Error("Pick a bookie");
      const stake = Number(form.stake);
      const odds = Number(form.odds);
      const ret = computeReturn(stake, odds, form.is_free_bet, form.outcome);
      const { data, error } = await supabase
        .from("bets")
        .insert({
          date_placed: new Date(form.date_placed).toISOString(),
          bookie_id: form.bookie_id,
          event: form.event,
          market: form.market,
          stake,
          odds,
          type: form.type,
          pair_id: form.pair_id || null,
          is_free_bet: form.is_free_bet,
          outcome: form.outcome,
          currency: form.currency,
          clv: form.clv ? Number(form.clv) : null,
          notes: form.notes || null,
          return: ret,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit("bet", data.id, "create", { new_value: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets"] });
      toast.success("Bet added");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add bet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add bet</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date placed">
            <Input
              type="datetime-local"
              value={form.date_placed}
              onChange={(e) => setForm({ ...form, date_placed: e.target.value })}
            />
          </Field>
          <Field label="Bookie">
            <Select value={form.bookie_id} onValueChange={(v) => setForm({ ...form, bookie_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {(bookiesQ.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Event" className="col-span-2">
            <Input value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} />
          </Field>
          <Field label="Market" className="col-span-2">
            <Input value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} />
          </Field>
          <Field label="Stake">
            <Input value={form.stake} onChange={(e) => setForm({ ...form, stake: e.target.value })} />
          </Field>
          <Field label="Odds">
            <Input value={form.odds} onChange={(e) => setForm({ ...form, odds: e.target.value })} />
          </Field>
          <Field label="Currency">
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EV+">EV+</SelectItem>
                <SelectItem value="Arb">Arb</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pair ID (optional)">
            <Input
              value={form.pair_id}
              onChange={(e) => setForm({ ...form, pair_id: e.target.value })}
            />
          </Field>
          <Field label="Outcome">
            <Select value={form.outcome} onValueChange={(v) => setForm({ ...form, outcome: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Free bet">
            <div className="flex h-9 items-center">
              <Checkbox
                checked={form.is_free_bet}
                onCheckedChange={(v) => setForm({ ...form, is_free_bet: !!v })}
              />
            </div>
          </Field>
          <Field label="CLV">
            <Input value={form.clv} onChange={(e) => setForm({ ...form, clv: e.target.value })} />
          </Field>
          <Field label="Notes" className="col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            {add.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
