import { Link } from "@tanstack/react-router";
import { Wallet, ListOrdered, GitMerge, Banknote, ArrowLeftRight, Upload, FileClock, HelpCircle, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/bets", label: "Bets", icon: ListOrdered },
  { to: "/bets/import", label: "Import", icon: Upload },
  { to: "/pairs", label: "Pairs", icon: GitMerge },
  { to: "/bookies", label: "Bookies", icon: Wallet },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/bank", label: "Bank", icon: Banknote },
  { to: "/audit", label: "Audit", icon: FileClock },
  { to: "/help", label: "Help", icon: HelpCircle },
] as const;

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Wallet className="h-5 w-5 text-primary" />
            <span>Bookie Wallet</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent text-foreground" }}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <nav className="md:hidden flex items-center gap-1 overflow-x-auto border-t px-2 py-2">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground" }}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {title ? <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1> : null}
        {children}
      </main>
    </div>
  );
}
