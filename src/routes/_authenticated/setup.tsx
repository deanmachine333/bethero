import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccount } from "@/lib/ledger-queries";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({ meta: [{ title: "Setup — BetHero" }] }),
  component: SetupPage,
});

interface Row {
  name: string;
  balance: string;
}

function SetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bookies, setBookies] = useState<Row[]>([{ name: "", balance: "" }]);
  const [bank, setBank] = useState<Row>({ name: "Bank / Transit", balance: "0" });

  const save = useMutation({
    mutationFn: async () => {
      await createAccount({
        name: bank.name || "Bank / Transit",
        kind: "bank",
        opening_balance: Number(bank.balance) || 0,
      });
      for (const b of bookies) {
        if (!b.name) continue;
        await createAccount({
          name: b.name,
          kind: "bookie",
          opening_balance: Number(b.balance) || 0,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Setup complete");
      navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="One-time setup">
      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="mb-2 font-semibold">1. Bank / Transit balance</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            The cash holding account that sits between your bookies.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Current balance</Label>
              <Input
                type="number"
                step="0.01"
                value={bank.balance}
                onChange={(e) => setBank({ ...bank, balance: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">2. Bookies — name and current real balance</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBookies([...bookies, { name: "", balance: "" }])}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Enter today's live balance at each bookie. Any open bets you add later can be marked
            "stake already in balance" so they aren't double-counted.
          </p>
          <div className="space-y-2">
            {bookies.map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr,180px,auto] gap-2">
                <Input
                  placeholder="Bookie name"
                  value={b.name}
                  onChange={(e) => {
                    const next = [...bookies];
                    next[i] = { ...b, name: e.target.value };
                    setBookies(next);
                  }}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Balance"
                  value={b.balance}
                  onChange={(e) => {
                    const next = [...bookies];
                    next[i] = { ...b, balance: e.target.value };
                    setBookies(next);
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setBookies(bookies.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-2 font-semibold">3. Confirm</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            We'll create your accounts and stamp today's balances as opening-balance ledger
            entries. You can add open bets and transfers next.
          </p>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Finish setup"}
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
