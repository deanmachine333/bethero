import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import {
  fetchAccounts,
  fetchBets,
  fetchBetLegs,
  fetchLedger,
} from "@/lib/ledger-queries";
import {
  accountBalance,
  betProjectedProfit,
  fmtMoney,
  legRealisedProfit,
} from "@/lib/ledger";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeftRight, Plus, Sparkles, Upload, Wallet, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — BetHero" }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { count } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true });
    if (!count) throw redirect({ to: "/setup" });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const betsQ = useQuery({ queryKey: ["bets_v2"], queryFn: fetchBets });
  const legsQ = useQuery({ queryKey: ["bet_legs"], queryFn: fetchBetLegs });
  const ledgerQ = useQuery({ queryKey: ["ledger"], queryFn: fetchLedger });

  const accounts = accountsQ.data ?? [];
  const legs = legsQ.data ?? [];
  const entries = ledgerQ.data ?? [];
  const bets = betsQ.data ?? [];

  const bookies = accounts.filter((a) => a.kind === "bookie");
  const bank = accounts.find((a) => a.kind === "bank");

  const bookieTotal = bookies.reduce((a, b) => a + accountBalance(entries, b.id), 0);
  const bankTotal = bank ? accountBalance(entries, bank.id) : 0;
  const totalBankroll = bookieTotal + bankTotal;
  const openExposure = legs
    .filter((l) => l.outcome === "open" && !l.is_free_bet)
    .reduce((a, l) => a + Number(l.stake), 0);

  // group open legs by bet, then compute projection per bet correctly
  const legsByBet = useMemo(() => {
    const m = new Map<string, typeof legs>();
    legs.forEach((l) => {
      const list = m.get(l.bet_id) ?? [];
      list.push(l);
      m.set(l.bet_id, list);
    });
    return m;
  }, [legs]);

  let evProj = 0;
  let arbBest = 0;
  let arbWorst = 0;
  for (const b of bets) {
    if (b.status !== "open") continue;
    const blegs = legsByBet.get(b.id) ?? [];
    const p = betProjectedProfit(b, blegs);
    if (b.bet_type === "arb") {
      arbBest += p.best;
      arbWorst += p.worst;
    } else {
      evProj += p.expected;
    }
  }
  const realised = legs
    .filter((l) => l.outcome !== "open")
    .reduce((a, l) => a + legRealisedProfit(l), 0);

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  let run = 0;
  const trend = sortedEntries.map((e) => {
    run += Number(e.amount);
    return { t: e.occurred_at.slice(0, 10), v: Number(run.toFixed(2)) };
  });

  // upcoming bets — open, with event_time in the future, soonest first
  const now = Date.now();
  const upcoming = bets
    .filter((b) => b.status === "open" && b.event_time && new Date(b.event_time).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.event_time as string).getTime() -
        new Date(b.event_time as string).getTime(),
    )
    .slice(0, 8);

  return (
    <AppShell title="Dashboard">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/bets">
            <Plus className="mr-2 h-4 w-4" /> New bet
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/bets/import">
            <Upload className="mr-2 h-4 w-4" /> Import CSV
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/transfers">
            <ArrowLeftRight className="mr-2 h-4 w-4" /> Transfer
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/accounts">
            <Wallet className="mr-2 h-4 w-4" /> Accounts
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total bankroll" value={fmtMoney(totalBankroll)} accent="primary" />
        <Kpi
          label="Bookies / Bank"
          value={`${fmtMoney(bookieTotal)} · ${fmtMoney(bankTotal)}`}
        />
        <Kpi label="Open cash exposure" value={fmtMoney(openExposure)} />
        <Kpi
          label="Realised P/L"
          value={fmtMoney(realised)}
          accent={realised >= 0 ? "win" : "loss"}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Kpi
          label="EV+ projected (open)"
          value={fmtMoney(evProj)}
          accent={evProj >= 0 ? "win" : "loss"}
        />
        <Kpi
          label="Arbs — worst case"
          value={fmtMoney(arbWorst)}
          accent={arbWorst >= 0 ? "win" : "loss"}
        />
        <Kpi
          label="Arbs — best case"
          value={fmtMoney(arbBest)}
          accent={arbBest >= 0 ? "win" : "loss"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-medium">Bankroll over time</div>
            <div className="h-64">
              {trend.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="t" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="hsl(var(--primary))"
                      fill="url(#g)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  No movements yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> Accounts
            </div>
            <ul className="space-y-2">
              {bank && (
                <li className="flex items-center justify-between rounded border px-3 py-2">
                  <span className="text-sm">🏦 {bank.name}</span>
                  <span className="font-mono text-sm">
                    {fmtMoney(accountBalance(entries, bank.id), bank.currency)}
                  </span>
                </li>
              )}
              {bookies
                .slice()
                .sort(
                  (a, b) =>
                    accountBalance(entries, b.id) - accountBalance(entries, a.id),
                )
                .map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded border px-3 py-2"
                  >
                    <span className="text-sm">{a.name}</span>
                    <span className="font-mono text-sm">
                      {fmtMoney(accountBalance(entries, a.id), a.currency)}
                    </span>
                  </li>
                ))}
              {accounts.length === 0 && (
                <li className="text-sm text-muted-foreground">No accounts yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4" /> Upcoming bets
          </div>
          {upcoming.length === 0 && (
            <div className="py-4 text-sm text-muted-foreground">
              No upcoming bets with a scheduled event time.
            </div>
          )}
          <ul className="space-y-2">
            {upcoming.map((b) => {
              const blegs = legsByBet.get(b.id) ?? [];
              const p = betProjectedProfit(b, blegs);
              return (
                <li
                  key={b.id}
                  className="flex items-start justify-between gap-3 rounded border p-3"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant={b.bet_type === "arb" ? "secondary" : "default"}>
                        {b.bet_type.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {b.event_time
                          ? new Date(b.event_time).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : ""}
                      </span>
                    </div>
                    <div className="truncate font-medium">{b.event}</div>
                    <div className="text-xs text-muted-foreground">
                      {blegs
                        .map((l) => {
                          const acc = accounts.find((a) => a.id === l.account_id);
                          return `${acc?.name ?? "?"} @ ${Number(l.odds)}`;
                        })
                        .join("  ·  ")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {b.bet_type === "arb" ? (
                      <>
                        <div className="text-muted-foreground">Worst / Best</div>
                        <div className="font-mono">
                          <span
                            className={
                              p.worst >= 0 ? "text-[var(--win)]" : "text-[var(--loss)]"
                            }
                          >
                            {fmtMoney(p.worst)}
                          </span>
                          {" / "}
                          <span
                            className={
                              p.best >= 0 ? "text-[var(--win)]" : "text-[var(--loss)]"
                            }
                          >
                            {fmtMoney(p.best)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-muted-foreground">Projected</div>
                        <div
                          className={
                            "font-mono " +
                            (p.expected >= 0 ? "text-[var(--win)]" : "text-[var(--loss)]")
                          }
                        >
                          {fmtMoney(p.expected)}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="mb-2 text-sm font-medium">Recent activity</div>
          <ul className="divide-y">
            {[...entries]
              .sort(
                (a, b) =>
                  new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
              )
              .slice(0, 8)
              .map((e) => {
                const ac = accounts.find((x) => x.id === e.account_id);
                return (
                  <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted-foreground">
                      {e.occurred_at.slice(0, 10)} · {e.entry_type} · {ac?.name ?? "—"}
                    </span>
                    <span
                      className={
                        "font-mono " +
                        (Number(e.amount) >= 0 ? "text-[var(--win)]" : "text-[var(--loss)]")
                      }
                    >
                      {fmtMoney(Number(e.amount), ac?.currency)}
                    </span>
                  </li>
                );
              })}
            {entries.length === 0 && (
              <li className="py-4 text-sm text-muted-foreground">No activity yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <div className="mt-2 text-xs text-muted-foreground">
        {bets.length} bets · {legs.length} legs · {entries.length} ledger entries
      </div>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "primary" | "win" | "loss";
}) {
  const color =
    accent === "win"
      ? "text-[var(--win)]"
      : accent === "loss"
        ? "text-[var(--loss)]"
        : accent === "primary"
          ? "text-primary"
          : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
