import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
import { formatDate, isoDaysAgo } from "@/lib/format";
import { logClassSession, deleteClassSession } from "./actions";

export const metadata = { title: "Coach Hours — Bendigo Fight Centre" };

const CLASS_TYPES = ["group", "private", "semi_private", "admin", "other"] as const;
const TYPE_LABELS: Record<string, string> = {
  group: "Group", private: "Private", semi_private: "Semi-private",
  admin: "Admin", other: "Other",
};

export default async function HoursPage() {
  const profile = await requireRole([
    "owner_director", "operations_admin", "finance", "coach",
  ]);
  const supabase = await createClient();
  const canManage = ["owner_director", "operations_admin"].includes(profile.role);
  const thirtyDaysAgo = isoDaysAgo(30);
  const currentMonth  = new Date().toISOString().slice(0, 7); // YYYY-MM

  const [coachesRes, sessionsRes] = await Promise.all([
    supabase
      .from("members")
      .select("id, full_name")
      .eq("member_type", "staff")
      .eq("member_status", "active")
      .is("merged_into", null)
      .order("full_name"),
    supabase
      .from("class_sessions")
      .select("*, coach:members(id, full_name)")
      .gte("session_date", thirtyDaysAgo)
      .order("session_date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(500),
  ]);

  const coaches = coachesRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  // Hours summary per coach (last 30 days)
  const hoursByCoach = new Map<string, { name: string; minutes: number; sessions: number }>();
  for (const s of sessions) {
    const coach = Array.isArray(s.coach) ? s.coach[0] : s.coach;
    if (!coach) continue;
    const existing = hoursByCoach.get(s.coach_id) ?? { name: coach.full_name ?? "Unknown", minutes: 0, sessions: 0 };
    existing.minutes  += s.duration_minutes ?? 0;
    existing.sessions += 1;
    hoursByCoach.set(s.coach_id, existing);
  }

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Coach Hours & Classes</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Log and review class sessions for payroll calculation. Showing last 30 days.
      </p>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-3xl font-bold tabular-nums">{sessions.length}</div>
            <div className="text-sm text-muted-foreground">Sessions (30d)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-3xl font-bold tabular-nums">
              {Math.round(sessions.reduce((s, r) => s + (r.duration_minutes ?? 0), 0) / 60 * 10) / 10}
            </div>
            <div className="text-sm text-muted-foreground">Total hours (30d)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-3xl font-bold tabular-nums">{hoursByCoach.size}</div>
            <div className="text-sm text-muted-foreground">Active coaches</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-3xl font-bold tabular-nums">
              {sessions.filter((s) => s.session_date?.startsWith(currentMonth)).length}
            </div>
            <div className="text-sm text-muted-foreground">Sessions this month</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-coach summary */}
      {hoursByCoach.size > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Hours summary — last 30 days</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...hoursByCoach.entries()]
                .sort((a, b) => b[1].minutes - a[1].minutes)
                .map(([id, { name, minutes, sessions: count }]) => (
                  <TableRow key={id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-right tabular-nums">{count}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {Math.round(minutes / 60 * 10) / 10}h
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Log new session */}
      {canManage && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Log a session</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={logClassSession} className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Coach *</label>
                <select name="coach_id" required className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select coach…</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Class name *</label>
                <input name="class_name" required placeholder="e.g. Muay Thai Fundamentals"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Type</label>
                <select name="class_type" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {CLASS_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Date *</label>
                <input name="session_date" type="date" required
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Start time</label>
                <input name="start_time" type="time"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Duration (mins)</label>
                <input name="duration_minutes" type="number" defaultValue={60} min={1}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Attendees</label>
                <input name="attendee_count" type="number" min={0} placeholder="optional"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Notes</label>
                <input name="notes" placeholder="optional"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex items-end md:col-span-3 lg:col-span-4">
                <button type="submit"
                  className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  Log session
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Session log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session log — last 30 days</CardTitle>
        </CardHeader>
        {sessions.length === 0 ? (
          <CardContent>
            <p className="text-muted-foreground text-sm">No sessions logged yet. Add the first one above.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Attendees</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => {
                  const coach = Array.isArray(s.coach) ? s.coach[0] : s.coach;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{formatDate(s.session_date)}</TableCell>
                      <TableCell className="font-medium">{coach?.full_name ?? "—"}</TableCell>
                      <TableCell>{s.class_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {TYPE_LABELS[s.class_type] ?? s.class_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.duration_minutes}m
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {s.attendee_count ?? "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <form action={deleteClassSession}>
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit"
                              className="text-xs text-destructive hover:underline">
                              remove
                            </button>
                          </form>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
