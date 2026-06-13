import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/bets/import")({
  head: () => ({ meta: [{ title: "Import — BetHero" }] }),
  component: ImportPage,
});

function ImportPage() {
  return (
    <AppShell title="Import bets">
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            CSV import is being rebuilt against the new ledger model. Coming next: paste a BetHero
            CSV, pick whether the stakes are already reflected in your opening balances, and
            preview each row before saving.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
