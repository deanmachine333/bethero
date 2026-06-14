import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  fetchAccounts,
  fetchBets,
  fetchBetLegs,
  createBet,
  settleLeg,
  type NewLegInput,
} from "@/lib/ledger-queries";
import { betProjectedProfit, fmtMoney, legProjectedProfit, legRealisedProfit } from "@/lib/ledger";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Upload, Pencil } from "lucide-react";
import { toast } from "sonner";
import { BetDetailDialog } from "@/components/bet/BetDetailDialog";
import type { Bet, BetLeg } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/bets")({
  head: () => ({ meta: [{ title: "Bets — BetHero" }] }),
  component: BetsPage,
});

type Filter = "all" | "open" | "settled";

function BetsPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const betsQ = useQuery({ queryKey: ["bets_v2"], queryFn: fetchBets });
  const legsQ = useQuery({ queryKey: ["bet_legs"], queryFn: fetchBetLegs });
  const accounts = accountsQ.data ?? [];
  const bets = betsQ.data ?? [];
  const legs = legsQ.data ?? [];

  const [filter, setFilter] = useState<Filter>("all");
  const [openBet, setOpenBet] = useState<Bet | null>(null);

  const filtered = useMemo(
    () => bets.filter((b) => filter === "all" || b.status === filter),
    [bets, filter],
  );

  if (pathname !== "/bets") {
    return <Outlet />;
  }

  return (
    <AppShell title="Bets">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["all", "open", "settled"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/bets/import"><Upload className="mr-2 h-4 w-4" />Import CSV</Link>
          </Button>
          <BetDialog accounts={accounts} />
        </div>
      </div>

      <div className="grid gap-2">
        {filtered.map((b) => {
          const blegs = legs.filter((l) => l.bet_id === b.id);
          const proj = betProjectedProfit(b, blegs);
          const real = blegs.reduce((a, l) => a + legRealisedProfit(l), 0);
          const isArb = b.bet_type === "arb";
          return (
            <Card
              key={b.id}
              className="cursor-pointer transition hover:border-primary/50 hover:shadow-sm"
              onClick={() => setOpenBet(b)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={isArb ? "secondary" : "default"}>
                        {b.bet_type.toUpperCase()}
                      </Badge>
                      <Badge variant={b.status === "open" ? "outline" : "secondary"}>
                        {b.status}
                      </Badge>
                      {b.last_manual_edit_at && (
                        <Badge variant="outline" className="h-4 text-[10px]">
                          <Pencil className="mr-0.5 h-2.5 w-2.5" /> edited
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {b.date_placed.slice(0, 10)}
                      </span>
                      {b.event_time && (
                        <span className="text-xs text-muted-foreground">
                          · ⏰ {new Date(b.event_time).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate font-medium">{b.event}</div>
                    <div className="text-xs text-muted-foreground">{b.market}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    {b.status === "open" ? (
                      isArb ? (
                        <>
                          <div className="text-xs text-muted-foreground">Worst / Best</div>
                          <div className="font-mono text-sm">
                            <span
                              className={
                                proj.worst >= 0
                                  ? "text-[var(--win)]"
                                  : "text-[var(--loss)]"
                              }
                            >
                              {fmtMoney(proj.worst)}
                            </span>
                            {" / "}
                            <span
                              className={
                                proj.best >= 0
                                  ? "text-[var(--win)]"
                                  : "text-[var(--loss)]"
                              }
                            >
                              {fmtMoney(proj.best)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-muted-foreground">Projected</div>
                          <div
                            className={
                              "font-mono " +
                              (proj.expected >= 0
                                ? "text-[var(--win)]"
                                : "text-[var(--loss)]")
                            }
                          >
                            {fmtMoney(proj.expected)}
                          </div>
                        </>
                      )
                    ) : (
                      <>
                        <div className="text-xs text-muted-foreground">Realised</div>
                        <div
                          className={
                            "font-mono " +
                            (real >= 0 ? "text-[var(--win)]" : "text-[var(--loss)]")
                          }
                        >
                          {fmtMoney(real)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <ul className="mt-2 space-y-1">
                  {blegs.map((l) => {
                    const ac = accounts.find((a) => a.id === l.account_id);
                    return (
                      <li
                        key={l.id}
                        className="flex items-center justify-between rounded bg-muted/30 px-2 py-1 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{ac?.name}</span>
                          <span className="text-muted-foreground">
                            {Number(l.stake)} @ {Number(l.odds)}
                          </span>
                          {l.is_free_bet && (
                            <Badge variant="outline" className="h-4 text-[10px]">
                              FREE {l.free_bet_type?.toUpperCase()}
                            </Badge>
                          )}
                          {l.stake_prefunded && (
                            <Badge variant="outline" className="h-4 text-[10px]">
                              prefunded
                            </Badge>
                          )}
                        </div>
                        <SettleControl legId={l.id} current={l.outcome} />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">No bets.</div>
        )}
      </div>
    </AppShell>
  );
}

function SettleControl({ legId, current }: { legId: string; current: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (o: string) => settleLeg(legId, o),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bet_legs"] });
      qc.invalidateQueries({ queryKey: ["bets_v2"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("Settled");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Select value={current} onValueChange={(v) => m.mutate(v)}>
      <SelectTrigger className="h-6 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {["open", "win", "loss", "void", "half_win", "half_loss", "push"].map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BetDialog({ accounts }: { accounts: ReturnType<typeof fetchAccounts> extends Promise<infer T> ? T : never }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"ev" | "arb">("ev");
  const [event, setEvent] = useState("");
  const [market, setMarket] = useState("");
  const [legs, setLegs] = useState<NewLegInput[]>([
    { account_id: "", odds: 2, stake: 10, is_free_bet: false, stake_prefunded: false },
  ]);

  function setLegCount(n: number) {
    setLegs((curr) => {
      const next = [...curr];
      while (next.length < n)
        next.push({ account_id: "", odds: 2, stake: 10, is_free_bet: false, stake_prefunded: false });
      while (next.length > n) next.pop();
      return next;
    });
  }

  const save = useMutation({
    mutationFn: () =>
      createBet({
        date: new Date().toISOString(),
        bet_type: type,
        event,
        market,
        legs: legs.map((l, i) => ({ ...l, leg_number: i + 1 })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets_v2"] });
      qc.invalidateQueries({ queryKey: ["bet_legs"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("Bet added");
      setOpen(false);
      setEvent("");
      setMarket("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New bet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New bet</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as "ev" | "arb");
                setLegCount(v === "arb" ? 2 : 1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ev">EV+</SelectItem>
                <SelectItem value="arb">Arb (2 legs)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Event</Label>
            <Input value={event} onChange={(e) => setEvent(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Market</Label>
            <Input value={market} onChange={(e) => setMarket(e.target.value)} />
          </div>

          {legs.map((leg, i) => (
            <div key={i} className="col-span-2 rounded border p-3">
              <div className="mb-2 text-xs font-semibold">Leg {i + 1}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">Bookie</Label>
                  <Select
                    value={leg.account_id}
                    onValueChange={(v) => {
                      const next = [...legs];
                      next[i] = { ...leg, account_id: v };
                      setLegs(next);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose bookie" />
                    </SelectTrigger>
                    <SelectContent>
                      {(accounts as any[])
                        .filter((a) => a.kind === "bookie")
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
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
                    onChange={(e) => {
                      const next = [...legs];
                      next[i] = { ...leg, stake: Number(e.target.value) };
                      setLegs(next);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Odds</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={leg.odds}
                    onChange={(e) => {
                      const next = [...legs];
                      next[i] = { ...leg, odds: Number(e.target.value) };
                      setLegs(next);
                    }}
                  />
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={leg.is_free_bet}
                      onCheckedChange={(v) => {
                        const next = [...legs];
                        next[i] = { ...leg, is_free_bet: v, free_bet_type: v ? "snr" : null };
                        setLegs(next);
                      }}
                    />
                    Free bet
                  </label>
                  {leg.is_free_bet && (
                    <Select
                      value={leg.free_bet_type ?? "snr"}
                      onValueChange={(v) => {
                        const next = [...legs];
                        next[i] = { ...leg, free_bet_type: v as "snr" | "sr" };
                        setLegs(next);
                      }}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="snr">SNR (no stake)</SelectItem>
                        <SelectItem value="sr">SR (stake returned)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={leg.stake_prefunded ?? false}
                      onCheckedChange={(v) => {
                        const next = [...legs];
                        next[i] = { ...leg, stake_prefunded: v };
                        setLegs(next);
                      }}
                    />
                    Stake already in balance
                  </label>
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  Projected profit:{" "}
                  <span className="font-mono">
                    {fmtMoney(
                      legProjectedProfit({
                        id: "",
                        bet_id: "",
                        user_id: "",
                        leg_number: 1,
                        account_id: leg.account_id,
                        selection: null,
                        odds: leg.odds,
                        stake: leg.stake,
                        is_free_bet: leg.is_free_bet ?? false,
                        free_bet_type: leg.free_bet_type ?? null,
                        outcome: "open",
                        stake_prefunded: leg.stake_prefunded ?? false,
                        settled_at: null,
                        created_at: "",
                        updated_at: "",
                      } as never),
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !event || legs.some((l) => !l.account_id)}
          >
            {save.isPending ? "…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
