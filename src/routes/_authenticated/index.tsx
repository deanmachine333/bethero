import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import {
  fetchAccounts,
  fetchBets,
  fetchBetLegs,
  fetchLedger,
} from "@/lib/ledger-queries";
import {
  accountBalance,
  accountOpenExposure,
  fmtMoney,
  legProjectedProfit,
  legRealisedProfit,
} from "@/lib/ledger";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Plus, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const totalBankroll = accounts.reduce((a, ac) => a + accountBalance(entries, ac.id), 0);
  const openExposure = legs
    .filter((l) => l.outcome === "open" && !l.is_free_bet)
    .reduce((a, l) => a + Number(l.stake), 0);
  const projected = legs
    .filter((l) => l.outcome === "open")
    .reduce((a, l) => a + legProjectedProfit(l), 0);
  const realised = legs
    .filter((l) => l.outcome !== "open")
    .reduce((a, l) => a + legRealisedProfit(l), 0);

  // bankroll trend over time
  const sorted = [...entries].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  let run = 0;
  const trend = sorted.map((e) => {
    run += Number(e.amount);
    return { t: e.occurred_at.slice(0, 10), v: Number(run.toFixed(2)) };
  });

  return (
    <AppShell title="Dashboard">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/bets">
            <Plus className="mr-2 h-4 w-4" /> New bet
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
        <Kpi label="Open exposure" value={fmtMoney(openExposure)} />
        <Kpi
          label="Projected (open wins)"
          value={fmtMoney(projected)}
          accent={projected >= 0 ? "win" : "loss"}
        />
        <Kpi
          label="Realised P/L"
          value={fmtMoney(realised)}
          accent={realised >= 0 ? "win" : "loss"}
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
              {bookies.map((a) => (
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
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
