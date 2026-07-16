// app/retention/page.tsx
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
import { RetentionCharts } from "@/components/retention-charts";
import { cn } from "@/lib/utils";

export const metadata = { title: "Retention — Bendigo Fight Centre" };

const today = new Date().toISOString().slice(0, 10);
const nDaysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export default async function RetentionPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const [
    cancellationsRes,
    membersAtRiskRes,
    lapsedMembershipsRes,
    outstandingInvoicesRes,
    memberCountsRes,
    recentJoinsRes,
  ] = await Promise.all([
    // All cancellation requests with member info
    supabase
      .from("cancellation_requests")
      .select("id, member_id, status, reason, comments, created_at, preferred_last_date")
      .order("created_at", { ascending: false })
      .limit(200),

    // Members with suspended status — at risk of churning
    supabase
      .from("members")
      .select("id, full_name, primary_email, member_status, member_type, created_at")
      .in("member_status", ["suspended", "inactive"])
      .is("merged_into", null)
      .order("created_at", { ascending: false })
      .limit(50),

    // Memberships that lapsed in last 60 days (end_date passed but status still active)
    supabase
      .from("memberships")
      .select("id, member_id, plan_name, status, end_date, billing_provider")
      .lt("end_date", today)
      .gte("end_date", nDaysAgo(60))
      .order("end_date", { ascending: false })
      .limit(50),

    // Overdue invoices = revenue at risk
    supabase
      .from("xero_invoices")
      .select("id, contact_name, amount_due, due_date, invoice_number")
      .eq("status", "AUTHORISED")
      .eq("invoice_type", "ACCREC")
      .lt("due_date", today)
      .order("due_date")
      .limit(50),

    // Member counts by status for churn rate calc
    supabase
      .from("members")
      .select("member_status")
      .is("merged_into", null),

    // New members in last 12 months for net growth context
    // Use joined_at (actual join date) not created_at (sync/import date)
    supabase
      .from("members")
      .select("id, joined_at, created_at")
      .gte("created_at", nDaysAgo(365))
      .is("merged_into", null),
  ]);

  const cancellations = cancellationsRes.data ?? [];
  const membersAtRisk = membersAtRiskRes.data ?? [];
  const lapsedMemberships = lapsedMembershipsRes.data ?? [];
  const outstandingInvoices = outstandingInvoicesRes.data ?? [];
  const allMembers = memberCountsRes.data ?? [];
  const recentJoins = recentJoinsRes.data ?? [];

  // ── Aggregate stats ──────────────────────────────────────────────────────

  const totalMembers = allMembers.filter(m => !["cancelled", "inactive"].includes(m.member_status ?? "")).length;
  const activeCount  = allMembers.filter(m => m.member_status === "active").length;
  const cancelledLast30 = cancellations.filter(
    c => c.created_at >= nDaysAgo(30) && c.status !== "rejected"
  ).length;
  const churnRate = totalMembers > 0
    ? ((cancelledLast30 / totalMembers) * 100).toFixed(1)
    : "0.0";

  const newLast30 = recentJoins.filter(m => (m.joined_at ?? m.created_at) >= nDaysAgo(30)).length;
  const netGrowth30 = newLast30 - cancelledLast30;

  const revenueAtRisk = outstandingInvoices.reduce(
    (s, inv) => s + (Number(inv.amount_due) || 0), 0
  );

  const pendingCancellations = cancellations.filter(c => c.status === "new").length;

  // ── Cancellation reasons breakdown ───────────────────────────────────────

  const reasonCounts: Record<string, number> = {};
  for (const c of cancellations) {
    const r = c.reason ?? "unspecified";
    reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
  }
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // ── Monthly cancellations for trend chart ────────────────────────────────

  function monthKey(d: string) {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
  }

  function last12MonthKeys() {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }));
    }
    return keys;
  }

  const months = last12MonthKeys();
  const cancellationsByMonth: Record<string, number> = {};
  const joinsByMonth: Record<string, number> = {};
  for (const m of months) { cancellationsByMonth[m] = 0; joinsByMonth[m] = 0; }

  for (const c of cancellations) {
    const mk = monthKey(c.created_at);
    if (months.includes(mk)) cancellationsByMonth[mk]++;
  }
  for (const m of recentJoins) {
    const dateStr = m.joined_at ?? m.created_at;
    if (!dateStr) continue;
    const mk = monthKey(dateStr);
    if (months.includes(mk)) joinsByMonth[mk]++;
  }

  const churnTrendData = months.map(m => ({
    month:         m,
    cancellations: cancellationsByMonth[m] ?? 0,
    newMembers:    joinsByMonth[m] ?? 0,
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Retention</h1>
        <span className="text-muted-foreground text-sm">churn · cancellations · revenue at risk</span>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className={cn(
              "text-2xl font-semibold tabular-nums",
              parseFloat(churnRate) > 5 ? "text-destructive" : "text-foreground"
            )}>
              {churnRate}%
            </div>
            <div className="text-sm font-medium mt-0.5">Churn rate</div>
            <div className="text-xs text-muted-foreground">cancellations last 30d</div>
          </CardContent>
        </Card>

        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className={cn(
              "text-2xl font-semibold tabular-nums",
              netGrowth30 >= 0 ? "text-success-foreground" : "text-destructive"
            )}>
              {netGrowth30 >= 0 ? "+" : ""}{netGrowth30}
            </div>
            <div className="text-sm font-medium mt-0.5">Net growth</div>
            <div className="text-xs text-muted-foreground">{newLast30} joins · {cancelledLast30} cancels (30d)</div>
          </CardContent>
        </Card>

        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className={cn(
              "text-2xl font-semibold tabular-nums",
              revenueAtRisk > 0 ? "text-warning-foreground" : "text-foreground"
            )}>
              {formatMoney(revenueAtRisk)}
            </div>
            <div className="text-sm font-medium mt-0.5">Revenue at risk</div>
            <div className="text-xs text-muted-foreground">{outstandingInvoices.length} overdue invoices</div>
          </CardContent>
        </Card>

        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className={cn(
              "text-2xl font-semibold tabular-nums",
              pendingCancellations > 0 ? "text-warning-foreground" : "text-foreground"
            )}>
              {pendingCancellations}
            </div>
            <div className="text-sm font-medium mt-0.5">Pending reviews</div>
            <div className="text-xs text-muted-foreground">cancellation requests</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts (client component) ─────────────────────────────────────── */}
      <RetentionCharts
        churnTrendData={churnTrendData}
        reasonData={topReasons.map(([name, value]) => ({ name, value }))}
      />

      {/* ── Pending cancellations ─────────────────────────────────────────── */}
      {pendingCancellations > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Pending cancellation requests
              <Badge className="bg-warning/15 text-warning-foreground font-normal text-xs">
                {pendingCancellations} new
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Requested end</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancellations
                  .filter(c => c.status === "new")
                  .map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell>
                        <Link
                          href={`/members/${c.member_id}`}
                          className="font-medium hover:underline"
                        >
                          View member
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{c.reason ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate text-muted-foreground">
                        {c.comments ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.preferred_last_date ? formatDate(c.preferred_last_date) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(c.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Members at risk ───────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Members at risk
            <Badge variant="secondary" className="font-normal text-xs">{membersAtRisk.length}</Badge>
            <span className="text-xs text-muted-foreground font-normal">suspended or inactive</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {membersAtRisk.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No at-risk members.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersAtRisk.map(m => (
                  <TableRow key={m.id} className="relative cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-medium">
                      <Link
                        href={`/members/${m.id}`}
                        className="before:absolute before:inset-0"
                      >
                        {m.full_name ?? "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{m.member_type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-normal text-xs",
                          m.member_status === "suspended"
                            ? "bg-warning/15 text-warning-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {m.member_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.created_at ? formatDate(m.created_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Revenue at risk (overdue invoices) ───────────────────────────── */}
      {outstandingInvoices.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Overdue invoices
              <Badge className="bg-warning/15 text-warning-foreground font-normal text-xs">
                {formatMoney(revenueAtRisk)} at risk
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstandingInvoices.map(inv => {
                  const daysOver = inv.due_date
                    ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86_400_000)
                    : 0;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.contact_name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-sm",
                          daysOver >= 30 ? "text-destructive font-medium" : "text-warning-foreground"
                        )}>
                          {inv.due_date ? formatDate(inv.due_date) : "—"}
                          {daysOver > 0 && (
                            <span className="ml-1 text-xs">({daysOver}d overdue)</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoney(Number(inv.amount_due))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}


      {/* Re-engagement section */}
      <Card>
        <CardHeader>
          <CardTitle>Re-engagement Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Trigger personalised re-engagement emails to lapsed members via n8n.
            Members contacted in the last 30 days are excluded automatically.
          </p>
          <form action={async () => {
            "use server";
            const { requireRole } = await import("@/lib/auth");
            await requireRole(["owner_director", "operations_admin"]);
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bfc-echo.vercel.app";
            await fetch(`${baseUrl}/api/reengage`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET ?? "",
              },
              body: JSON.stringify({}),
            });
          }}>
            <button type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Run Re-engagement Campaign
            </button>
          </form>
          <p className="text-xs text-muted-foreground">
            Requires N8N_REENGAGE_WEBHOOK_URL to be set in .env.local.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-6">
        Cancellation data from Supabase · Invoice data from Xero via WF18. Data refreshes on next sync.
      </p>
    </AppShell>
  );
}
