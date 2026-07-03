import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
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
import { formatDate, formatDateTime, formatMoney, sourceLabel } from "@/lib/format";
import type { Role } from "@/lib/roles";

export const metadata = { title: "Member Profile — BFC Command Centre" };

const FINANCE_ROLES: Role[] = ["owner_director", "operations_admin", "finance"];

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .single();

  if (!member) notFound();

  // Every profile view is audit-logged (sensitive record view).
  await logAudit("member.view", "members", id);

  const [sources, memberships, payments, comms, leads, tasks] = await Promise.all([
    supabase
      .from("member_source_records")
      .select("*")
      .eq("member_id", id)
      .order("source_system"),
    supabase
      .from("memberships")
      .select("*")
      .eq("member_id", id)
      .order("start_date", { ascending: false }),
    supabase
      .from("payment_events")
      .select("*")
      .eq("member_id", id)
      .order("occurred_at", { ascending: false })
      .limit(30),
    supabase
      .from("communication_events")
      .select("*")
      .eq("member_id", id)
      .order("occurred_at", { ascending: false })
      .limit(15),
    supabase.from("leads").select("*").eq("member_id", id),
    supabase
      .from("tasks")
      .select("*")
      .eq("related_member_id", id)
      .in("status", ["open", "in_progress"]),
  ]);

  const failedPayments = (payments.data ?? []).filter(
    (p) => p.event_type === "payment_failed"
  );
  const activeMembership = (memberships.data ?? []).find((m) => m.status === "active");
  const canSeePayments = FINANCE_ROLES.includes(profile.role);

  const needsAction: string[] = [];
  if (failedPayments.length > 0 && canSeePayments)
    needsAction.push(`${failedPayments.length} failed payment(s) in recent history`);
  if ((tasks.data ?? []).length > 0)
    needsAction.push(`${(tasks.data ?? []).length} open task(s)`);
  if (!activeMembership) needsAction.push("No active membership on record");
  if (activeMembership?.billing_provider === "gocardless")
    needsAction.push("Billing via legacy GoCardless — migration candidate");

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {member.full_name}
            {member.is_youth && (
              <Badge variant="outline" className="ml-2 align-middle">
                Youth
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">
            {member.primary_email ?? "no email"} · {member.primary_phone ?? "no phone"}
          </p>
        </div>
        <Badge
          variant={
            member.member_status === "active"
              ? "success"
              : member.member_status === "legacy"
                ? "warning"
                : "secondary"
          }
        >
          {member.member_status}
        </Badge>
      </div>

      {needsAction.length > 0 && (
        <Card className="border-warning mb-6 gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Needs action</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ul className="list-disc pl-5 text-sm">
              {needsAction.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Membership</CardTitle>
            <CardDescription>
              {activeMembership
                ? `Paying via ${sourceLabel(activeMembership.billing_provider)}`
                : "No active membership"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(memberships.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No membership records.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(memberships.data ?? []).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.membership_type ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === "active" ? "success" : "outline"}>
                          {m.status ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>{sourceLabel(m.billing_provider)}</TableCell>
                      <TableCell>
                        {formatMoney(m.amount)}
                        {m.billing_interval ? `/${m.billing_interval}` : ""}
                      </TableCell>
                      <TableCell>{formatDate(m.start_date)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {sourceLabel(m.source_system)} · {m.source_record_id}
                        <br />
                        synced {formatDateTime(m.last_synced_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connected source records</CardTitle>
            <CardDescription>
              Where this member exists across BFC systems.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(sources.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No source records linked yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>System</TableHead>
                    <TableHead>Source ID</TableHead>
                    <TableHead>Name in source</TableHead>
                    <TableHead>Last synced</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sources.data ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{sourceLabel(s.source_system)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.source_record_id}
                      </TableCell>
                      <TableCell>{s.display_name ?? "—"}</TableCell>
                      <TableCell>{formatDateTime(s.last_synced_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {canSeePayments && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Payment timeline</CardTitle>
              <CardDescription>Most recent 30 events, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {(payments.data ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">No payment events.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(payments.data ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDateTime(p.occurred_at)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.event_type === "payment_failed"
                                ? "destructive"
                                : p.event_type === "refund" || p.event_type === "chargeback"
                                  ? "warning"
                                  : "secondary"
                            }
                          >
                            {p.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatMoney(p.amount, p.currency)}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {p.description ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {sourceLabel(p.source_system)} · {p.source_record_id}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Leads & trials</CardTitle>
          </CardHeader>
          <CardContent>
            {(leads.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No lead history.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(leads.data ?? []).map((l) => (
                  <li key={l.id} className="flex items-center gap-2">
                    <Badge variant="outline">{l.stage}</Badge>
                    <span>{l.interested_class ?? "general"}</span>
                    <span className="text-muted-foreground">
                      {l.trial_date ? `trial ${formatDate(l.trial_date)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent communication</CardTitle>
          </CardHeader>
          <CardContent>
            {(comms.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No communication events.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(comms.data ?? []).map((c) => (
                  <li key={c.id}>
                    <span className="text-muted-foreground">
                      {formatDateTime(c.occurred_at)} · {c.channel}
                    </span>
                    <br />
                    {c.subject ?? c.summary ?? "—"}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground mt-6 text-xs">
        Canonical record {member.id} · created {formatDateTime(member.created_at)} ·
        updated {formatDateTime(member.updated_at)}. Source systems remain
        authoritative; this view is read-only.
      </p>
    </AppShell>
  );
}
