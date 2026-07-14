// app/subscriptions/page.tsx
// GoCardless recurring billing — who has an active direct debit set up.
// Data source: memberships table (billing_provider = 'gocardless'), synced by WF16.
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Subscriptions — Bendigo Fight Centre" };

const STATUS_COLOURS: Record<string, string> = {
  active:    "bg-success/15 text-success-foreground",
  paused:    "bg-warning/15 text-warning-foreground",
  cancelled: "bg-muted text-muted-foreground",
  expired:   "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  active:    "Active",
  paused:    "Paused",
  cancelled: "Cancelled",
  expired:   "Expired",
};

export default async function SubscriptionsPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  // GoCardless billing lives in the memberships table per sync-contracts.md
  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, source_record_id, status, plan_name, amount, billing_interval, start_date, created_at, member_id, member:members(id, full_name, primary_email)")
    .eq("billing_provider", "gocardless")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = memberships ?? [];

  // Status breakdown counts
  const counts: Record<string, number> = {};
  for (const m of rows) {
    const s = m.status ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const activeCount    = counts["active"] ?? 0;
  const pausedCount    = counts["paused"] ?? 0;
  const cancelledCount = (counts["cancelled"] ?? 0) + (counts["expired"] ?? 0);
  const failedCount    = 0; // tracked in payment_events, not memberships

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <span className="text-muted-foreground text-sm">GoCardless direct debits</span>
      </div>

      {/* KPI chips */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums text-success-foreground">{activeCount}</div>
            <div className="text-sm font-medium mt-0.5">Active</div>
            <div className="text-xs text-muted-foreground">live mandates</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums text-warning-foreground">{pausedCount}</div>
            <div className="text-sm font-medium mt-0.5">Paused</div>
            <div className="text-xs text-muted-foreground">billing suspended</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums text-muted-foreground">{failedCount}</div>
            <div className="text-sm font-medium mt-0.5">Failed</div>
            <div className="text-xs text-muted-foreground">see Payments page</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums text-muted-foreground">{cancelledCount}</div>
            <div className="text-sm font-medium mt-0.5">Cancelled</div>
            <div className="text-xs text-muted-foreground">inactive subscriptions</div>
          </CardContent>
        </Card>
      </div>

      {/* All GoCardless subscriptions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            GoCardless subscriptions
            <Badge variant="secondary" className="font-normal text-xs">{rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No GoCardless subscriptions synced yet. Check that WF16 is active in n8n and writing to the memberships table.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source ID</TableHead>
                    <TableHead>Start</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(m => {
                    const member = Array.isArray(m.member) ? m.member[0] : m.member;
                    return (
                      <TableRow key={m.id} className="relative hover:bg-muted/40">
                        <TableCell className="font-medium">
                          {member ? (
                            <Link
                              href={`/members/${member.id}`}
                              className="before:absolute before:inset-0 hover:underline"
                            >
                              {member.full_name ?? "Unknown"}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-sm">Unlinked</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {member?.primary_email ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{m.plan_name ?? "—"}</TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {m.amount ? `${formatMoney(m.amount)}/${m.billing_interval ?? "mo"}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn("font-normal text-xs", STATUS_COLOURS[m.status ?? ""] ?? "")}
                          >
                            {STATUS_LABEL[m.status ?? ""] ?? m.status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {m.source_record_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.start_date ? formatDate(m.start_date) : m.created_at ? formatDate(m.created_at) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Data synced from GoCardless via n8n WF16 into the memberships table.{" "}
        <Link href="/sync" className="text-primary hover:underline">Sync status →</Link>
      </p>
    </AppShell>
  );
}
