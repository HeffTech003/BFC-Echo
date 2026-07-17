// app/members/[id]/page.tsx  — Clubworx-inspired two-column profile
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SendMessageButton } from "@/components/send-message-button";
import { CreateTaskButton } from "@/components/create-task-button";
import { RelationshipManager, type RelationshipRow } from "@/components/relationship-manager";

// ── Types ─────────────────────────────────────────────────────────────────────

type Member = {
  id: string; full_name: string | null; primary_email: string | null;
  primary_phone: string | null; date_of_birth: string | null;
  member_type: string | null; member_status: string | null;
  joined_at: string | null; merged_into: string | null; notes: string | null;
};
type SourceRecord = {
  id: string; source_system: string; source_record_id: string | null;
  match_status: string; display_name: string | null; email: string | null;
  raw_data: Record<string, unknown> | null;
};
type Membership = {
  id: string; billing_provider: string | null; status: string | null;
  plan_name: string | null; start_date: string | null; end_date: string | null;
  created_at: string;
};
type PaymentEvent = {
  id: string; event_type: string; amount: number | null; currency: string | null;
  occurred_at: string; description: string | null; mandate_id: string | null;
};
type XeroInvoice = {
  id: number; xero_invoice_id: string; invoice_type: string;
  invoice_number: string | null; status: string; date: string | null;
  due_date: string | null; total: number | null; amount_due: number | null;
  amount_paid: number | null;
};
type Task = {
  id: string; title: string; status: string; priority: string | null;
  due_date: string | null; created_at: string; assigned_to: string | null;
};
type Relationship = {
  id: string; member_id: string; related_member_id: string;
  relationship_type: string; notes: string | null;
  member: { id: string; full_name: string | null; member_type: string | null; member_status: string | null } | null;
  related_member: { id: string; full_name: string | null; member_type: string | null; member_status: string | null } | null;
};
type CancellationRequest = {
  id: string; status: string; reason: string | null; comments: string | null;
  created_at: string; preferred_last_date: string | null;
};
type ClassBooking = {
  id: string; booked_date: string | null; status: string | null;
  notes: string | null; created_at: string;
};
type CommEvent = {
  id: string; channel: string | null; direction: string | null;
  subject: string | null; summary: string | null;
  occurred_at: string; source_system: string | null;
};
type Grading = {
  id: string; discipline: string | null; grade: string | null;
  graded_at: string | null; notes: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(n => n[0]?.toUpperCase() ?? "").join("");
}

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob), now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

const STATUS_COLOURS: Record<string, string> = {
  active:            "bg-success/15 text-success-foreground",
  inactive:          "bg-muted text-muted-foreground",
  non_attending:     "bg-blue-500/15 text-blue-700",
  lapsed:            "bg-yellow-500/15 text-yellow-700",
  suspended:         "bg-orange-500/15 text-orange-700",
  cancelled:         "bg-destructive/15 text-destructive",
  paused:            "bg-yellow-500/15 text-yellow-700",
  PAID:              "bg-success/15 text-success-foreground",
  AUTHORISED:        "bg-yellow-500/15 text-yellow-700",
  DRAFT:             "bg-muted text-muted-foreground",
  VOIDED:            "bg-muted text-muted-foreground",
  open:              "bg-yellow-500/15 text-yellow-700",
  in_progress:       "bg-primary/15 text-primary",
  resolved:          "bg-success/15 text-success-foreground",
  closed:            "bg-muted text-muted-foreground",
  completed:         "bg-success/15 text-success-foreground",
  new:               "bg-yellow-500/15 text-yellow-700",
  approved:          "bg-success/15 text-success-foreground",
  rejected:          "bg-muted text-muted-foreground",
  attended:          "bg-success/15 text-success-foreground",
  booked:            "bg-primary/15 text-primary",
  cancelled_booking: "bg-muted text-muted-foreground",
};

const AVATAR_STYLE: Record<string, string> = {
  active:        "bg-green-100 text-green-700 ring-green-400",
  inactive:      "bg-gray-100 text-gray-500 ring-gray-300",
  non_attending: "bg-blue-100 text-blue-700 ring-blue-400",
  lapsed:        "bg-yellow-100 text-yellow-700 ring-yellow-400",
  suspended:     "bg-orange-100 text-orange-700 ring-orange-400",
  cancelled:     "bg-red-100 text-red-700 ring-red-400",
};

function Pill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <Badge variant="secondary" className={cn("font-normal text-xs", STATUS_COLOURS[value] ?? "bg-muted text-muted-foreground")}>
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
    case "clubworx_nac": return "Clubworx NAC";
    case "gocardless":   return "GoCardless";
    case "woocommerce":  return "WooCommerce";
    case "xero":         return "Xero";
    default:             return s;
  }
}

function EmptyState({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-3xl mb-3">{icon}</span>
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("members").select("full_name").eq("id", id).single();
  return { title: `${data?.full_name ?? "Member"} — Bendigo Fight Centre` };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id }        = await params;
  const { tab = "activity" } = await searchParams;

  const profile  = await requireProfile();
  const supabase = await createClient();

  const isFinance = ["owner_director", "operations_admin", "finance"].includes(profile.role);
  const isAdmin   = ["owner_director", "operations_admin"].includes(profile.role);

  // ── Parallel data fetch ───────────────────────────────────────────────────

  const [
    memberRes, sourceRecordsRes, membershipsRes, paymentEventsRes,
    tasksRes, cancellationsRes, xeroContactRes, relationshipsRes,
    bookingsRes, commsRes, gradingsRes,
  ] = await Promise.all([
    supabase.from("members")
      .select("id, full_name, primary_email, primary_phone, date_of_birth, member_type, member_status, joined_at, merged_into, notes")
      .eq("id", id).single(),

    supabase.from("member_source_records")
      .select("id, source_system, source_record_id, match_status, display_name, email, raw_data")
      .eq("member_id", id).order("source_system"),

    supabase.from("memberships")
      .select("id, billing_provider, status, plan_name, start_date, end_date, created_at")
      .eq("member_id", id).order("created_at", { ascending: false }),

    supabase.from("payment_events")
      .select("id, event_type, amount, currency, occurred_at, description, mandate_id")
      .eq("member_id", id).order("occurred_at", { ascending: false }).limit(50),

    supabase.from("tasks")
      .select("id, title, status, priority, due_date, created_at, assigned_to")
      .eq("related_member_id", id).order("created_at", { ascending: false }).limit(20),

    supabase.from("cancellation_requests")
      .select("id, status, reason, comments, created_at, preferred_last_date")
      .eq("member_id", id).order("created_at", { ascending: false }),

    supabase.from("xero_contacts").select("xero_contact_id").eq("member_id", id).single(),

    supabase.from("member_relationships")
      .select(`id, member_id, related_member_id, relationship_type, notes,
        member:member_id(id, full_name, member_type, member_status),
        related_member:related_member_id(id, full_name, member_type, member_status)`)
      .or(`member_id.eq.${id},related_member_id.eq.${id}`)
      .order("created_at"),

    // Attendance
    supabase.from("class_bookings")
      .select("id, booked_date, status, notes, created_at")
      .eq("member_id", id).order("booked_date", { ascending: false }).limit(50),

    // Communications
    supabase.from("communication_events")
      .select("id, channel, direction, subject, summary, occurred_at, source_system")
      .eq("member_id", id).order("occurred_at", { ascending: false }).limit(30),

    // Gradings
    supabase.from("member_gradings")
      .select("id, discipline, grade, graded_at, notes")
      .eq("member_id", id).order("graded_at", { ascending: false }),
  ]);

  if (memberRes.error || !memberRes.data) notFound();

  const member        = memberRes.data as Member;
  const sourceRecords = (sourceRecordsRes.data ?? []) as SourceRecord[];
  const memberships   = (membershipsRes.data ?? []) as Membership[];
  const paymentEvents = (paymentEventsRes.data ?? []) as PaymentEvent[];
  const tasks         = (tasksRes.data ?? []) as Task[];
  const cancellations = (cancellationsRes.data ?? []) as CancellationRequest[];
  const bookings      = (bookingsRes.data ?? []) as ClassBooking[];
  const comms         = (commsRes.data ?? []) as CommEvent[];
  const gradings      = (gradingsRes.data ?? []) as Grading[];

  // Normalise relationships
  const rawRelationships = (relationshipsRes.data ?? []) as unknown as Relationship[];
  const relationships: RelationshipRow[] = rawRelationships.map((r) => {
    const outgoing = r.member_id === id;
    return {
      id: r.id, member_id: r.member_id, related_member_id: r.related_member_id,
      relationship_type: r.relationship_type, notes: r.notes,
      related_member: outgoing ? r.related_member : r.member,
      direction: outgoing ? "outgoing" : "incoming",
    };
  });

  // Xero invoices via contact link
  let xeroInvoices: XeroInvoice[] = [];
  const xeroContactId = xeroContactRes.data?.xero_contact_id;
  if (xeroContactId) {
    const { data } = await supabase.from("xero_invoices")
      .select("id, xero_invoice_id, invoice_type, invoice_number, status, date, due_date, total, amount_due, amount_paid")
      .eq("contact_id", xeroContactId).eq("invoice_type", "ACCREC")
      .order("date", { ascending: false }).limit(50);
    xeroInvoices = (data ?? []) as XeroInvoice[];
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const nacRecord       = sourceRecords.find(r => r.source_system === "clubworx_nac");
  const isNac           = member.member_type === "nac";
  const age             = calcAge(member.date_of_birth);
  const activeMembership = memberships.find(m => m.status === "active") ?? memberships[0];
  const lastAttended    = bookings.find(b => b.status === "attended")?.booked_date ?? null;
  const totalAttended   = bookings.filter(b => b.status === "attended").length;
  const today           = new Date().toISOString().slice(0, 10);
  const openTasks       = tasks.filter(t => ["open", "in_progress"].includes(t.status));

  const totalPaid = xeroInvoices.filter(i => i.status === "PAID")
    .reduce((s, i) => s + (Number(i.total) || 0), 0);
  const totalOutstanding = xeroInvoices.filter(i => i.status === "AUTHORISED")
    .reduce((s, i) => s + (Number(i.amount_due) || 0), 0);

  // Activity feed — merged timeline
  type FeedItem = { id: string; date: string; icon: string; title: string; subtitle?: string; tag?: string; amount?: number | null };
  const feed: FeedItem[] = [
    ...paymentEvents.map(e => ({
      id: e.id, date: e.occurred_at, icon: "💳",
      title: e.event_type === "payment_collected" ? "Payment collected"
           : e.event_type === "invoice_paid"      ? "Invoice paid"
           : e.event_type,
      subtitle: e.description ?? undefined,
      tag: e.event_type,
      amount: e.amount,
    })),
    ...comms.map(c => ({
      id: c.id, date: c.occurred_at,
      icon: c.channel === "email" ? "✉️" : c.channel === "sms" ? "💬" : "📣",
      title: c.direction === "inbound" ? "Message received" : "Message sent",
      subtitle: c.subject ?? undefined,
      tag: c.channel ?? undefined,
    })),
    ...gradings.map(g => ({
      id: g.id,
      date: (g.graded_at ?? today) + "T00:00:00Z",
      icon: "🥋",
      title: `Promoted — ${g.grade ?? "new grade"}`,
      subtitle: g.discipline ?? undefined,
    })),
    ...xeroInvoices.filter(i => i.status === "PAID").map(i => ({
      id: `xi-${i.id}`, date: (i.date ?? today) + "T00:00:00Z",
      icon: "🧾",
      title: `Invoice ${i.invoice_number ?? ""} paid`,
      subtitle: `Total: ${formatMoney(i.total ?? 0)}`,
      amount: i.amount_paid,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 60);

  // Tabs
  const TABS = [
    { key: "activity",   label: "Activity",   show: true },
    { key: "attendance", label: "Attendance", show: true },
    { key: "payments",   label: "Payments",   show: isFinance },
    { key: "tasks",      label: "Tasks",      show: isAdmin },
    { key: "comms",      label: "Comms",      show: true },
    { key: "gradings",   label: "Gradings",   show: true },
    { key: "admin",      label: "Admin",      show: isAdmin },
  ].filter(t => t.show);

  const activeTab = TABS.find(t => t.key === tab)?.key ?? "activity";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell profile={profile}>

      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-muted-foreground">
        <Link href="/members" className="hover:underline">Members</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">{member.full_name ?? "Unknown"}</span>
      </div>

      {/* ── Two-column layout ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">

        {/* ════ LEFT SIDEBAR ════ */}
        <div className="space-y-4">

          {/* Identity card */}
          <Card>
            <CardContent className="pt-6">
              {/* Avatar */}
              <div className="flex flex-col items-center text-center">
                <div className={cn(
                  "h-24 w-24 rounded-full flex items-center justify-center text-2xl font-bold ring-4",
                  AVATAR_STYLE[member.member_status ?? ""] ?? "bg-muted text-muted-foreground ring-border"
                )}>
                  {getInitials(member.full_name)}
                </div>

                <h1 className="mt-3 text-xl font-bold leading-tight">{member.full_name ?? "Unknown member"}</h1>

                {/* Status & type */}
                <div className="mt-2 flex flex-wrap gap-1 justify-center">
                  <Badge
                    variant="secondary"
                    className={cn("text-xs font-medium", STATUS_COLOURS[member.member_status ?? ""] ?? "")}
                  >
                    {member.member_status === "active" ? "✓ Active member"
                     : member.member_status === "non_attending" ? "Non-Attending"
                     : member.member_status ?? "—"}
                  </Badge>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {MEMBER_TYPE_LABEL(member.member_type)}
                  {age !== null ? ` · ${age} years old` : ""}
                </p>

                {member.merged_into && (
                  <Badge variant="destructive" className="mt-2 text-xs">
                    Merged →{" "}
                    <Link href={`/members/${member.merged_into}`} className="underline ml-1">view</Link>
                  </Badge>
                )}
              </div>

              {/* Action buttons */}
              {isAdmin && (
                <div className="mt-4 flex gap-2 justify-center flex-wrap">
                  {(member.primary_email || member.primary_phone) && (
                    <SendMessageButton
                      memberId={member.id}
                      toEmail={member.primary_email ?? undefined}
                      toPhone={member.primary_phone ?? undefined}
                      memberName={member.full_name ?? undefined}
                    />
                  )}
                  <CreateTaskButton memberId={member.id} memberName={member.full_name ?? undefined} />
                </div>
              )}

              {/* Contact info */}
              <div className="mt-5 border-t pt-4 space-y-2.5 text-sm">
                <div className="flex gap-3">
                  <span className="text-muted-foreground text-xs w-16 shrink-0 pt-0.5">Email</span>
                  <span className="break-all text-xs">{member.primary_email ?? "—"}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-muted-foreground text-xs w-16 shrink-0">Phone</span>
                  <span className="text-xs">{member.primary_phone ?? "—"}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-muted-foreground text-xs w-16 shrink-0">Birthday</span>
                  <span className="text-xs">{member.date_of_birth ? formatDate(member.date_of_birth) : "—"}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-muted-foreground text-xs w-16 shrink-0">Joined</span>
                  <span className="text-xs">{member.joined_at ? formatDate(member.joined_at) : "—"}</span>
                </div>
                {openTasks.length > 0 && (
                  <div className="flex gap-3">
                    <span className="text-muted-foreground text-xs w-16 shrink-0">Open tasks</span>
                    <span className="text-xs font-medium text-warning-foreground">{openTasks.length}</span>
                  </div>
                )}
              </div>

              {member.notes && (
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground italic">{member.notes}</p>
              )}
            </CardContent>
          </Card>

          {/* Family & Relationships */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Family &amp; Relationships
                <Badge variant="secondary" className="font-mono text-xs">{relationships.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <RelationshipManager
                currentMemberId={id}
                relationships={relationships}
                canWrite={isAdmin}
              />
            </CardContent>
          </Card>

          {/* NAC info (in sidebar) */}
          {isNac && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-xs font-bold">NAC</div>
                  <div className="text-xs">
                    <p className="font-semibold text-blue-900">Non-Attending Contact</p>
                    <p className="mt-1 text-blue-700">Parent or guardian of an active gym member — not a member themselves. Their youth member(s) appear in the Family section above.</p>
                    {nacRecord?.source_record_id && (
                      <p className="mt-2 text-blue-500 font-mono">{nacRecord.source_record_id}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Membership plan (sidebar mini card) */}
          {activeMembership && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Current plan</div>
                <div className="font-semibold text-sm">{activeMembership.plan_name ?? "Unknown plan"}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Pill value={activeMembership.status} />
                  <span className="text-xs text-muted-foreground capitalize">{activeMembership.billing_provider}</span>
                </div>
                {activeMembership.start_date && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    From {formatDate(activeMembership.start_date)}
                    {activeMembership.end_date ? ` to ${formatDate(activeMembership.end_date)}` : " · Does not expire"}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ════ RIGHT PANEL ════ */}
        <div className="min-w-0">

          {/* ── Stat cards row ──────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {/* Membership */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">✓ Memberships</div>
                <div className="font-bold text-sm truncate">
                  {activeMembership?.plan_name ?? "No plan"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {activeMembership?.end_date ? `Expires ${formatDate(activeMembership.end_date)}` : "Does not expire"}
                </div>
              </CardContent>
            </Card>

            {/* Balance */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">⊟ Balance</div>
                <div className={cn("font-bold text-lg tabular-nums", totalPaid > 0 ? "text-success-foreground" : "")}>
                  {formatMoney(totalPaid)}
                </div>
                {totalOutstanding > 0 ? (
                  <div className="text-xs text-warning-foreground">
                    {formatMoney(totalOutstanding)} outstanding
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">total paid (Xero)</div>
                )}
              </CardContent>
            </Card>

            {/* Last visit */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">◷ Last Visit</div>
                <div className="font-bold text-sm">
                  {lastAttended ? formatDate(lastAttended) : "Never"}
                </div>
                <Link href={`/members/${id}?tab=attendance`} className="text-xs text-primary hover:underline">
                  {totalAttended > 0 ? `${totalAttended} classes total` : "view attendance"}
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* ── Tab navigation ──────────────────────────────────────────── */}
          <div className="border-b mb-5">
            <div className="flex gap-0 overflow-x-auto">
              {TABS.map(t => (
                <Link
                  key={t.key}
                  href={`/members/${id}?tab=${t.key}`}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                    activeTab === t.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {t.label}
                  {t.key === "tasks" && openTasks.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-xs font-mono bg-warning/20 text-warning-foreground">
                      {openTasks.length}
                    </Badge>
                  )}
                  {t.key === "payments" && totalOutstanding > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-xs font-mono bg-warning/20 text-warning-foreground">!</Badge>
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* ── Tab content ─────────────────────────────────────────────── */}
          <div>

            {/* ACTIVITY TAB */}
            {activeTab === "activity" && (
              <div>
                {feed.length === 0 ? (
                  <EmptyState icon="📋" msg="No activity recorded yet. Payments, communications, gradings and more will appear here." />
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                    <div className="space-y-0">
                      {feed.map((item, i) => {
                        const d = new Date(item.date);
                        const label = isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
                        const time  = isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
                        const prevD = i > 0 ? new Date(feed[i-1].date) : null;
                        const showDate = !prevD || prevD.toDateString() !== d.toDateString();
                        return (
                          <div key={item.id}>
                            {showDate && (
                              <div className="ml-12 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide first:mt-0">
                                {label}
                              </div>
                            )}
                            <div className="flex gap-4 items-start py-2">
                              <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background border text-base">
                                {item.icon}
                              </div>
                              <div className="flex-1 min-w-0 pt-1">
                                <p className="text-sm font-medium leading-snug">{item.title}</p>
                                {item.subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.subtitle}</p>}
                              </div>
                              <div className="text-right shrink-0 pt-1">
                                {item.amount != null && item.amount > 0 && (
                                  <p className="text-sm font-semibold text-success-foreground">
                                    {formatMoney(item.amount > 1000 ? item.amount : item.amount / 100)}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">{time}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ATTENDANCE TAB */}
            {activeTab === "attendance" && (
              <div>
                {bookings.length === 0 ? (
                  <EmptyState icon="🗓️" msg="No class bookings on record yet." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookings.map(b => (
                        <TableRow key={b.id}>
                          <TableCell className="text-sm">{b.booked_date ? formatDate(b.booked_date) : "—"}</TableCell>
                          <TableCell><Pill value={b.status} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{b.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {/* PAYMENTS TAB */}
            {activeTab === "payments" && isFinance && (
              <div className="space-y-6">
                {/* Summary row */}
                {(paymentEvents.length > 0 || xeroInvoices.length > 0) && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Total paid</div>
                      <div className="text-lg font-bold text-success-foreground">{formatMoney(totalPaid)}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Outstanding</div>
                      <div className={cn("text-lg font-bold", totalOutstanding > 0 ? "text-warning-foreground" : "text-muted-foreground")}>
                        {formatMoney(totalOutstanding)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">GC events</div>
                      <div className="text-lg font-bold">{paymentEvents.length}</div>
                    </div>
                  </div>
                )}

                {/* GoCardless events */}
                {paymentEvents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      GoCardless payments
                      <Badge variant="secondary" className="font-mono">{paymentEvents.length}</Badge>
                    </h3>
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
                        {paymentEvents.map(e => (
                          <TableRow key={e.id}>
                            <TableCell className="text-sm">{formatDate(e.occurred_at)}</TableCell>
                            <TableCell><Pill value={e.event_type} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{e.description ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              {e.amount != null ? formatMoney(e.amount > 1000 ? e.amount : e.amount / 100, e.currency ?? "AUD") : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Xero invoices */}
                {xeroInvoices.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      Xero invoices
                      <Badge variant="secondary" className="font-mono">{xeroInvoices.length}</Badge>
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {xeroInvoices.map(inv => {
                          const isOverdue = inv.status === "AUTHORISED" && inv.due_date != null && inv.due_date < today;
                          return (
                            <TableRow key={inv.id} className={isOverdue ? "bg-red-50/50" : ""}>
                              <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                              <TableCell className="text-sm">{formatDate(inv.date)}</TableCell>
                              <TableCell className={cn("text-sm", isOverdue ? "text-destructive font-medium" : "")}>
                                {formatDate(inv.due_date)}
                              </TableCell>
                              <TableCell><Pill value={inv.status} /></TableCell>
                              <TableCell className="text-right tabular-nums text-sm">{formatMoney(inv.total)}</TableCell>
                              <TableCell className={cn("text-right tabular-nums text-sm", inv.amount_due && inv.amount_due > 0 ? "text-warning-foreground" : "text-muted-foreground")}>
                                {formatMoney(inv.amount_due)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {xeroInvoices.length === 0 && paymentEvents.length === 0 && (
                  <EmptyState icon="💳" msg="No payment records found for this member." />
                )}
              </div>
            )}

            {/* TASKS TAB */}
            {activeTab === "tasks" && isAdmin && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
                  <CreateTaskButton memberId={id} memberName={member.full_name ?? undefined} />
                </div>
                {tasks.length === 0 ? (
                  <EmptyState icon="✅" msg="No tasks yet. Create one above to get started." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium text-sm">{t.title}</TableCell>
                          <TableCell><Pill value={t.status} /></TableCell>
                          <TableCell><Pill value={t.priority} /></TableCell>
                          <TableCell className="text-sm">{t.due_date ? formatDate(t.due_date) : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {/* COMMS TAB */}
            {activeTab === "comms" && (
              <div>
                {comms.length === 0 ? (
                  <EmptyState icon="✉️" msg="No communications on record yet." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Summary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comms.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">{formatDate(c.occurred_at)}</TableCell>
                          <TableCell><Pill value={c.channel} /></TableCell>
                          <TableCell><Pill value={c.direction} /></TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{c.subject ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{c.summary ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {/* GRADINGS TAB */}
            {activeTab === "gradings" && (
              <div>
                {gradings.length === 0 ? (
                  <EmptyState icon="🥋" msg="No gradings on record yet." />
                ) : (
                  <div className="space-y-3">
                    {gradings.map((g, i) => (
                      <div key={g.id} className="flex items-center gap-4 rounded-lg border p-4">
                        <div className="text-3xl">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{g.grade ?? "Unknown grade"}</div>
                          <div className="text-xs text-muted-foreground">{g.discipline ?? "Unknown discipline"}</div>
                        </div>
                        <div className="text-sm text-muted-foreground">{g.graded_at ? formatDate(g.graded_at) : "—"}</div>
                        {g.notes && <div className="text-xs text-muted-foreground italic">{g.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ADMIN TAB */}
            {activeTab === "admin" && isAdmin && (
              <div className="space-y-6">

                {/* All memberships */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">All memberships ({memberships.length})</h3>
                  {memberships.length === 0 ? (
                    <EmptyState icon="📄" msg="No membership records." />
                  ) : (
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
                        {memberships.map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium text-sm">{m.plan_name ?? "—"}</TableCell>
                            <TableCell className="text-sm capitalize">{m.billing_provider ?? "—"}</TableCell>
                            <TableCell><Pill value={m.status} /></TableCell>
                            <TableCell className="text-sm">{m.start_date ? formatDate(m.start_date) : "—"}</TableCell>
                            <TableCell className="text-sm">{m.end_date ? formatDate(m.end_date) : "No end date"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {/* Source records */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Source records ({sourceRecords.length})</h3>
                  {sourceRecords.length === 0 ? (
                    <EmptyState icon="🔗" msg="No source records linked." />
                  ) : (
                    <div className="space-y-2">
                      {sourceRecords.map(r => (
                        <div key={r.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{SOURCE_LABEL(r.source_system)}</span>
                            <Pill value={r.match_status} />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.display_name && <span className="mr-3">{r.display_name}</span>}
                            {r.email && <span className="mr-3">{r.email}</span>}
                            {r.source_record_id && <span className="font-mono">#{r.source_record_id}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cancellation requests */}
                {cancellations.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-destructive">Cancellation requests ({cancellations.length})</h3>
                    <div className="space-y-2">
                      {cancellations.map(c => (
                        <div key={c.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <Pill value={c.status} />
                            <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
                          </div>
                          {c.reason && <div className="text-xs text-muted-foreground">Reason: {c.reason}</div>}
                          {c.comments && <div className="text-xs text-muted-foreground italic">{c.comments}</div>}
                          {c.preferred_last_date && (
                            <div className="text-xs text-muted-foreground">Last date: {formatDate(c.preferred_last_date)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Member notes */}
                {member.notes && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Notes</h3>
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{member.notes}</div>
                  </div>
                )}

              </div>
            )}

          </div>
        </div>
      </div>
    </AppShell>
  );
}
