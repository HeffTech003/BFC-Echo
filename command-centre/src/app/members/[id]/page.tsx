// app/members/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { SendMessageButton } from "@/components/send-message-button";
import { CreateTaskButton } from "@/components/create-task-button";
import { RelationshipManager, type RelationshipRow } from "@/components/relationship-manager";

// ── Types ────────────────────────────────────────────────────────────────────

type Member = {
  id: string;
  full_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  date_of_birth: string | null;
  member_type: string | null;
  member_status: string | null;
  joined_at: string | null;
  merged_into: string | null;
  notes: string | null;
};

type SourceRecord = {
  id: string;
  source_system: string;
  source_record_id: string | null;
  match_status: string;
  display_name: string | null;
  email: string | null;
  raw_data: Record<string, unknown> | null;
};

type Membership = {
  id: string;
  billing_provider: string | null;
  status: string | null;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

type PaymentEvent = {
  id: string;
  event_type: string;
  amount: number | null;
  currency: string | null;
  occurred_at: string;
  description: string | null;
  mandate_id: string | null;
};

type XeroInvoice = {
  id: number;
  xero_invoice_id: string;
  invoice_type: string;
  invoice_number: string | null;
  status: string;
  date: string | null;
  due_date: string | null;
  total: number | null;
  amount_due: number | null;
  amount_paid: number | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  created_at: string;
  assigned_to: string | null;
};

type Relationship = {
  id: string;
  member_id: string;
  related_member_id: string;
  relationship_type: string;
  notes: string | null;
  // joined
  member:         { id: string; full_name: string | null; member_type: string | null; member_status: string | null } | null;
  related_member: { id: string; full_name: string | null; member_type: string | null; member_status: string | null } | null;
};

type CancellationRequest = {
  id: string;
  status: string;
  reason: string | null;
  comments: string | null;
  created_at: string;
  preferred_last_date: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  active:            "bg-success/15 text-success-foreground",
  inactive:          "bg-muted text-muted-foreground",
  non_attending:     "bg-blue-500/15 text-blue-700",
  lapsed:            "bg-warning/15 text-warning-foreground",
  suspended:         "bg-warning/15 text-warning-foreground",
  cancelled:         "bg-destructive/15 text-destructive",
  paused:            "bg-warning/15 text-warning-foreground",
  PAID:              "bg-success/15 text-success-foreground",
  AUTHORISED:        "bg-warning/15 text-warning-foreground",
  DRAFT:             "bg-muted text-muted-foreground",
  VOIDED:            "bg-muted text-muted-foreground",
  payment_paid:      "bg-success/15 text-success-foreground",
  payment_failed:    "bg-destructive/15 text-destructive",
  payment_cancelled: "bg-muted text-muted-foreground",
  mandate_active:    "bg-success/15 text-success-foreground",
  mandate_cancelled: "bg-muted text-muted-foreground",
  mandate_failed:    "bg-destructive/15 text-destructive",
  open:              "bg-warning/15 text-warning-foreground",
  in_progress:       "bg-primary/15 text-primary",
  resolved:          "bg-success/15 text-success-foreground",
  closed:            "bg-muted text-muted-foreground",
  new:               "bg-warning/15 text-warning-foreground",
  approved:          "bg-success/15 text-success-foreground",
  rejected:          "bg-muted text-muted-foreground",
  completed:         "bg-success/15 text-success-foreground",
};

function Pill({ value, fallback = "—" }: { value: string | null | undefined; fallback?: string }) {
  if (!value) return <span className="text-muted-foreground">{fallback}</span>;
  return (
    <Badge variant="secondary" className={cn("font-normal", STATUS_COLOURS[value] ?? "")}>
      {value}
    </Badge>
  );
}

function MEMBER_TYPE_LABEL(t: string | null) {
  switch (t) {
    case "gym_member":      return "Gym Member";
    case "nac":             return "Non-Attending Contact";
    case "online_customer": return "Online Customer";
    case "supplier":        return "Supplier";
    case "staff":           return "Staff";
    default:                return t ?? "Unknown";
  }
}

function SOURCE_LABEL(s: string) {
  switch (s) {
    case "clubworx":     return "Clubworx";
    case "clubworx_nac": return "Clubworx (NAC)";
    case "gocardless":   return "GoCardless";
    case "woocommerce":  return "WooCommerce";
    case "square":       return "Square";
    case "xero":         return "Xero";
    default:             return s;
  }
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          {count !== undefined && (
            <Badge variant="secondary" className="font-mono text-xs">{count}</Badge>
          )}
          {action && <div className="ml-auto">{action}</div>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-muted-foreground text-center text-sm py-6">
        {msg}
      </TableCell>
    </TableRow>
  );
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("members").select("full_name").eq("id", id).single();
  return { title: `${data?.full_name ?? "Member"} — Bendigo Fight Centre` };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const isFinance = ["owner_director", "operations_admin", "finance"].includes(profile.role);
  const isAdmin   = ["owner_director", "operations_admin"].includes(profile.role);

  // ── Parallel data fetch ──────────────────────────────────────────────────

  const [
    memberRes,
    sourceRecordsRes,
    membershipsRes,
    paymentEventsRes,
    tasksRes,
    cancellationsRes,
    xeroContactRes,
    relationshipsRes,
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id, full_name, primary_email, primary_phone, date_of_birth, member_type, member_status, joined_at, merged_into, notes")
      .eq("id", id)
      .single(),

    supabase
      .from("member_source_records")
      .select("id, source_system, source_record_id, match_status, display_name, email, raw_data")
      .eq("member_id", id)
      .order("source_system"),

    supabase
      .from("memberships")
      .select("id, billing_provider, status, plan_name, start_date, end_date, created_at")
      .eq("member_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("payment_events")
      .select("id, event_type, amount, currency, occurred_at, description, mandate_id")
      .eq("member_id", id)
      .order("occurred_at", { ascending: false })
      .limit(30),

    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, created_at, assigned_to")
      .eq("related_member_id", id)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("cancellation_requests")
      .select("id, status, reason, comments, created_at, preferred_last_date")
      .eq("member_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("xero_contacts")
      .select("xero_contact_id")
      .eq("member_id", id)
      .single(),

    // Relationships — fetch both outgoing (member_id=id) and incoming (related_member_id=id)
    supabase
      .from("member_relationships")
      .select(`
        id, member_id, related_member_id, relationship_type, notes,
        member:member_id(id, full_name, member_type, member_status),
        related_member:related_member_id(id, full_name, member_type, member_status)
      `)
      .or(`member_id.eq.${id},related_member_id.eq.${id}`)
      .order("created_at"),
  ]);

  if (memberRes.error || !memberRes.data) notFound();

  const member        = memberRes.data as Member;
  const sourceRecords = (sourceRecordsRes.data ?? []) as SourceRecord[];
  const memberships   = (membershipsRes.data ?? []) as Membership[];
  const tasks         = (tasksRes.data ?? []) as Task[];
  const cancellations = (cancellationsRes.data ?? []) as CancellationRequest[];

  // Normalise relationships — tag each row as outgoing or incoming from this member's POV
  const rawRelationships = (relationshipsRes.data ?? []) as unknown as Relationship[];
  const relationships: RelationshipRow[] = rawRelationships.map((r) => {
    const outgoing = r.member_id === id;
    return {
      id:                r.id,
      member_id:         r.member_id,
      related_member_id: r.related_member_id,
      relationship_type: r.relationship_type,
      notes:             r.notes,
      related_member:    outgoing ? r.related_member : r.member,
      direction:         outgoing ? "outgoing" : "incoming",
    };
  });

  const paymentEvents: PaymentEvent[] = (paymentEventsRes.data ?? []) as PaymentEvent[];

  // ── Xero invoices via contact link ────────────────────────────────────────

  let xeroInvoices: XeroInvoice[] = [];
  const xeroContactId = xeroContactRes.data?.xero_contact_id;

  if (xeroContactId) {
    const { data } = await supabase
      .from("xero_invoices")
      .select("id, xero_invoice_id, invoice_type, invoice_number, status, date, due_date, total, amount_due, amount_paid")
      .eq("contact_id", xeroContactId)
      .eq("invoice_type", "ACCREC")
      .order("date", { ascending: false })
      .limit(30);
    xeroInvoices = (data ?? []) as XeroInvoice[];
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const nacRecord   = sourceRecords.find(r => r.source_system === "clubworx_nac");
  const guardianInfo = nacRecord?.raw_data as Record<string, unknown> | null;
  const isNac       = member.member_type === "nac";

  const gcSourceRecord = sourceRecords.find(r => r.source_system === "gocardless");
  const gcCustomerId   = gcSourceRecord?.source_record_id;

  const totalPaid = xeroInvoices
    .filter(i => i.status === "PAID")
    .reduce((s, i) => s + (Number(i.total) || 0), 0);

  const totalOutstanding = xeroInvoices
    .filter(i => i.status === "AUTHORISED")
    .reduce((s, i) => s + (Number(i.amount_due) || 0), 0);

  const openTasks = tasks.filter(t => ["open", "in_progress"].includes(t.status));

  const today = new Date().toISOString().slice(0, 10);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell profile={profile}>
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-muted-foreground">
        <Link href="/members" className="hover:underline">Members</Link>
        <span className="mx-2">/</span>
        <span>{member.full_name ?? "Unknown"}</span>
      </div>

      {/* ── Header card ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            {/* Identity */}
            <div>
              <h1 className="text-2xl font-semibold">{member.full_name ?? "Unknown member"}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill value={member.member_status} />
                <Badge variant="outline">{MEMBER_TYPE_LABEL(member.member_type)}</Badge>
                {member.merged_into && (
                  <Badge variant="destructive" className="text-xs">
                    Merged →{" "}
                    <Link href={`/members/${member.merged_into}`} className="underline ml-1">view</Link>
                  </Badge>
                )}
              </div>
            </div>

            {/* Stats + quick actions */}
            <div className="flex flex-col items-end gap-3">
              {isFinance && (
                <div className="flex gap-6 text-right text-sm">
                  <div>
                    <div className="text-lg font-semibold tabular-nums text-success-foreground">
                      {formatMoney(totalPaid)}
                    </div>
                    <div className="text-muted-foreground text-xs">total paid (Xero)</div>
                  </div>
                  {totalOutstanding > 0 && (
                    <div>
                      <div className="text-lg font-semibold tabular-nums text-warning-foreground">
                        {formatMoney(totalOutstanding)}
                      </div>
                      <div className="text-muted-foreground text-xs">outstanding</div>
                    </div>
                  )}
                  {openTasks.length > 0 && (
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{openTasks.length}</div>
                      <div className="text-muted-foreground text-xs">open tasks</div>
                    </div>
                  )}
                </div>
              )}

              {/* Quick action buttons (admin only) */}
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  {/* Send email/SMS */}
                  {(member.primary_email || member.primary_phone) && (
                    <SendMessageButton
                      memberId={member.id}
                      toEmail={member.primary_email ?? undefined}
                      toPhone={member.primary_phone ?? undefined}
                      memberName={member.full_name ?? undefined}
                    />
                  )}
                  {/* Create task */}
                  <CreateTaskButton memberId={member.id} memberName={member.full_name ?? undefined} />
                </div>
              )}
            </div>
          </div>

          {/* Contact details */}
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground text-xs">Email</div>
              <div className="truncate">{member.primary_email ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Phone</div>
              <div>{member.primary_phone ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Date of birth</div>
              <div>{member.date_of_birth ? formatDate(member.date_of_birth) : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Joined</div>
              <div>{member.joined_at ? formatDate(member.joined_at) : "—"}</div>
            </div>
          </div>

          {member.notes && (
            <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">{member.notes}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Relationships ─────────────────────────────────────────────────── */}
      <Section title="Family & Relationships" count={relationships.length}>
        <RelationshipManager
          currentMemberId={id}
          relationships={relationships}
          canWrite={isAdmin}
        />
      </Section>

      {/* ── NAC info banner ───────────────────────────────────────────────── */}
      {isNac && (
        <Card className="mt-6 border-blue-200 bg-blue-50/50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-sm font-semibold">
                NAC
              </div>
              <div className="text-sm">
                <p className="font-medium text-blue-900">Non-Attending Contact</p>
                <p className="mt-1 text-blue-700">
                  This person is a parent or guardian of an active gym member — they are not a member themselves.
                  Their linked youth member(s) appear in the <strong>Family &amp; Relationships</strong> section above.
                </p>
                {nacRecord && (
                  <p className="mt-2 text-xs text-blue-500">
                    Clubworx NAC record: <code>{nacRecord.source_record_id}</code>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Membership & billing ──────────────────────────────────────────── */}
      <Section title="Membership & Billing" count={memberships.length}>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">No memberships on record.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.plan_name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{m.billing_provider ?? "—"}</TableCell>
                    <TableCell><Pill value={m.status} /></TableCell>
                    <TableCell>{m.start_date ? formatDate(m.start_date) : "—"}</TableCell>
                    <TableCell>{m.end_date ? formatDate(m.end_date) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Source platform IDs */}
        <div className="mt-4 border-t pt-3 flex flex-wrap gap-3 text-xs">
          {sourceRecords.map((r) => (
            <div key={r.id} className="text-muted-foreground">
              <span className="font-medium">{SOURCE_LABEL(r.source_system)}</span>
              {r.source_record_id && <span className="ml-1 font-mono">{r.source_record_id}</span>}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Payment history ──────────────────────────────────────────────── */}
      {isFinance && (
        <Section title="Payment History" count={paymentEvents.length + xeroInvoices.length}>
          {/* GoCardless events */}
          {paymentEvents.length > 0 && (
            <>
              <h3 className="text-sm font-medium mb-2">GoCardless payments</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentEvents.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm">{formatDate(e.occurred_at)}</TableCell>
                        <TableCell><Pill value={e.event_type} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {e.description ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {e.amount != null
                            ? formatMoney(e.amount / 100, e.currency ?? "AUD")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {paymentEvents.length === 30 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-2">
                          Showing most recent 30 events
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Xero invoices */}
          {xeroInvoices.length > 0 && (
            <div className={paymentEvents.length > 0 ? "mt-6 border-t pt-4" : ""}>
              <h3 className="text-sm font-medium mb-2">Xero invoices</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {xeroInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-sm">{inv.date ? formatDate(inv.date) : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                        <TableCell><Pill value={inv.status} /></TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inv.total != null ? formatMoney(inv.total) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-success-foreground">
                          {inv.amount_paid != null && inv.amount_paid > 0 ? formatMoney(inv.amount_paid) : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            inv.amount_due && inv.amount_due > 0
                              ? "text-warning-foreground font-medium"
                              : "text-muted-foreground"
                          )}
                        >
                          {inv.amount_due != null && inv.amount_due > 0 ? formatMoney(inv.amount_due) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {xeroInvoices.length === 30 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-2">
                          Showing most recent 30 invoices
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {paymentEvents.length === 0 && xeroInvoices.length === 0 && (
            <p className="text-sm text-muted-foreground">No payment history found.</p>
          )}
        </Section>
      )}

      {/* ── Tasks ─────────────────────────────────────────────────────────── */}
      {isAdmin && (
        <Section
          title="Tasks"
          count={tasks.length}
          action={
            <CreateTaskButton
              memberId={member.id}
              memberName={member.full_name ?? undefined}
              variant="outline"
              size="sm"
              label="+ New task"
            />
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.length === 0 ? (
                  <EmptyRow cols={5} msg="No tasks for this member." />
                ) : (
                  tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                          {t.title}
                        </Link>
                      </TableCell>
                      <TableCell><Pill value={t.status} /></TableCell>
                      <TableCell className="capitalize text-sm">{t.priority ?? "—"}</TableCell>
                      <TableCell
                        className={cn(
                          "text-sm",
                          t.due_date && t.due_date < today && !["resolved", "closed"].includes(t.status)
                            ? "text-destructive font-medium"
                            : ""
                        )}
                      >
                        {t.due_date ? formatDate(t.due_date) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(t.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}

      {/* ── Cancellations ─────────────────────────────────────────────────── */}
      {isFinance && (
        <Section title="Cancellation & Retention" count={cancellations.length}>
          {cancellations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cancellation requests on record.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Preferred end</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancellations.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{formatDate(c.created_at)}</TableCell>
                      <TableCell><Pill value={c.status} /></TableCell>
                      <TableCell className="text-sm">{c.reason ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {c.preferred_last_date ? formatDate(c.preferred_last_date) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {cancellations.some(c => c.comments) && (
            <div className="mt-3 border-t pt-3 space-y-2">
              {cancellations.filter(c => c.comments).map(c => (
                <div key={c.id} className="text-sm">
                  <span className="text-muted-foreground text-xs">{formatDate(c.created_at)}: </span>
                  {c.comments}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Source records ────────────────────────────────────────────────── */}
      {isAdmin && (
        <Section title="Source Records" count={sourceRecords.length}>
          <div className="grid gap-3 sm:grid-cols-2">
            {sourceRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">No source records linked.</p>
            ) : (
              sourceRecords.map((r) => (
                <div key={r.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{SOURCE_LABEL(r.source_system)}</span>
                    <Pill value={r.match_status} />
                  </div>
                  <div className="mt-1 space-y-0.5 text-muted-foreground text-xs">
                    {r.source_record_id && (
                      <div>ID: <code className="text-foreground">{r.source_record_id}</code></div>
                    )}
                    {r.display_name && (
                      <div>Name: {r.display_name}</div>
                    )}
                    {r.email && r.email !== member.primary_email && <div>Email: {r.email}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>
      )}
    </AppShell>
  );
}
