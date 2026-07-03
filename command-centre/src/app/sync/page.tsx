import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, sourceLabel } from "@/lib/format";

export const metadata = { title: "Sync Status — BFC Command Centre" };

const SOURCES = ["clubworx", "gocardless", "xero", "woocommerce", "square"];

export default async function SyncPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const { data: runs } = await supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(100);

  const latestBySource = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) {
    if (!latestBySource.has(run.source_system)) latestBySource.set(run.source_system, run);
  }

  const statusBadge = (status: string) =>
    status === "success" ? (
      <Badge variant="success">success</Badge>
    ) : status === "error" ? (
      <Badge variant="destructive">error</Badge>
    ) : (
      <Badge variant="warning">{status}</Badge>
    );

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Sync Status</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        n8n connectors write here on every run. A source with no runs has not been
        connected yet (see docs/sync-contracts.md).
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        {SOURCES.map((src) => {
          const run = latestBySource.get(src);
          return (
            <Card key={src} className="gap-2 py-4">
              <CardContent className="px-4">
                <div className="text-sm font-medium">{sourceLabel(src)}</div>
                <div className="mt-1">
                  {run ? statusBadge(run.status) : <Badge variant="outline">not connected</Badge>}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {run ? formatDateTime(run.started_at) : "no runs"}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-2 font-medium">Recent runs</h2>
      {(runs ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">No sync runs recorded yet.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Processed</TableHead>
                <TableHead>Created / Updated</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{formatDateTime(r.started_at)}</TableCell>
                  <TableCell>{sourceLabel(r.source_system)}</TableCell>
                  <TableCell>{r.run_type}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="tabular-nums">{r.records_processed}</TableCell>
                  <TableCell className="tabular-nums">
                    {r.records_created} / {r.records_updated}
                  </TableCell>
                  <TableCell className="text-destructive max-w-xs truncate text-xs">
                    {r.error_message ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
