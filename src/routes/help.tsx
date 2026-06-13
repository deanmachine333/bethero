import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help — Bookie Wallet" }] }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <AppShell title="User guide">
      <Card>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none p-6 space-y-4">
          <section>
            <h2 className="font-semibold">1. Add bookies first</h2>
            <p className="text-sm text-muted-foreground">
              In <strong>Bookies</strong>, click <em>Add bookie</em>. Set name, currency, opening
              balance, and a minimum-threshold alert level. CSV import will auto-create any bookie
              it doesn't find, but adding them up front lets you set thresholds and opening balances.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">2. Import bets</h2>
            <p className="text-sm text-muted-foreground">
              Go to <strong>Import</strong>. Required CSV columns: DatePlaced, Bookie, Event,
              Market, Stake, Currency, Odds, Type, PairID, IsFreeBet (Y/N), Outcome, Return, CLV,
              Notes. <strong>Upsert</strong> (default) updates existing rows matched by
              date+bookie+event+market+stake+odds; <strong>Overwrite</strong> wipes all bets first.
              Returns are computed when the cell is empty.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">3. Free bets</h2>
            <p className="text-sm text-muted-foreground">
              Mark a bet as a free bet to apply <code>return = stake × (odds − 1)</code> on a win.
              Free-bet stakes are excluded from cost/balance math.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">4. Pair reconciliation</h2>
            <p className="text-sm text-muted-foreground">
              Set the same <code>PairID</code> on bets that hedge each other. The <strong>Pairs</strong>{" "}
              page groups them, shows pair P/L, and flags void risk when one leg voids while the other
              is still open.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">5. Transfers workflow</h2>
            <p className="text-sm text-muted-foreground">
              Plan a transfer in <strong>Transfers</strong>. Advance it: Planned → Withdrawn → Bank
              Cleared → Deposited. Withdrawals and deposits write entries into the{" "}
              <strong>Bank ledger</strong> with running balances.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">6. Alerts</h2>
            <p className="text-sm text-muted-foreground">
              The dashboard highlights bookies under their minimum threshold, transfers older than
              3 days that aren't deposited yet, and pairs flagged as void risk.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">API</h2>
            <p className="text-sm text-muted-foreground">
              All data lives in your Supabase project. You can hit the REST endpoint directly:
              <br />
              <code>POST {`https://<your-project>.supabase.co/rest/v1/bets`}</code>
              <br />
              with the publishable key in the <code>apikey</code> header and a JSON array of bets
              matching the schema columns.
            </p>
          </section>
        </CardContent>
      </Card>
    </AppShell>
  );
}
