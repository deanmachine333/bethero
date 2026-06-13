import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { fetchAudit } from "@/lib/queries";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Audit — Bookie Wallet" }] }),
  component: AuditPage,
});

function AuditPage() {
  const q = useQuery({ queryKey: ["audit"], queryFn: fetchAudit });
  const rows = q.data ?? [];
  return (
    <AppShell title="Audit trail">
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Old</TableHead>
                <TableHead>New</TableHead>
                <TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No audit entries.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.entity_type}
                    {r.entity_id ? <span className="text-muted-foreground"> · {r.entity_id.slice(0, 6)}</span> : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.field ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">
                    {r.old_value ? JSON.stringify(r.old_value) : "—"}
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">
                    {r.new_value ? JSON.stringify(r.new_value) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{r.actor}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
