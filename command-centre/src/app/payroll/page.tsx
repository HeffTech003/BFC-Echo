import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { createPayRun, updatePayRunStatus } from "./actions";
import { sendPayRunToXero } from "./xero-actions";

export const metadata = { title: "Payroll — Bendigo Fight Centre" };

const STATUS_COLOURS: Record<string, string> = {
  draft:        "bg-muted text-muted-foreground",
  under_review: "bg-warning/15 text-warning-foreground",
  approved:     "bg-success/15 text-success-foreground",
  paid:         "bg-primary/15 text-primary",
  cancelled:    "bg-destructive/15 text-destructive",
};

export default async function PayrollPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();
  const isOwner = profile.role === "owner_director";

  const [runsRes, coachesRes] = await Promise.all([
    supabase
      .from("pay_runs")
      .select("*, items:pay_run_items(*, member:members(id, full_name))")
      .order("period_start", { ascending: false })
      .limit(12),
    supabase
      .from("members")
      .select("id, full_name")
      .eq("member_type", "staff")
      .eq("member_status", "active")
      .is("merged_into", null)
      .order("full_name"),
  ]);

  const runs = runsRes.data ?? [];
  const coaches = coachesRes.data ?? [];

  const pendingRuns = runs.filter((r) => ["draft", "under_review"].includes(r.status));
  const paidRuns    = runs.filter((r) => r.status === "paid");
  const totalPaid   = paidRuns.reduce((s, r) => {
    const items = (r.items ?? []) as { gross_amount: number }[];
    return s + items.reduce((si, i) => si + Number(i.gross_amount), 0);
  }, 0);

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Payroll</h1>
      <p className="text-muted-foreground mb-4 text-sm">
        Calculate coach pay from logged sessions → review → approve → send to Xero.
      </p>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{runs.length}</div>
            <div className="mt-1 text-sm font-medium">Pay runs</div>
            <div className="text-xs text-muted-foreground mt-0.5">all time</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${pendingRuns.length > 0 ? "border-l-warning" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{pendingRuns.length}</div>
            <div className="mt-1 text-sm font-medium">Awaiting approval</div>
            <div className="text-xs text-muted-foreground mt-0.5">draft or under review</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-success">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{formatMoney(totalPaid)}</div>
            <div className="mt-1 text-sm font-medium">Total paid out</div>
            <div className="text-xs text-muted-foreground mt-0.5">{paidRuns.length} paid runs</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{coaches.length}</div>
            <div className="mt-1 text-sm font-medium">Active coaches</div>
            <div className="text-xs text-muted-foreground mt-0.5">staff members</div>
          </CardContent>
        </Card>
      </div>

      {/* Create pay run */}
      {isOwner && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Calculate new pay run</CardTitle>
            <CardDescription>
              Pulls all logged class sessions in the period and calculates gross pay
              using each coach&apos;s current rate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createPayRun} className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Period start *</label>
                <input name="period_start" type="date" required
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Period end *</label>
                <input name="period_end" type="date" required
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-sm font-medium">Notes</label>
                <input name="notes" placeholder="e.g. Fortnightly — June 1–14"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <button type="submit"
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Calculate pay run
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Pay runs list */}
      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">No pay runs yet.</p>
            <p className="text-muted-foreground text-xs mt-1">
              Log coach sessions in <a href="/hours" className="text-primary hover:underline">Hours</a> first,
              then calculate a pay run above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {runs.map((run) => {
            const items = (run.items ?? []) as {
              id: string; member_id: string; total_minutes: number;
              total_sessions: number; gross_amount: number;
              member: { id: string; full_name: string } | { id: string; full_name: string }[];
            }[];
            const totalGross = items.reduce((s, i) => s + Number(i.gross_amount), 0);
            const isDraft = run.status === "draft";
            const isReview = run.status === "under_review";
            const isApproved = run.status === "approved";

            return (
              <Card key={run.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">
                        {formatDate(run.period_start)} – {formatDate(run.period_end)}
                      </CardTitle>
                      {run.notes && (
                        <CardDescription>{run.notes}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className={STATUS_COLOURS[run.status] ?? ""}
                      >
                        {run.status.replace("_", " ")}
                      </Badge>
                      <span className="text-lg font-bold tabular-nums">
                        {formatMoney(totalGross)}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                {items.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Coach</TableHead>
                          <TableHead className="text-right">Sessions</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => {
                          const member = Array.isArray(item.member) ? item.member[0] : item.member;
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">
                                {member?.full_name ?? "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {item.total_sessions}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {Math.round(item.total_minutes / 60 * 10) / 10}h
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {formatMoney(item.gross_amount)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="border-t-2 font-bold">
                          <TableCell>Total</TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(totalGross)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Status actions */}
                <CardContent className="pt-4 flex gap-3 flex-wrap">
                  {isDraft && (
                    <form action={updatePayRunStatus}>
                      <input type="hidden" name="id" value={run.id} />
                      <input type="hidden" name="status" value="under_review" />
                      <button type="submit"
                        className="h-8 rounded-md border border-input px-3 text-sm hover:bg-muted">
                        Submit for review
                      </button>
                    </form>
                  )}
                  {isReview && isOwner && (
                    <form action={updatePayRunStatus}>
                      <input type="hidden" name="id" value={run.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit"
                        className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                        Approve pay run
                      </button>
                    </form>
                  )}
                  {isApproved && (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-muted-foreground">
                        Approved {run.approved_at ? formatDate(run.approved_at) : ""}
                      </p>
                      {isOwner && (
                        <form action={sendPayRunToXero}>
                          <input type="hidden" name="pay_run_id" value={run.id} />
                          <button type="submit"
                            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            Send to Xero Payroll
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                  {!["approved", "paid", "cancelled"].includes(run.status) && (
                    <form action={updatePayRunStatus}>
                      <input type="hidden" name="id" value={run.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <button type="submit"
                        className="h-8 rounded-md border border-destructive/30 px-3 text-sm text-destructive hover:bg-destructive/10">
                        Cancel
                      </button>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pay rates note */}
      <p className="mt-6 text-xs text-muted-foreground">
        Pay rates are set in the <code className="text-xs bg-muted px-1 rounded">coach_pay_rates</code> table (Supabase).
        Run Step 11 SQL to create the payroll tables, then insert rates per coach and class type.
      </p>
    </AppShell>
  );
}
