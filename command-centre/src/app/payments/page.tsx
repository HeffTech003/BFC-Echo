import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMoney, isoDaysAgo, sourceLabel } from "@/lib/format";

export const metadata = { title: "Payments — Bendigo Fight Centre" };

export default async function PaymentsPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  await logAudit("payments.view", "payment_events");

  const thirtyDaysAgo = isoDaysAgo(30);
  const ninetyDaysAgo = isoDaysAgo(90);

  const [failedRes, revenueRes, xeroRevenueRes, legacyRes] = await Promise.all([
    supabase
      .from("payment_events")
      .select("*, member:members(id, full_name)")
      .eq("event_type", "payment_failed")
      .gte("occurred_at", ninetyDaysAgo)
      .order("occurred_at", { ascending: false })
      .limit(100),
    // GoCardless / Square / WooCommerce payments via payment_events
    supabase
      .from("payment_events")
      .select("source_system, amount")
      .in("event_type", ["payment_collected", "invoice_paid", "order"])
      .gte("occurred_at", thirtyDaysAgo),
    // Xero invoiced revenue — stored in xero_invoices, not payment_events
    supabase
      .from("xero_invoices")
      .select("total")
      .eq("invoice_type", "ACCREC")
      .eq("status", "PAID")
      .gte("date", thirtyDaysAgo.slice(0, 10)),
    supabase
      .from("memberships")
      .select("*, member:members(id, full_name)")
      .eq("billing_provider", "gocardless")
      .eq("status", "active")
      .order("last_synced_at", { ascending: false })
      .limit(100),
  ]);

  const failed = failedRes.data ?? [];
  const legacy = legacyRes.data ?? [];

  const xeroRevenue30d = (xeroRevenueRes.data ?? []).reduce(
    (s, r) => s + (Number(r.total) || 0),
    0
  );

  const revenueBySource = new Map<string, number>();
  // Xero revenue comes from xero_invoices, not payment_events
  revenueBySource.set("xero", xeroRevenue30d);
  for (const row of revenueRes.data ?? []) {
    revenueBySource.set(
      row.source_system,
      (revenueBySource.get(row.source_system) ?? 0) + Number(row.amount ?? 0)
    );
  }

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Payments & Legacy Migration</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Read-only view. Migration and payment actions stay in the source systems
        (Phase 4 adds human-approved actions via n8n).
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {["gocardless", "square", "woocommerce", "xero"].map((src) => {
          const rev = revenueBySource.get(src) ?? 0;
          return (
            <Card key={src} className={`gap-2 py-4 border-l-4 ${rev > 0 ? "border-l-success" : "border-l-border"}`}>
              <CardContent className="px-4">
                <div className="text-2xl font-semibold tabular-nums">
                  {formatMoney(rev)}
                </div>
                <div className="mt-1 text-sm font-medium">{sourceLabel(src)}</div>
                <div className="text-muted-foreground text-xs">revenue, last 30 days</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Failed payments (last 90 days)</CardTitle>
          <CardDescription>
            Follow up in GoCardless/Clubworx; log outcomes as tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {failed.length === 0 ? (
            <p className="text-muted-foreground text-sm">No failed payments recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failed.map((p) => {
                  const m = Array.isArray(p.member) ? p.member[0] : p.member;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{formatDateTime(p.occurred_at)}</TableCell>
                      <TableCell>
                        {m ? (
                          <Link
                            href={`/members/${m.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {m.full_name}
                          </Link>
                        ) : (
                          <Badge variant="outline">unlinked</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatMoney(p.amount, p.currency)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {p.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {sourceLabel(p.source_system)} · {p.source_record_id}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active legacy GoCardless billing</CardTitle>
          <CardDescription>
            Members still billed on legacy GoCardless arrangements — candidates for
            migration to current arrangements. Review only; never auto-migrated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {legacy.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active legacy billing records.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Source ID</TableHead>
                  <TableHead>Last synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legacy.map((m) => {
                  const member = Array.isArray(m.member) ? m.member[0] : m.member;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        {member ? (
                          <Link
                            href={`/members/${member.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {member.full_name}
                          </Link>
                        ) : (
                          <Badge variant="outline">unlinked</Badge>
                        )}
                      </TableCell>
                      <TableCell>{m.membership_type ?? "—"}</TableCell>
                                            <TableCell className="tabular-nums">
                        {m.amount != null ? formatMoney(m.amount / 100) : "—"}
                        {m.billing_interval ? ` / ${m.billing_interval}` : ""}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {m.source_record_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.last_synced_at ? formatDateTime(m.last_synced_at) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
