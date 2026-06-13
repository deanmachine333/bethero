import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  fetchBets,
  fetchBookies,
  fetchTransfers,
  deriveBookieBalances,
} from "@/lib/queries";
import { betProfit, fmtMoney } from "@/lib/calc";
import { AlertTriangle, TrendingDown, Clock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Bookie Wallet" },
      { name: "description", content: "Bet tracker and bookie balance dashboard." },
    ],
  }),
  component: Dashboard,
});
  head: () => ({
    meta: [
      { title: "Dashboard — Bookie Wallet" },
      { name: "description", content: "Bet tracker and bookie balance dashboard." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const bookiesQ = useQuery({ queryKey: ["bookies"], queryFn: fetchBookies });
  const betsQ = useQuery({ queryKey: ["bets"], queryFn: fetchBets });
  const transfersQ = useQuery({ queryKey: ["transfers"], queryFn: fetchTransfers });

  const loading = bookiesQ.isLoading || betsQ.isLoading || transfersQ.isLoading;
  const bookies = bookiesQ.data ?? [];
  const bets = betsQ.data ?? [];
  const transfers = transfersQ.data ?? [];
  const withBal = deriveBookieBalances(bookies, bets, transfers);

  // totals per currency
  const totals = new Map<string, { pl: number; turnover: number; open: number }>();
  for (const b of bets) {
    const c = b.currency || "GBP";
    const t = totals.get(c) ?? { pl: 0, turnover: 0, open: 0 };
    if (b.outcome !== "open") t.pl += betProfit(b);
    t.turnover += Number(b.stake);
    if (b.outcome === "open") t.open += b.is_free_bet ? 0 : Number(b.stake);
    totals.set(c, t);
  }

  // alerts
  // Alert only when the user has actually set a threshold (>0) AND available cash falls below it.
  const lowBalance = withBal.filter(
    (b) => Number(b.min_threshold) > 0 && b.available_balance < Number(b.min_threshold),
  );
  const pendingOld = transfers.filter((t) => {
    if (t.status === "deposited" || !t.withdraw_date) return false;
    const days = (Date.now() - new Date(t.withdraw_date).getTime()) / 86_400_000;
    return days > 3;
  });

  if (loading) {
    return (
      <AppShell title="Dashboard">
        <p className="text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  const empty = bookies.length === 0 && bets.length === 0;

  return (
    <AppShell title="Dashboard">
      {empty && (
        <Card className="mb-6 border-dashed">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              No data yet. Add a bookie or import bets from CSV to get started.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/bookies">Add bookie</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/bets/import">Import CSV</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {[...totals.entries()].map(([cur, t]) => (
          <Card key={cur}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Settled P/L ({cur})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-semibold ${t.pl > 0 ? "text-[var(--profit)]" : t.pl < 0 ? "text-[var(--loss)]" : ""}`}
              >
                {fmtMoney(t.pl, cur)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Turnover {fmtMoney(t.turnover, cur)} · Open risk {fmtMoney(t.open, cur)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <AlertCard
          icon={<TrendingDown className="h-4 w-4" />}
          title="Low bookie balance"
          empty="All bookies above threshold."
          items={lowBalance.map((b) => ({
            id: b.id,
            text: `${b.name}: ${fmtMoney(b.available_balance, b.currency)} available (min ${fmtMoney(Number(b.min_threshold), b.currency)})`,
          }))}
        />
        <AlertCard
          icon={<Clock className="h-4 w-4" />}
          title="Pending transfers > 3 days"
          empty="No stale transfers."
          items={pendingOld.map((t) => ({
            id: t.id,
            text: `${t.reference || t.id.slice(0, 6)} · ${t.status} · ${fmtMoney(Number(t.amount), t.currency)}`,
          }))}
        />
        <AlertCard
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Void risk pairs"
          empty="No void risk detected."
          items={[]}
          footer={
            <Link to="/pairs" className="text-xs text-primary hover:underline">
              Open pair view →
            </Link>
          }
        />
      </section>
    </AppShell>
  );
}

function AlertCard({
  icon,
  title,
  items,
  empty,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  items: { id: string; text: string }[];
  empty: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {icon} {title}{" "}
          {items.length > 0 && <Badge variant="destructive">{items.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id} className="text-foreground">
                {i.text}
              </li>
            ))}
          </ul>
        )}
        {footer && <div className="mt-3">{footer}</div>}
      </CardContent>
    </Card>
  );
}
