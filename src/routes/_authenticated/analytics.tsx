import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { fetchAccounts, fetchBetLegs, fetchLedger, fetchBets } from "@/lib/ledger-queries";
import { fmtMoney, legProjectedProfit, legRealisedProfit } from "@/lib/ledger";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — BetHero" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const betsQ = useQuery({ queryKey: ["bets_v2"], queryFn: fetchBets });
  const legsQ = useQuery({ queryKey: ["bet_legs"], queryFn: fetchBetLegs });
  const ledgerQ = useQuery({ queryKey: ["ledger"], queryFn: fetchLedger });

  const accounts = accountsQ.data ?? [];
  const bets = betsQ.data ?? [];
  const legs = legsQ.data ?? [];

  const settled = legs.filter((l) => l.outcome !== "open");
  const realised = settled.reduce((a, l) => a + legRealisedProfit(l), 0);
  const projected = legs
    .filter((l) => l.outcome === "open")
    .reduce((a, l) => a + legProjectedProfit(l), 0);
  const turnover = settled.reduce(
    (a, l) => a + (l.is_free_bet ? 0 : Number(l.stake)),
    0,
  );
  const roi = turnover > 0 ? (realised / turnover) * 100 : 0;

  const freeBetValue = settled
    .filter((l) => l.is_free_bet)
    .reduce((a, l) => a + legRealisedProfit(l), 0);

  // by bookie
  const byBookie = accounts
    .filter((a) => a.kind === "bookie")
    .map((a) => ({
      name: a.name,
      pl: legs
        .filter((l) => l.account_id === a.id && l.outcome !== "open")
        .reduce((s, l) => s + legRealisedProfit(l), 0),
    }))
    .sort((a, b) => b.pl - a.pl);

  // by type
  const evPl = bets
    .filter((b) => b.bet_type === "ev")
    .flatMap((b) => legs.filter((l) => l.bet_id === b.id))
    .reduce((s, l) => s + legRealisedProfit(l), 0);
  const arbPl = bets
    .filter((b) => b.bet_type === "arb")
    .flatMap((b) => legs.filter((l) => l.bet_id === b.id))
    .reduce((s, l) => s + legRealisedProfit(l), 0);

  return (
    <AppShell title="Analytics">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Realised P/L" value={fmtMoney(realised)} accent={realised >= 0 ? "win" : "loss"} />
        <Kpi label="Projected (open)" value={fmtMoney(projected)} accent={projected >= 0 ? "win" : "loss"} />
        <Kpi label="Turnover (settled)" value={fmtMoney(turnover)} />
        <Kpi label="ROI" value={`${roi.toFixed(2)}%`} accent={roi >= 0 ? "win" : "loss"} />
        <Kpi label="Free-bet value extracted" value={fmtMoney(freeBetValue)} />
        <Kpi label="EV+ realised" value={fmtMoney(evPl)} accent={evPl >= 0 ? "win" : "loss"} />
        <Kpi label="Arb realised" value={fmtMoney(arbPl)} accent={arbPl >= 0 ? "win" : "loss"} />
        <Kpi label="Bets placed" value={String(bets.length)} />
      </div>

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="mb-2 text-sm font-medium">P/L by bookie</div>
          <div className="h-64">
            {byBookie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byBookie}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="pl" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No data yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "win" | "loss" }) {
  const color =
    accent === "win" ? "text-[var(--win)]" : accent === "loss" ? "text-[var(--loss)]" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
