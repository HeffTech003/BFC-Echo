import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime, sourceLabel } from "@/lib/format";
import { ACTION_TYPES } from "@/lib/action-types";
import { decideAction, requestAction, retryAction } from "./actions";

export const metadata = { title: "Actions — BFC Command Centre" };

export default async function ActionsQueuePage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();
  const isOwner = profile.role === "owner_director";
  const canDecideStandard = ["owner_director", "operations_admin"].includes(profile.role);

  const { data } = await supabase
    .from("action_requests")
    .select(
      "*, requester:profiles!action_requests_requested_by_fkey(full_name), approver:profiles!action_requests_approved_by_fkey(full_name), member:members(id, full_name)"
    )
    .order("requested_at", { ascending: false })
    .limit(150);

  await logAudit("actions_queue.view", "action_requests");

  const requests = data ?? [];
  const pending = requests.filter((r) => r.status === "requested");
  const queued = requests.filter((r) => r.status === "approved");
  const failed = requests.filter((r) => r.status === "failed");
  const history = requests.filter((r) =>
    ["applied", "rejected", "cancelled"].includes(r.status)
  );

  const riskBadge = (risk: string) =>
    risk === "high" ? (
      <Badge variant="destructive">high risk</Badge>
    ) : (
      <Badge variant="secondary">standard</Badge>
    );

  const requestCard = (r: (typeof requests)[number]) => {
    const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester;
    const member = Array.isArray(r.member) ? r.member[0] : r.member;
    const canDecide = r.risk_level === "high" ? isOwner : canDecideStandard;
    return (
      <Card key={r.id} className="gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-center gap-2">
            {riskBadge(r.risk_level)}
            <Badge variant="outline">{ACTION_TYPES[r.action_type]?.label ?? r.action_type}</Badge>
            <Badge variant="outline">{sourceLabel(r.target_system)}</Badge>
          </div>
          <CardTitle className="text-base">{r.summary}</CardTitle>
          <CardDescription>
            Requested by {requester?.full_name ?? "—"} · {formatDateTime(r.requested_at)}
            {member && (
              <>
                {" · "}
                <Link href={`/members/${member.id}`} className="text-primary underline-offset-4 hover:underline">
                  {member.full_name}
                </Link>
              </>
            )}
            {r.target_record_id && ` · record ${r.target_record_id}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {r.reason && <p className="mb-2 text-sm">{r.reason}</p>}
          {Object.keys(r.payload ?? {}).length > 0 && (
            <pre className="bg-muted mb-3 overflow-x-auto rounded-md p-2 text-xs">
              {JSON.stringify(r.payload, null, 2)}
            </pre>
          )}
          {canDecide ? (
            <form action={decideAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="high_risk" value={r.risk_level === "high" ? "1" : "0"} />
              <Input name="note" placeholder="decision note (optional)" className="h-8 w-52 text-xs" />
              {r.risk_level === "high" && (
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="confirm" />
                  I confirm this {ACTION_TYPES[r.action_type]?.label.toLowerCase() ?? "action"}
                </label>
              )}
              <Button size="sm" type="submit" name="decision" value="approved">
                Approve
              </Button>
              <Button size="sm" variant="outline" type="submit" name="decision" value="rejected">
                Reject
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground text-xs">
              {r.risk_level === "high"
                ? "Awaiting Owner/Director approval."
                : "Awaiting an admin decision."}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Controlled Actions</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        The only write path back into source systems: request → human approval → n8n
        executes via the supported API → full result recorded. High-risk actions
        (cancellations, pauses, refunds, bulk sends) require Owner/Director approval.
      </p>

      <Card className="mb-10">
        <CardHeader>
          <CardTitle className="text-base">New action request</CardTitle>
          <CardDescription>
            Describe the exact change. Nothing happens until it is approved, and
            execution always goes through n8n — never directly from this app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={requestAction} className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="action_type">Action</Label>
              <select
                id="action_type"
                name="action_type"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                {Object.entries(ACTION_TYPES).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                    {def.high ? " (high risk)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="summary">Summary of the change</Label>
              <Input id="summary" name="summary" required placeholder="e.g. Pause Sam Sample's membership for 4 weeks" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member_email">Member email (to link, optional)</Label>
              <Input id="member_email" name="member_email" type="email" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="target_record_id">Target record ID (optional)</Label>
              <Input id="target_record_id" name="target_record_id" placeholder="e.g. Clubworx member id" />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="payload">Exact change payload (JSON, optional)</Label>
              <Input id="payload" name="payload" placeholder='e.g. {"pause_weeks": 4, "restart_date": "2026-08-01"}' />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="reason">Reason</Label>
              <Input id="reason" name="reason" placeholder="Why this change is needed" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Submit for approval</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <h2 className="mb-3 font-medium">
        Awaiting approval <span className="text-muted-foreground">({pending.length})</span>
      </h2>
      {pending.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">Nothing waiting.</p>
      ) : (
        <div className="mb-10 space-y-4">{pending.map(requestCard)}</div>
      )}

      {queued.length > 0 && (
        <>
          <h2 className="mb-2 font-medium">
            Approved — queued for n8n{" "}
            <span className="text-muted-foreground">({queued.length})</span>
          </h2>
          <ul className="mb-8 space-y-1 text-sm">
            {queued.map((r) => {
              const approver = Array.isArray(r.approver) ? r.approver[0] : r.approver;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  {riskBadge(r.risk_level)}
                  <span className="max-w-md truncate">{r.summary}</span>
                  <span className="text-muted-foreground text-xs">
                    approved by {approver?.full_name ?? "—"} {formatDateTime(r.approved_at)} ·
                    attempt {r.attempt_count}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {failed.length > 0 && (
        <>
          <h2 className="text-destructive mb-2 font-medium">
            Failed <span className="text-muted-foreground">({failed.length})</span>
          </h2>
          <ul className="mb-8 space-y-2 text-sm">
            {failed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">failed</Badge>
                <span className="max-w-md truncate">{r.summary}</span>
                <span className="text-destructive text-xs">{r.error_message}</span>
                {canDecideStandard && (
                  <form action={retryAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button size="sm" variant="outline" type="submit">
                      Retry
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mb-2 font-medium">History</h2>
      {history.length === 0 ? (
        <p className="text-muted-foreground text-sm">No completed actions yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {history.slice(0, 30).map((r) => {
            const approver = Array.isArray(r.approver) ? r.approver[0] : r.approver;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    r.status === "applied"
                      ? "success"
                      : r.status === "rejected"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {r.status}
                </Badge>
                <span className="max-w-md truncate">{r.summary}</span>
                <span className="text-muted-foreground text-xs">
                  {sourceLabel(r.target_system)}
                  {r.status === "applied" &&
                    ` · by ${approver?.full_name ?? "—"} · applied ${formatDateTime(r.applied_at)}`}
                  {r.decision_note ? ` · ${r.decision_note}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
