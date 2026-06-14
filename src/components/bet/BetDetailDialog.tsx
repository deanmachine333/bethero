import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Archive, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  archiveBet,
  updateBet,
  type UpdateLegInput,
} from "@/lib/ledger-queries";
import type { Account, Bet, BetLeg } from "@/lib/ledger";
import {
  betProjectedProfit,
  fmtMoney,
  legProjectedProfit,
  legRealisedProfit,
} from "@/lib/ledger";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bet: Bet;
  legs: BetLeg[];
  accounts: Account[];
}

type EditableLeg = UpdateLegInput & {
  id?: string;
  __key: string;
};

export function BetDetailDialog({ open, onOpenChange, bet, legs, accounts }: Props) {
  const qc = useQueryClient();
  const bookies = accounts.filter((a) => a.kind === "bookie");

  const [betType, setBetType] = useState<"ev" | "arb">(bet.bet_type as "ev" | "arb");
  const [event, setEvent] = useState(bet.event);
  const [market, setMarket] = useState(bet.market ?? "");
  const [notes, setNotes] = useState(bet.notes ?? "");
  const [datePlaced, setDatePlaced] = useState(bet.date_placed.slice(0, 16));
  const [eventTime, setEventTime] = useState(bet.event_time ? bet.event_time.slice(0, 16) : "");

  const [editLegs, setEditLegs] = useState<EditableLeg[]>(() =>
    legs.map((l) => ({
      __key: l.id,
      id: l.id,
      account_id: l.account_id,
      selection: l.selection ?? "",
      odds: Number(l.odds),
      stake: Number(l.stake),
      is_free_bet: l.is_free_bet,
      free_bet_type: l.free_bet_type as "snr" | "sr" | null,
      stake_prefunded: l.stake_prefunded,
      outcome: l.outcome,
    })),
  );

  // Reset state when bet/legs change
  useEffect(() => {
    if (!open) return;
    setBetType(bet.bet_type as "ev" | "arb");
    setEvent(bet.event);
    setMarket(bet.market ?? "");
    setNotes(bet.notes ?? "");
    setDatePlaced(bet.date_placed.slice(0, 16));
    setEventTime(bet.event_time ? bet.event_time.slice(0, 16) : "");
    setEditLegs(
      legs.map((l) => ({
        __key: l.id,
        id: l.id,
        account_id: l.account_id,
        selection: l.selection ?? "",
        odds: Number(l.odds),
        stake: Number(l.stake),
        is_free_bet: l.is_free_bet,
        free_bet_type: l.free_bet_type as "snr" | "sr" | null,
        stake_prefunded: l.stake_prefunded,
        outcome: l.outcome,
      })),
    );
  }, [open, bet, legs]);

  const updateLeg = (key: string, patch: Partial<EditableLeg>) =>
    setEditLegs((curr) => curr.map((l) => (l.__key === key ? { ...l, ...patch } : l)));

  const addLeg = () =>
    setEditLegs((curr) => [
      ...curr,
      {
        __key: `new-${crypto.randomUUID()}`,
        account_id: bookies[0]?.id ?? "",
        selection: "",
        odds: 2,
        stake: 10,
        is_free_bet: false,
        free_bet_type: null,
        stake_prefunded: false,
        outcome: "open",
      },
    ]);

  const removeLeg = (key: string) =>
    setEditLegs((curr) => curr.filter((l) => l.__key !== key));

  const projected = useMemo(() => {
    const fakeLegs = editLegs.map((l, i) => ({
      id: l.id ?? `tmp-${i}`,
      bet_id: bet.id,
      user_id: "",
      account_id: l.account_id,
      leg_number: i + 1,
      odds: l.odds,
      stake: l.stake,
      is_free_bet: l.is_free_bet ?? false,
      free_bet_type: (l.free_bet_type ?? null) as string | null,
      outcome: l.outcome ?? "open",
      stake_prefunded: l.stake_prefunded ?? false,
      selection: l.selection ?? null,
      market: null,
      settled_at: null,
      created_at: "",
      updated_at: "",
      last_manual_edit_at: null,
      manually_overridden_fields: [],
    })) as unknown as BetLeg[];
    return betProjectedProfit({ bet_type: betType }, fakeLegs);
  }, [editLegs, betType, bet.id]);

  const save = useMutation({
    mutationFn: () =>
      updateBet(
        bet.id,
        {
          bet_type: betType,
          event,
          market: market || null,
          notes: notes || null,
          date_placed: new Date(datePlaced).toISOString(),
          event_time: eventTime ? new Date(eventTime).toISOString() : null,
        },
        editLegs.map(({ __key, ...l }) => ({
          ...l,
          // pass undefined id for new legs (the RPC handles new vs existing by id)
          id: l.id,
        })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets_v2"] });
      qc.invalidateQueries({ queryKey: ["bet_legs"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("Bet updated");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: () => archiveBet(bet.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets_v2"] });
      qc.invalidateQueries({ queryKey: ["bet_legs"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("Bet archived");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wasEdited = !!bet.last_manual_edit_at;
  const wasImported = !!bet.imported_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Edit bet</span>
            {wasImported && <Badge variant="outline" className="text-[10px]">imported</Badge>}
            {wasEdited && (
              <Badge variant="secondary" className="text-[10px]">
                <Pencil className="mr-1 h-2.5 w-2.5" /> edited
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={betType} onValueChange={(v) => setBetType(v as "ev" | "arb")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ev">EV+</SelectItem>
                <SelectItem value="arb">Arb</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date placed</Label>
            <Input
              type="datetime-local"
              value={datePlaced}
              onChange={(e) => setDatePlaced(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Event</Label>
            <Input value={event} onChange={(e) => setEvent(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Market</Label>
            <Input value={market} onChange={(e) => setMarket(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Event time</Label>
            <Input
              type="datetime-local"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Projected</Label>
            <div className="pt-2 text-sm font-mono">
              {betType === "arb"
                ? `${fmtMoney(projected.worst)} / ${fmtMoney(projected.best)}`
                : fmtMoney(projected.expected)}
            </div>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="mt-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Legs ({editLegs.length})</div>
            <Button type="button" size="sm" variant="outline" onClick={addLeg}>
              <Plus className="mr-1 h-3 w-3" /> Add leg
            </Button>
          </div>

          {editLegs.map((leg, i) => {
            const acc = accounts.find((a) => a.id === leg.account_id);
            const realised = leg.id
              ? legRealisedProfit(legs.find((l) => l.id === leg.id) ?? ({} as BetLeg))
              : 0;
            return (
              <div key={leg.__key} className="rounded border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold">Leg {i + 1}</div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => removeLeg(leg.__key)}
                    disabled={editLegs.length === 1}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">Bookie</Label>
                    <Select
                      value={leg.account_id}
                      onValueChange={(v) => updateLeg(leg.__key, { account_id: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Pick bookie" /></SelectTrigger>
                      <SelectContent>
                        {bookies.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Selection</Label>
                    <Input
                      value={leg.selection ?? ""}
                      onChange={(e) => updateLeg(leg.__key, { selection: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Outcome</Label>
                    <Select
                      value={leg.outcome ?? "open"}
                      onValueChange={(v) => updateLeg(leg.__key, { outcome: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["open", "win", "loss", "void", "half_win", "half_loss", "push"].map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Stake</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={leg.stake}
                      onChange={(e) => updateLeg(leg.__key, { stake: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Odds</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={leg.odds}
                      onChange={(e) => updateLeg(leg.__key, { odds: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={leg.is_free_bet ?? false}
                        onCheckedChange={(v) =>
                          updateLeg(leg.__key, {
                            is_free_bet: v,
                            free_bet_type: v ? leg.free_bet_type ?? "snr" : null,
                          })
                        }
                      />
                      Free bet
                    </label>
                    {leg.is_free_bet && (
                      <Select
                        value={leg.free_bet_type ?? "snr"}
                        onValueChange={(v) =>
                          updateLeg(leg.__key, { free_bet_type: v as "snr" | "sr" })
                        }
                      >
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="snr">SNR</SelectItem>
                          <SelectItem value="sr">SR</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={leg.stake_prefunded ?? false}
                        onCheckedChange={(v) => updateLeg(leg.__key, { stake_prefunded: v })}
                      />
                      Stake already in balance
                    </label>
                  </div>
                  <div className="col-span-2 flex justify-between text-xs text-muted-foreground">
                    <span>
                      Projected:{" "}
                      <span className="font-mono">
                        {fmtMoney(
                          legProjectedProfit({
                            stake: leg.stake,
                            odds: leg.odds,
                            is_free_bet: leg.is_free_bet ?? false,
                            free_bet_type: leg.free_bet_type ?? null,
                          } as never),
                        )}
                      </span>
                    </span>
                    {leg.outcome && leg.outcome !== "open" && (
                      <span>
                        Realised:{" "}
                        <span className="font-mono">{fmtMoney(realised)}</span>
                      </span>
                    )}
                    {acc && (
                      <span>
                        Account: <span className="font-medium">{acc.name}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="mt-3 flex-row justify-between sm:justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-[var(--loss)]">
                <Archive className="mr-1 h-3.5 w-3.5" /> Archive
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive this bet?</AlertDialogTitle>
                <AlertDialogDescription>
                  The bet is hidden from lists, and any ledger entries it created are
                  reversed via offsetting entries (history preserved).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => archive.mutate()}>
                  Archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !event || editLegs.some((l) => !l.account_id)}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
