// app/subscriptions/page.tsx
// GoCardless recurring mandates — who has an active direct debit set up.
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
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Subscriptions — BFC Command Centre" };

const STATUS_COLOURS: Record<string, string> = {
  active:              "bg-success/15 text-success-foreground",
  pending_submission:  "bg-primary/15 text-primary",
  pending_customer_approval: "bg-primary/15 text-primary",
  submitted:           "bg-primary/15 text-primary",
  failed:              "bg-destructive/15 text-destructive",
  cancelled:           "bg-muted text-muted-foreground",
  expired:             "bg-muted text-muted-foreground",
  consumed:            "bg-muted text-muted-foreground",
  reinstated:          "bg-success/15 text-success-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  active:              "Active",
  pending_submission:  "Pending",
  pending_customer_approval: "Pending approval",
  submitted:           "Submitted",
  failed:              "Failed",
  cancelled:           "Cancelled",
  expired:             "Expired",
  consumed:            "Consumed",
  reinstated:          "Reinstated",
};

export default async function SubscriptionsPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  // Fetch mandates with linked member name
  const { data: mandates } = await supabase
    .from("gocardless_mandates")
    .select("id, gc_mandate_id, status, scheme, created_at, member_id, member:members(id, full_name, primary_email)")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = mandates ?? [];

  // Status breakdown counts
  const counts: Record<string, number> = {};
  for (const m of rows) {
    const s = m.status ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const activeCount    = counts["active"] ?? 0;
  const pendingCount   = (counts["pending_submission"] ?? 0) + (counts["submitted"] ?? 0) + (counts["pending_customer_approval"] ?? 0);
  const failedCount    = counts["failed"] ?? 0;
  const cancelledCount = (counts["cancelled"] ?? 0) + (counts["expired"] ?? 0) + (counts["consumed"] ?? 0);

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
            <div className="text-2xl font-semibold tabular-nums text-primary">{pendingCount}</div>
            <div className="text-sm font-medium mt-0.5">Pending</div>
            <div className="text-xs text-muted-foreground">awaiting activation</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className={cn("text-2xl font-semibold tabular-nums", failedCount > 0 ? "text-destructive" : "text-foreground")}>{failedCount}</div>
            <div className="text-sm font-medium mt-0.5">Failed</div>
            <div className="text-xs text-muted-foreground">need attention</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums text-muted-foreground">{cancelledCount}</div>
            <div className="text-sm font-medium mt-0.5">Cancelled</div>
            <div className="text-xs text-muted-foreground">inactive mandates</div>
          </CardContent>
        </Card>
      </div>

      {/* Failed mandates — highlighted first */}
      {failedCount > 0 && (
        <Card className="mb-6 border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Failed mandates
              <Badge className="bg-destructive/15 text-destructive font-normal text-xs">{failedCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Mandate ID</TableHead>
                  <TableHead>Scheme</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows
                  .filter(m => m.status === "failed")
                  .map(m => {
                    const member = Array.isArray(m.member) ? m.member[0] : m.member;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          {member ? (
                            <Link href={`/members/${member.id}`} className="hover:underline">
                              {member.full_name ?? "Unknown"}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Unlinked</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {m.gc_mandate_id}
                        </TableCell>
                        <TableCell className="text-sm uppercase">{m.scheme ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.created_at ? formatDate(m.created_at) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All mandates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            All mandates
            <Badge variant="secondary" className="font-normal text-xs">{rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No GoCardless mandates synced yet. Check that WF16 is active in n8n.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Mandate ID</TableHead>
                    <TableHead>Created</TableHead>
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
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn("font-normal text-xs", STATUS_COLOURS[m.status ?? ""] ?? "")}
                          >
                            {STATUS_LABEL[m.status ?? ""] ?? m.status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm uppercase">{m.scheme ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {m.gc_mandate_id}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.created_at ? formatDate(m.created_at) : "—"}
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
        Data synced from GoCardless via n8n WF16.{" "}
        <Link href="/sync" className="text-primary hover:underline">Sync status →</Link>
      </p>
    </AppShell>
  );
}
