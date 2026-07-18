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
import { upsertClassTemplate, toggleClassActive } from "./actions";

export const metadata = { title: "Timetable — Bendigo Fight Centre" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CLASS_TYPES = ["group", "private", "semi_private", "kids", "competition", "other"] as const;
const TYPE_LABELS: Record<string, string> = {
  group: "Group", private: "Private", semi_private: "Semi-private",
  kids: "Kids", competition: "Competition", other: "Other",
};
const TYPE_COLOURS: Record<string, string> = {
  group: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  private: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  semi_private: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  kids: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  competition: "bg-red-500/15 text-red-700 dark:text-red-300",
  other: "bg-muted text-muted-foreground",
};

export default async function TimetablePage() {
  const profile = await requireRole([
    "owner_director", "operations_admin", "finance", "coach",
  ]);
  const supabase = await createClient();
  const canManage = ["owner_director", "operations_admin"].includes(profile.role);

  const [classesRes, coachesRes] = await Promise.all([
    supabase
      .from("class_templates")
      .select("*, coach:members(id, full_name)")
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("members")
      .select("id, full_name")
      .eq("member_type", "staff")
      .eq("member_status", "active")
      .is("merged_into", null)
      .order("full_name"),
  ]);

  const classes = classesRes.data ?? [];
  const coaches = coachesRes.data ?? [];
  const active  = classes.filter((c) => c.is_active);

  // Group by day
  const byDay = new Map<number, typeof classes>();
  for (const c of active) {
    const day = byDay.get(c.day_of_week) ?? [];
    day.push(c);
    byDay.set(c.day_of_week, day);
  }

  const totalSessions = active.reduce((s, c) => s + 1, 0);
  const assignedCoaches = new Set(active.filter((c) => c.coach_id).map((c) => c.coach_id)).size;
  const typeCount = active.filter((c) => c.class_type === "group").length;

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Class Timetable</h1>
      <p className="text-muted-foreground mb-4 text-sm">
        Weekly recurring schedule.
      </p>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className={`gap-2 py-4 border-l-4 ${totalSessions > 0 ? "border-l-success" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{totalSessions}</div>
            <div className="mt-1 text-sm font-medium">Active classes</div>
            <div className="text-xs text-muted-foreground mt-0.5">per week</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{byDay.size}</div>
            <div className="mt-1 text-sm font-medium">Training days</div>
            <div className="text-xs text-muted-foreground mt-0.5">days with classes</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{typeCount}</div>
            <div className="mt-1 text-sm font-medium">Group classes</div>
            <div className="text-xs text-muted-foreground mt-0.5">of {totalSessions} total</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${assignedCoaches > 0 ? "border-l-border" : "border-l-warning"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{assignedCoaches}</div>
            <div className="mt-1 text-sm font-medium">Coaches assigned</div>
            <div className="text-xs text-muted-foreground mt-0.5">{active.length - assignedCoaches > 0 ? `${active.filter(c => !c.coach_id).length} unassigned` : "all assigned"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const dayclasses = byDay.get(day);
          if (!dayclasses?.length) return (
            <Card key={day} className="opacity-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{DAYS[day]}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">No classes</p>
              </CardContent>
            </Card>
          );
          return (
            <Card key={day}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{DAYS[day]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dayclasses.map((cls) => {
                  const coach = Array.isArray(cls.coach) ? cls.coach[0] : cls.coach;
                  return (
                    <div key={cls.id} className="rounded-md border p-2">
                      <div className="flex items-start justify-between gap-1">
                        <div className="font-medium text-sm leading-tight">{cls.name}</div>
                        <Badge
                          variant="secondary"
                          className={`text-xs shrink-0 ${TYPE_COLOURS[cls.class_type] ?? ""}`}
                        >
                          {TYPE_LABELS[cls.class_type] ?? cls.class_type}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {cls.start_time?.slice(0, 5)} · {cls.duration_minutes}min
                        {coach && ` · ${coach.full_name}`}
                        {cls.max_capacity && ` · max ${cls.max_capacity}`}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add new class */}
      {canManage && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Add class to timetable</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={upsertClassTemplate} className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Class name *</label>
                <input name="name" required placeholder="e.g. Muay Thai Fundamentals"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Type</label>
                <select name="class_type" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {CLASS_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Coach</label>
                <select name="coach_id" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">TBD / unassigned</option>
                  {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Day *</label>
                <select name="day_of_week" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Start time *</label>
                <input name="start_time" type="time" required
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Duration (mins)</label>
                <input name="duration_minutes" type="number" defaultValue={60} min={1}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Location</label>
                <input name="location" placeholder="e.g. Main floor"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Max capacity</label>
                <input name="max_capacity" type="number" min={1} placeholder="optional"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex items-end md:col-span-3 lg:col-span-4">
                <button type="submit"
                  className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  Add class
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* All classes management table */}
      {canManage && classes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All classes ({classes.length})</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Class</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Day</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Time</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Coach</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => {
                  const coach = Array.isArray(cls.coach) ? cls.coach[0] : cls.coach;
                  return (
                    <tr key={cls.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{cls.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{DAYS[cls.day_of_week]}</td>
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">
                        {cls.start_time?.slice(0, 5)} · {cls.duration_minutes}m
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {coach?.full_name ?? "Unassigned"}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={cls.is_active ? "success" : "secondary"}
                          className="text-xs">
                          {cls.is_active ? "active" : "paused"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <form action={toggleClassActive}>
                          <input type="hidden" name="id" value={cls.id} />
                          <input type="hidden" name="is_active" value={String(!cls.is_active)} />
                          <button type="submit"
                            className="text-xs text-primary hover:underline">
                            {cls.is_active ? "pause" : "activate"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
