import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchBets, fetchBookies, type Bet } from "@/lib/queries";
import { effectiveStakeSum, fmtMoney, pairPL, pairStatus, pairVoidRisk, returnSum } from "@/lib/calc";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/pairs")({
  head: () => ({ meta: [{ title: "Pairs — Bookie Wallet" }] }),
  component: PairsPage,
});

function PairsPage() {
  const betsQ = useQuery({ queryKey: ["bets"], queryFn: fetchBets });
  const bookiesQ = useQuery({ queryKey: ["bookies"], queryFn: fetchBookies });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const bookieMap = useMemo(
    () => new Map((bookiesQ.data ?? []).map((b) => [b.id, b])),
    [bookiesQ.data],
  );

  const pairs = useMemo(() => {
    const groups = new Map<string, Bet[]>();
    for (const b of betsQ.data ?? []) {
      if (!b.pair_id) continue;
      const arr = groups.get(b.pair_id) ?? [];
      arr.push(b);
      groups.set(b.pair_id, arr);
    }
    return Array.from(groups.entries())
      .map(([id, bets]) => ({
        id,
        bets,
        pl: pairPL(bets),
        stakeSum: effectiveStakeSum(bets),
        returnSum: returnSum(bets),
        status: pairStatus(bets),
        void_risk: pairVoidRisk(bets),
        currency: bets[0]?.currency || "GBP",
      }))
      .sort((a, b) => (a.id < b.id ? 1 : -1));
  }, [betsQ.data]);

  return (
    <AppShell title="Pair reconciliation">
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Pair</TableHead>
                <TableHead>Legs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Stakes</TableHead>
                <TableHead className="text-right">Returns</TableHead>
                <TableHead className="text-right">P/L</TableHead>
                <TableHead>Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No paired bets. Set PairID on two or more bets to reconcile them.
                  </TableCell>
                </TableRow>
              )}
              {pairs.map((p) => {
                const isOpen = !!open[p.id];
                return (
                  <PairRows key={p.id} p={p} isOpen={isOpen} onToggle={() => setOpen({ ...open, [p.id]: !isOpen })} bookieMap={bookieMap} />
                );
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{p.id}</TableCell>
                      <TableCell>{p.bets.length}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "settled" ? "secondary" : p.status === "partial" ? "default" : "outline"}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMoney(p.stakeSum, p.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMoney(p.returnSum, p.currency)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${p.pl > 0 ? "text-[var(--profit)]" : p.pl < 0 ? "text-[var(--loss)]" : ""}`}
                      >
                        {fmtMoney(p.pl, p.currency)}
                      </TableCell>
                      <TableCell>
                        {p.void_risk ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> void
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen &&
                      p.bets.map((b) => (
                        <TableRow key={b.id} className="bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell colSpan={2} className="text-sm">
                            <div className="font-medium">{b.event}</div>
                            <div className="text-xs text-muted-foreground">
                              {b.market} · {bookieMap.get(b.bookie_id)?.name}
                              {b.is_free_bet && (
                                <Badge variant="outline" className="ml-2 text-[10px]">
                                  free
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{b.outcome}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {fmtMoney(Number(b.stake), b.currency)} @ {Number(b.odds).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {fmtMoney(Number(b.return), b.currency)}
                          </TableCell>
                          <TableCell colSpan={2}></TableCell>
                        </TableRow>
                      ))}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
