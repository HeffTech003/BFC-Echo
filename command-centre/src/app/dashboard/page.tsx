import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney, isoDaysAgo, isoToday } from "@/lib/format";
import type { Role } from "@/lib/roles";

export const metadata = { title: "Dashboard — BFC Command Centre" };

type Rag = "green" | "amber" | "red" | "neutral";

interface Tile {
  label: string;
  count: number | null;
  rag: Rag;
  href: string;
  hint: string;
}

const RAG_STYLES: Record<Rag, string> = {
  green: "border-l-4 border-l-success",
  amber: "border-l-4 border-l-warning",
  red: "border-l-4 border-l-destructive",
  neutral: "border-l-4 border-l-border",
};

const FINANCE_ROLES: Role[] = ["owner_director", "operations_admin", "finance"];
const ADMIN_ROLES: Role[] = ["owner_director", "operations_admin"];

/** Australian FY starts July 1 */
function auFyStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}

function sumField(rows: { total?: number | null }[], key: "total" = "total"): number {
  return rows.reduce((s, r) => s + (Number((r as Record<string, unknown>)[key]) || 0), 0);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const profile = await requireProfile();
  const { denied } = await searchParams;
  const supabase = await createClient();

  const today = isoToday();
  const fyStart = auFyStart();

  const isFinance = FINANCE_ROLES.includes(profile.role);
  const isAdmin = ADMIN_ROLES.includes(profile.role);
  const isSafety = ["owner_director", "child_safety_lead"].includes(profile.role);

  // ── Operational tiles ──────────────────────────────────────────────────────
  const [
    activeMembers,
    unmatched,
    suggested,
    failedPayments,
    legacyMemberships,
    newLeads,
    tasksDue,
    syncErrors,
    openIncidents,
    pendingEmails,
    openCancellations,
    invoicesDue,
    pendingActions,
    failedActions,
  ] = await Promise.all([
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("member_status", "active")
      .is("merged_into", null),
    supabase
      .from("member_source_records")
      .select("*", { count: "exact", head: true })
      .eq("match_status", "unmatched"),
    supabase
      .from("member_source_records")
      .select("*", { count: "exact", head: true })
      .eq("match_status", "suggested"),
    supabase
      .from("payment_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "payment_failed")
      .gte("occurred_at", isoDaysAgo(30)),
    supabase
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("billing_provider", "gocardless")
      .eq("status", "active"),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .in("stage", ["new_enquiry", "trial_booked", "follow_up_required"]),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "in_progress"])
      .lte("due_date", today),
    supabase
      .from("sync_runs")
      .select("*", { count: "exact", head: true })
      .eq("status", "error")
      .gte("started_at", isoDaysAgo(7)),
    supabase
      .from("incident_reports")
      .select("*", { count: "exact", head: true })
      .neq("status", "closed"),
    supabase
      .from("email_review_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("cancellation_requests")
      .select("*", { count: "exact", head: true })
      .in("status", ["new", "in_progress"]),
    supabase
      .from("supplier_invoices")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending_review", "reviewed"])
      .lte("due_date", isoDaysAgo(-7).slice(0, 10)),
    supabase
      .from("action_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "requested"),
    supabase
      .from("action_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  // ── Member breakdown by type ───────────────────────────────────────────────
  const [gymMembers, nacMembers, onlineCustomers] = await Promise.all([
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("member_type", "gym_member")
      .eq("member_status", "active")
      .is("merged_into", null),
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("member_type", "nac")
      .eq("member_status", "active")
      .is("merged_into", null),
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("member_type", "online_customer")
      .eq("member_status", "active")
      .is("merged_into", null),
  ]);

  // ── Revenue snapshot (finance roles only) ──────────────────────────────────
  let revenueYtd = 0;
  let revenueOutstanding = 0;
  let expensesYtd = 0;
  let xeroReady = false;

  if (isFinance) {
    const [paidInvoices, outstandingInvoices, paidBills] = await Promise.all([
      supabase
        .from("xero_invoices")
        .select("total")
        .eq("invoice_type", "ACCREC")
        .eq("status", "PAID")
        .gte("date", fyStart),
      supabase
        .from("xero_invoices")
        .select("amount_due")
        .eq("invoice_type", "ACCREC")
        .eq("status", "AUTHORISED"),
      supabase
        .from("xero_invoices")
        .select("total")
        .eq("invoice_type", "ACCPAY")
        .eq("status", "PAID")
        .gte("date", fyStart),
    ]);

    xeroReady =
      !paidInvoices.error && !outstandingInvoices.error && !paidBills.error;

    revenueYtd = sumField(paidInvoices.data ?? []);
    revenueOutstanding = (outstandingInvoices.data ?? []).reduce(
      (s, r) => s + (Number(r.amount_due) || 0),
      0
    );
    expensesYtd = sumField(paidBills.data ?? []);
  }

  const rag = (n: number | null, red: boolean): Rag =>
    n == null ? "neutral" : n === 0 ? "green" : red ? "red" : "amber";

  const tiles: (Tile | null)[] = [
    {
      label: "Active members",
      count: activeMembers.count,
      rag: "neutral",
      href: "/members",
      hint: "canonical records",
    },
    isFinance
      ? {
          label: "Unmatched source records",
          count: unmatched.count,
          rag: rag(unmatched.count, false),
          href: "/match-queue",
          hint: "need reconciliation",
        }
      : null,
    isAdmin
      ? {
          label: "Suggested matches",
          count: suggested.count,
          rag: rag(suggested.count, false),
          href: "/match-queue",
          hint: "awaiting human review",
        }
      : null,
    isFinance
      ? {
          label: "Failed payments (30d)",
          count: failedPayments.count,
          rag: rag(failedPayments.count, true),
          href: "/payments",
          hint: "require action",
        }
      : null,
    isFinance
      ? {
          label: "Legacy GoCardless billing",
          count: legacyMemberships.count,
          rag: rag(legacyMemberships.count, false),
          href: "/payments",
          hint: "candidates for migration",
        }
      : null,
    isAdmin
      ? {
          label: "Open leads & trials",
          count: newLeads.count,
          rag: "neutral",
          href: "/leads",
          hint: "pipeline",
        }
      : null,
    isAdmin
      ? {
          label: "Emails awaiting review",
          count: pendingEmails.count,
          rag: rag(pendingEmails.count, false),
          href: "/email-review",
          hint: "suggested classifications",
        }
      : null,
    isFinance
      ? {
          label: "Open cancellations",
          count: openCancellations.count,
          rag: rag(openCancellations.count, false),
          href: "/cancellations",
          hint: "new + in progress",
        }
      : null,
    isFinance
      ? {
          label: "Invoices due (7d)",
          count: invoicesDue.count,
          rag: rag(invoicesDue.count, true),
          href: "/invoices",
          hint: "unpaid, due within a week",
        }
      : null,
    {
      label: "Tasks due",
      count: tasksDue.count,
      rag: rag(tasksDue.count, false),
      href: "/tasks",
      hint: "due today or overdue",
    },
    isFinance
      ? {
          label: "Actions awaiting approval",
          count: pendingActions.count,
          rag: rag(pendingActions.count, false),
          href: "/actions-queue",
          hint: "controlled write actions",
        }
      : null,
    isFinance
      ? {
          label: "Failed actions",
          count: failedActions.count,
          rag: rag(failedActions.count, true),
          href: "/actions-queue",
          hint: "execution errors — retry",
        }
      : null,
    isFinance
      ? {
          label: "Sync errors (7d)",
          count: syncErrors.count,
          rag: rag(syncErrors.count, true),
          href: "/sync",
          hint: "sync_runs",
        }
      : null,
    isSafety
      ? {
          label: "Open safety incidents",
          count: openIncidents.count,
          rag: rag(openIncidents.count, true),
          href: "/dashboard",
          hint: "restricted (Phase 3 view)",
        }
      : null,
  ];

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Live counts from the operations database. Tiles link to their work areas.
      </p>

      {denied && (
        <p className="bg-destructive/10 text-destructive mb-6 rounded-md p-3 text-sm">
          You don&apos;t have access to that area. This attempt has been noted.
        </p>
      )}

      {/* ── Operational tiles ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {tiles
          .filter((t): t is Tile => t !== null)
          .map((tile) => (
            <Link key={tile.label} href={tile.href}>
              <Card className={cn("h-full gap-2 py-4", RAG_STYLES[tile.rag])}>
                <CardContent className="px-4">
                  <div className="text-3xl font-semibold tabular-nums">
                    {tile.count ?? "—"}
                  </div>
                  <div className="mt-1 text-sm font-medium">{tile.label}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{tile.hint}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>

      {/* ── Member breakdown ───────────────────────────────────────────────── */}
      <h2 className="mt-8 mb-3 text-base font-semibold">Member breakdown</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link href="/members?type=gym_member">
          <Card className="h-full gap-2 py-4 border-l-4 border-l-border">
            <CardContent className="px-4">
              <div className="text-3xl font-semibold tabular-nums">
                {gymMembers.count ?? "—"}
              </div>
              <div className="mt-1 text-sm font-medium">Gym members</div>
              <div className="text-muted-foreground mt-0.5 text-xs">active, Clubworx</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/members?type=nac">
          <Card className="h-full gap-2 py-4 border-l-4 border-l-border">
            <CardContent className="px-4">
              <div className="text-3xl font-semibold tabular-nums">
                {nacMembers.count ?? "—"}
              </div>
              <div className="mt-1 text-sm font-medium">NAC members</div>
              <div className="text-muted-foreground mt-0.5 text-xs">active, Clubworx</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/members?type=online_customer">
          <Card className="h-full gap-2 py-4 border-l-4 border-l-border">
            <CardContent className="px-4">
              <div className="text-3xl font-semibold tabular-nums">
                {onlineCustomers.count ?? "—"}
              </div>
              <div className="mt-1 text-sm font-medium">Online customers</div>
              <div className="text-muted-foreground mt-0.5 text-xs">active, WooCommerce</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/members">
          <Card className="h-full gap-2 py-4 border-l-4 border-l-border">
            <CardContent className="px-4">
              <div className="text-3xl font-semibold tabular-nums">
                {activeMembers.count ?? "—"}
              </div>
              <div className="mt-1 text-sm font-medium">Total active</div>
              <div className="text-muted-foreground mt-0.5 text-xs">all types combined</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Revenue snapshot (finance only) ───────────────────────────────── */}
      {isFinance && (
        <>
          <div className="mt-8 mb-3 flex items-baseline gap-3">
            <h2 className="text-base font-semibold">Revenue snapshot</h2>
            <Link href="/financial" className="text-primary text-xs hover:underline">
              Full P&amp;L →
            </Link>
            {!xeroReady && (
              <span className="text-muted-foreground text-xs">
                (Xero sync pending)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Card className="h-full gap-2 py-4 border-l-4 border-l-success">
              <CardContent className="px-4">
                <div className="text-2xl font-semibold tabular-nums">
                  {xeroReady ? formatMoney(revenueYtd) : "—"}
                </div>
                <div className="mt-1 text-sm font-medium">Revenue this FY</div>
                <div className="text-muted-foreground mt-0.5 text-xs">paid invoices, Jul 1 onwards</div>
              </CardContent>
            </Card>
            <Card
              className={cn(
                "h-full gap-2 py-4 border-l-4",
                revenueOutstanding > 0 ? "border-l-warning" : "border-l-border"
              )}
            >
              <CardContent className="px-4">
                <div className="text-2xl font-semibold tabular-nums">
                  {xeroReady ? formatMoney(revenueOutstanding) : "—"}
                </div>
                <div className="mt-1 text-sm font-medium">Outstanding revenue</div>
                <div className="text-muted-foreground mt-0.5 text-xs">authorised, not yet paid</div>
              </CardContent>
            </Card>
            <Card
              className={cn(
                "h-full gap-2 py-4 border-l-4",
                expensesYtd > 0 ? "border-l-warning" : "border-l-border"
              )}
            >
              <CardContent className="px-4">
                <div className="text-2xl font-semibold tabular-nums">
                  {xeroReady ? formatMoney(expensesYtd) : "—"}
                </div>
                <div className="mt-1 text-sm font-medium">Expenses this FY</div>
                <div className="text-muted-foreground mt-0.5 text-xs">paid bills, Jul 1 onwards</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isoDaysAgo, isoToday } from "@/lib/format";
import type { Role } from "@/lib/roles";

export const metadata = { title: "Dashboard — BFC Command Centre" };

type Rag = "green" | "amber" | "red" | "neutral";

interface Tile {
  label: string;
  count: number | null;
  rag: Rag;
  href: string;
  hint: string;
}

const RAG_STYLES: Record<Rag, string> = {
  green: "border-l-4 border-l-success",
  amber: "border-l-4 border-l-warning",
  red: "border-l-4 border-l-destructive",
  neutral: "border-l-4 border-l-border",
};

const FINANCE_ROLES: Role[] = ["owner_director", "operations_admin", "finance"];
const ADMIN_ROLES: Role[] = ["owner_director", "operations_admin"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const profile = await requireProfile();
  const { denied } = await searchParams;
  const supabase = await createClient();

  const daysAgo = isoDaysAgo;
  const today = isoToday();

  // Run the tile queries in parallel. RLS silently returns 0 for tables a
  // role can't read, so we also gate visibility per role to avoid misleading
  // zeros.
  const [
    activeMembers,
    unmatched,
    suggested,
    failedPayments,
    legacyMemberships,
    newLeads,
    tasksDue,
    syncErrors,
    openIncidents,
    pendingEmails,
    openCancellations,
    invoicesDue,
    pendingActions,
    failedActions,
  ] = await Promise.all([
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("member_status", "active")
      .is("merged_into", null),
    supabase
      .from("member_source_records")
      .select("*", { count: "exact", head: true })
      .eq("match_status", "unmatched"),
    supabase
      .from("member_source_records")
      .select("*", { count: "exact", head: true })
      .eq("match_status", "suggested"),
    supabase
      .from("payment_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "payment_failed")
      .gte("occurred_at", daysAgo(30)),
    supabase
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("billing_provider", "gocardless")
      .eq("status", "active"),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .in("stage", ["new_enquiry", "trial_booked", "follow_up_required"]),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "in_progress"])
      .lte("due_date", today),
    supabase
      .from("sync_runs")
      .select("*", { count: "exact", head: true })
      .eq("status", "error")
      .gte("started_at", daysAgo(7)),
    supabase
      .from("incident_reports")
      .select("*", { count: "exact", head: true })
      .neq("status", "closed"),
    supabase
      .from("email_review_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("cancellation_requests")
      .select("*", { count: "exact", head: true })
      .in("status", ["new", "in_progress"]),
    supabase
      .from("supplier_invoices")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending_review", "reviewed"])
      .lte("due_date", isoDaysAgo(-7).slice(0, 10)),
    supabase
      .from("action_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "requested"),
    supabase
      .from("action_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  const isFinance = FINANCE_ROLES.includes(profile.role);
  const isAdmin = ADMIN_ROLES.includes(profile.role);
  const isSafety = ["owner_director", "child_safety_lead"].includes(profile.role);

  const rag = (n: number | null, red: boolean): Rag =>
    n == null ? "neutral" : n === 0 ? "green" : red ? "red" : "amber";

  const tiles: (Tile | null)[] = [
    {
      label: "Active members",
      count: activeMembers.count,
      rag: "neutral",
      href: "/members",
      hint: "canonical records",
    },
    isFinance
      ? {
          label: "Unmatched source records",
          count: unmatched.count,
          rag: rag(unmatched.count, false),
          href: "/match-queue",
          hint: "need reconciliation",
        }
      : null,
    isAdmin
      ? {
          label: "Suggested matches",
          count: suggested.count,
          rag: rag(suggested.count, false),
          href: "/match-queue",
          hint: "awaiting human review",
        }
      : null,
    isFinance
      ? {
          label: "Failed payments (30d)",
          count: failedPayments.count,
          rag: rag(failedPayments.count, true),
          href: "/payments",
          hint: "require action",
        }
      : null,
    isFinance
      ? {
          label: "Legacy GoCardless billing",
          count: legacyMemberships.count,
          rag: rag(legacyMemberships.count, false),
          href: "/payments",
          hint: "candidates for migration",
        }
      : null,
    isAdmin
      ? {
          label: "Open leads & trials",
          count: newLeads.count,
          rag: "neutral",
          href: "/leads",
          hint: "pipeline",
        }
      : null,
    isAdmin
      ? {
          label: "Emails awaiting review",
          count: pendingEmails.count,
          rag: rag(pendingEmails.count, false),
          href: "/email-review",
          hint: "suggested classifications",
        }
      : null,
    isFinance
      ? {
          label: "Open cancellations",
          count: openCancellations.count,
          rag: rag(openCancellations.count, false),
          href: "/cancellations",
          hint: "new + in progress",
        }
      : null,
    isFinance
      ? {
          label: "Invoices due (7d)",
          count: invoicesDue.count,
          rag: rag(invoicesDue.count, true),
          href: "/invoices",
          hint: "unpaid, due within a week",
        }
      : null,
    {
      label: "Tasks due",
      count: tasksDue.count,
      rag: rag(tasksDue.count, false),
      href: "/tasks",
      hint: "due today or overdue",
    },
    isFinance
      ? {
          label: "Actions awaiting approval",
          count: pendingActions.count,
          rag: rag(pendingActions.count, false),
          href: "/actions-queue",
          hint: "controlled write actions",
        }
      : null,
    isFinance
      ? {
          label: "Failed actions",
          count: failedActions.count,
          rag: rag(failedActions.count, true),
          href: "/actions-queue",
          hint: "execution errors — retry",
        }
      : null,
    isFinance
      ? {
          label: "Sync errors (7d)",
          count: syncErrors.count,
          rag: rag(syncErrors.count, true),
          href: "/sync",
          hint: "sync_runs",
        }
      : null,
    isSafety
      ? {
          label: "Open safety incidents",
          count: openIncidents.count,
          rag: rag(openIncidents.count, true),
          href: "/dashboard",
          hint: "restricted (Phase 3 view)",
        }
      : null,
  ];

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Live counts from the operations database. Tiles link to their work areas.
      </p>

      {denied && (
        <p className="bg-destructive/10 text-destructive mb-6 rounded-md p-3 text-sm">
          You don&apos;t have access to that area. This attempt has been noted.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {tiles
          .filter((t): t is Tile => t !== null)
          .map((tile) => (
            <Link key={tile.label} href={tile.href}>
              <Card className={cn("h-full gap-2 py-4", RAG_STYLES[tile.rag])}>
                <CardContent className="px-4">
                  <div className="text-3xl font-semibold tabular-nums">
                    {tile.count ?? "—"}
                  </div>
                  <div className="mt-1 text-sm font-medium">{tile.label}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{tile.hint}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>
    </AppShell>
  );
}
