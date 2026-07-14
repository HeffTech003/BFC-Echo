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
import { formatDate, formatDateTime, isoToday } from "@/lib/format";
import { createIncident, updateIncident } from "./actions";

export const metadata = { title: "Incidents — Bendigo Fight Centre" };

const SEVERITY_VARIANT: Record<string, "outline" | "secondary" | "warning" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "warning",
  critical: "destructive",
};

export default async function IncidentsPage() {
  const profile = await requireRole(["owner_director", "child_safety_lead"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("incident_reports")
    .select("*, reporter:profiles!incident_reports_reported_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  await logAudit("incidents.list_view", "incident_reports");

  const incidents = data ?? [];
  const open = incidents.filter((i) => i.status !== "closed");
  const closed = incidents.filter((i) => i.status === "closed");
  const today = isoToday();

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Incident Reports</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Restricted workflow: submitted → risk assessed → actions recorded → follow-up →
        review date → closed only with outcome notes (database-enforced).
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Report an incident</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createIncident} className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                name="category"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="injury">Injury</option>
                <option value="child_safety">Child safety</option>
                <option value="behaviour">Behaviour</option>
                <option value="facility">Facility</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="severity">Severity</Label>
              <select
                id="severity"
                name="severity"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="occurred_at">When</Label>
              <Input id="occurred_at" name="occurred_at" type="datetime-local" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" name="location" placeholder="e.g. main mat area" />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="description">What happened</Label>
              <Input id="description" name="description" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="people_involved">People involved (comma-separated)</Label>
              <Input id="people_involved" name="people_involved" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="witnesses">Witnesses (comma-separated)</Label>
              <Input id="witnesses" name="witnesses" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="evidence_refs">Evidence references (comma-separated)</Label>
              <Input id="evidence_refs" name="evidence_refs" placeholder="file names / Drive links" />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="immediate_actions">Immediate actions taken</Label>
              <Input id="immediate_actions" name="immediate_actions" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notifications_made">Notifications made</Label>
              <Input id="notifications_made" name="notifications_made" placeholder="e.g. parent, DHHS, police" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="review_date">Review date</Label>
              <Input id="review_date" name="review_date" type="date" />
            </div>
            <div className="md:col-span-3">
              <Button type="submit">Submit incident</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <h2 className="mb-3 font-medium">
        Open cases <span className="text-muted-foreground">({open.length})</span>
      </h2>
      {open.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">No open incidents.</p>
      ) : (
        <div className="mb-10 space-y-4">
          {open.map((i) => {
            const reporter = Array.isArray(i.reporter) ? i.reporter[0] : i.reporter;
            const overdue = i.review_date && i.review_date < today;
            return (
              <Card key={i.id} className={overdue ? "border-l-destructive border-l-4 gap-3 py-4" : "gap-3 py-4"}>
                <CardHeader className="px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={SEVERITY_VARIANT[i.severity] ?? "outline"}>
                      {i.severity}
                    </Badge>
                    <Badge variant="secondary">{i.category.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline">{i.status.replace(/_/g, " ")}</Badge>
                    {overdue && <Badge variant="destructive">review overdue</Badge>}
                  </div>
                  <CardDescription>
                    {formatDateTime(i.occurred_at)} · {i.location ?? "no location"} ·
                    reported by {reporter?.full_name ?? "—"} · review{" "}
                    {formatDate(i.review_date)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4">
                  <p className="mb-1 text-sm">{i.description}</p>
                  {(i.people_involved?.length ?? 0) > 0 && (
                    <p className="text-muted-foreground mb-1 text-xs">
                      People involved: {(i.people_involved as string[]).join(", ")}
                    </p>
                  )}
                  {(i.witnesses?.length ?? 0) > 0 && (
                    <p className="text-muted-foreground mb-1 text-xs">
                      Witnesses: {(i.witnesses as string[]).join(", ")}
                    </p>
                  )}
                  {(i.evidence_refs?.length ?? 0) > 0 && (
                    <p className="text-muted-foreground mb-1 text-xs">
                      Evidence: {(i.evidence_refs as string[]).join(", ")}
                    </p>
                  )}
                  {i.immediate_actions && (
                    <p className="text-muted-foreground mb-1 text-xs">
                      Immediate: {i.immediate_actions}
                    </p>
                  )}
                  {i.notifications_made && (
                    <p className="text-muted-foreground mb-1 text-xs">
                      Notifications: {i.notifications_made}
                    </p>
                  )}
                  {i.follow_up_actions && (
                    <p className="text-muted-foreground mb-3 text-xs">
                      Follow-up: {i.follow_up_actions}
                    </p>
                  )}
                  <form action={updateIncident} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={i.id} />
                    <select
                      name="status"
                      defaultValue={i.status}
                      className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                    >
                      <option value="open">Open</option>
                      <option value="under_review">Under review</option>
                      <option value="closed">Closed</option>
                    </select>
                    <Input
                      name="follow_up_actions"
                      placeholder="follow-up actions"
                      className="h-8 w-44 text-xs"
                    />
                    <Input
                      name="notifications_made"
                      placeholder="notifications made"
                      className="h-8 w-40 text-xs"
                    />
                    <Input name="review_date" type="date" className="h-8 w-36 text-xs" />
                    <Input
                      name="outcome_notes"
                      placeholder="outcome notes (required to close)"
                      className="h-8 w-56 text-xs"
                    />
                    <Button size="sm" variant="outline" type="submit">
                      Save
                    </Button>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-2 font-medium">
        Closed <span className="text-muted-foreground">({closed.length})</span>
      </h2>
      {closed.length === 0 ? (
        <p className="text-muted-foreground text-sm">None.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {closed.slice(0, 20).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{i.category.replace(/_/g, " ")}</Badge>
              <span className="max-w-md truncate">{i.description}</span>
              <span className="text-muted-foreground text-xs">
                closed {formatDate(i.closed_at)} · {i.outcome_notes}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
