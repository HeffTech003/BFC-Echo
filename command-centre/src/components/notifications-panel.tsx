// components/notifications-panel.tsx
// Server component — fetches all alert data and renders the panel.
// Drop into dashboard/page.tsx alongside the KPI cards.
// Usage: <NotificationsPanel /> (no props needed — fetches its own data)

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertSeverity = "critical" | "warning" | "info";

type Alert = {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  detail?: string;
  href?: string;
  value?: string;
};

// ── Severity config ───────────────────────────────────────────────────────────

const SEV: Record<AlertSeverity, { dot: string; badge: string; label: string }> = {
  critical: {
    dot:   "bg-destructive",
    badge: "bg-destructive/15 text-destructive",
    label: "Critical",
  },
  warning: {
    dot:   "bg-warning",
    badge: "bg-warning/15 text-warning-foreground",
    label: "Warning",
  },
  info: {
    dot:   "bg-primary",
    badge: "bg-primary/15 text-primary",
    label: "Info",
  },
};

const today = new Date().toISOString().slice(0, 10);

// ── Component ─────────────────────────────────────────────────────────────────

export async function NotificationsPanel() {
  const supabase = await createClient();

  const [
    overdueTasksRes,
    failedPaymentsRes,
    outstandingInvoicesRes,
    pendingCancellationsRes,
    expiredMembershipsRes,
  ] = await Promise.all([
    // Overdue open tasks
    supabase
      .from("tasks")
      .select("id, title, due_date, member_id")
      .in("status", ["open", "in_progress"])
      .lt("due_date", today)
      .order("due_date")
      .limit(10),

    // Failed payment events in the last 30 days
    supabase
      .from("payment_events")
      .select("id, event_type, occurred_at, amount, currency, member_id")
      .eq("event_type", "payment_failed")
      .gte("occurred_at", new Date(Date.now() - 30 * 86400_000).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(10),

    // Unpaid (AUTHORISED) Xero invoices
    supabase
      .from("xero_invoices")
      .select("id, xero_invoice_id, invoice_number, contact_name, amount_due, due_date")
      .eq("status", "AUTHORISED")
      .eq("invoice_type", "ACCREC")
      .lt("due_date", today)      // overdue only
      .order("due_date")
      .limit(10),

    // Pending cancellation requests
    supabase
      .from("cancellation_requests")
      .select("id, member_id, status, reason_category, created_at")
      .eq("status", "new")
      .order("created_at")
      .limit(10),

    // Memberships that ended in the last 7 days (lapsed)
    supabase
      .from("memberships")
      .select("id, member_id, plan_name, end_date, billing_provider")
      .eq("status", "active")
      .lt("end_date", today)
      .gte("end_date", new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10))
      .order("end_date")
      .limit(10),
  ]);

  const alerts: Alert[] = [];

  // ── Overdue tasks ────────────────────────────────────────────────────────
  for (const t of overdueTasksRes.data ?? []) {
    const daysOver = Math.floor(
      (Date.now() - new Date(t.due_date).getTime()) / 86400_000
    );
    alerts.push({
      id:       `task-${t.id}`,
      severity: daysOver >= 7 ? "critical" : "warning",
      category: "Task",
      title:    t.title,
      detail:   `Due ${formatDate(t.due_date)} (${daysOver}d overdue)`,
      href:     t.member_id ? `/members/${t.member_id}` : "/tasks",
    });
  }

  // ── Failed payments ──────────────────────────────────────────────────────
  for (const p of failedPaymentsRes.data ?? []) {
    const amt = p.amount != null ? formatMoney(p.amount / 100, p.currency ?? "AUD") : "";
    alerts.push({
      id:       `payment-${p.id}`,
      severity: "critical",
      category: "Payment",
      title:    `Payment failed${amt ? ` — ${amt}` : ""}`,
      detail:   formatDate(p.occurred_at),
      href:     p.member_id ? `/members/${p.member_id}` : "/payments",
      value:    amt,
    });
  }

  // ── Overdue invoices ─────────────────────────────────────────────────────
  for (const inv of outstandingInvoicesRes.data ?? []) {
    const daysOver = inv.due_date
      ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400_000)
      : 0;
    alerts.push({
      id:       `inv-${inv.id}`,
      severity: daysOver >= 14 ? "critical" : "warning",
      category: "Invoice",
      title:    `${inv.contact_name ?? "Unknown"} — ${inv.invoice_number ?? ""}`,
      detail:   `${formatMoney(Number(inv.amount_due))} overdue since ${formatDate(inv.due_date)}`,
      href:     "/invoices",
      value:    formatMoney(Number(inv.amount_due)),
    });
  }

  // ── Pending cancellations ────────────────────────────────────────────────
  for (const c of pendingCancellationsRes.data ?? []) {
    alerts.push({
      id:       `cancel-${c.id}`,
      severity: "warning",
      category: "Cancellation",
      title:    `Cancellation request — ${c.reason_category ?? "no reason given"}`,
      detail:   `Submitted ${formatDate(c.created_at)}`,
      href:     c.member_id ? `/members/${c.member_id}` : "/cancellations",
    });
  }

  // ── Lapsed memberships ───────────────────────────────────────────────────
  for (const m of expiredMembershipsRes.data ?? []) {
    alerts.push({
      id:       `mem-${m.id}`,
      severity: "info",
      category: "Membership",
      title:    `Membership lapsed — ${m.plan_name ?? m.billing_provider ?? "unknown plan"}`,
      detail:   `Ended ${formatDate(m.end_date)}`,
      href:     m.member_id ? `/members/${m.member_id}` : "/members",
    });
  }

  // Sort: critical first, then warning, then info; within each by index (already date-ordered)
  const sevOrder: AlertSeverity[] = ["critical", "warning", "info"];
  alerts.sort((a, b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity));

  if (alerts.length === 0) {
    return (
      <Card className="mb-6">
        <CardContent className="py-4 text-sm text-muted-foreground text-center">
          ✓ No active alerts
        </CardContent>
      </Card>
    );
  }

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warnings = alerts.filter((a) => a.severity === "warning").length;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          Alerts
          <div className="flex gap-1.5">
            {critical > 0 && (
              <Badge className="bg-destructive/15 text-destructive text-xs font-normal px-1.5">
                {critical} critical
              </Badge>
            )}
            {warnings > 0 && (
              <Badge className="bg-warning/15 text-warning-foreground text-xs font-normal px-1.5">
                {warnings} warnings
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ul className="divide-y">
          {alerts.map((alert) => {
            const sev = SEV[alert.severity];
            const inner = (
              <li
                key={alert.id}
                className="flex items-start gap-3 px-6 py-3 hover:bg-muted/40 transition-colors"
              >
                {/* Severity dot */}
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sev.dot}`} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-medium">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-normal px-1 py-0 ${sev.badge}`}
                      >
                        {alert.category}
                      </Badge>
                    </span>
                    <span className="text-sm font-medium truncate">{alert.title}</span>
                    {alert.value && (
                      <span className="ml-auto text-sm font-semibold tabular-nums shrink-0">
                        {alert.value}
                      </span>
                    )}
                  </div>
                  {alert.detail && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</p>
                  )}
                </div>
              </li>
            );

            return alert.href ? (
              <Link key={alert.id} href={alert.href} className="block">
                {inner}
              </Link>
            ) : (
              inner
            );
          })}
        </ul>
        {alerts.length >= 10 && (
          <p className="px-6 py-2 text-xs text-muted-foreground border-t">
            Showing top 10 alerts per category.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
