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
import { formatDate, isoToday } from "@/lib/format";

export const metadata = { title: "Attendance — Bendigo Fight Centre" };

const STATUS_COLOURS: Record<string, string> = {
  confirmed:  "bg-muted text-muted-foreground",
  attended:   "bg-success/15 text-success-foreground",
  no_show:    "bg-destructive/15 text-destructive",
  cancelled:  "bg-warning/15 text-warning-foreground",
};

export default async function AttendancePage() {
  const profile = await requireRole([
    "owner_director", "operations_admin", "coach",
  ]);
  const supabase = await createClient();
  const today = isoToday();

  // Load today's classes + bookings for roll call
  const [classesRes, bookingsRes] = await Promise.all([
    supabase
      .from("class_templates")
      .select("id, name, start_time, duration_minutes, day_of_week, coach:members(id, full_name)")
      .eq("is_active", true)
      .eq("day_of_week", new Date().getDay()),
    supabase
      .from("class_bookings")
      .select("id, class_template_id, status, member:members(id, full_name, primary_email)")
      .eq("booked_date", today)
      .order("class_template_id"),
  ]);

  const todayClasses = classesRes.data ?? [];
  const todayBookings = bookingsRes.data ?? [];

  // Group bookings by class
  const bookingsByClass = new Map<string, typeof todayBookings>();
  for (const b of todayBookings) {
    const arr = bookingsByClass.get(b.class_template_id) ?? [];
    arr.push(b);
    bookingsByClass.set(b.class_template_id, arr);
  }

  // Recent attendance stats (last 30 days)
  const { data: statsData } = await supabase
    .from("class_bookings")
    .select("status, class_template_id")
    .gte("booked_date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));

  const stats = { attended: 0, no_show: 0, confirmed: 0, cancelled: 0 };
  for (const s of statsData ?? []) {
    stats[s.status as keyof typeof stats] = (stats[s.status as keyof typeof stats] ?? 0) + 1;
  }
  const totalTracked = stats.attended + stats.no_show;
  const attendanceRate = totalTracked > 0 ? Math.round(stats.attended / totalTracked * 100) : null;

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Attendance & Roll Call</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Today: {formatDate(today)} — mark attendance for each booking below.
      </p>

      {/* 30-day stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-success">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{stats.attended}</div>
            <div className="mt-1 text-sm font-medium">Attended</div>
            <div className="text-xs text-muted-foreground mt-0.5">last 30 days</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-destructive">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{stats.no_show}</div>
            <div className="mt-1 text-sm font-medium">No-shows</div>
            <div className="text-xs text-muted-foreground mt-0.5">last 30 days</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-warning">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{stats.cancelled}</div>
            <div className="mt-1 text-sm font-medium">Cancelled</div>
            <div className="text-xs text-muted-foreground mt-0.5">last 30 days</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">
              {attendanceRate !== null ? `${attendanceRate}%` : "—"}
            </div>
            <div className="mt-1 text-sm font-medium">Attendance rate</div>
            <div className="text-xs text-muted-foreground mt-0.5">attended ÷ tracked</div>
          </CardContent>
        </Card>
      </div>

      {/* Today's roll calls */}
      {todayClasses.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">No classes scheduled for today.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {todayClasses.map((cls) => {
            const coach = Array.isArray(cls.coach) ? cls.coach[0] : cls.coach;
            const bookings = bookingsByClass.get(cls.id) ?? [];
            return (
              <Card key={cls.id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{cls.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {cls.start_time?.slice(0, 5)} · {cls.duration_minutes}min
                      {coach && ` · ${coach.full_name}`}
                    </span>
                  </CardTitle>
                </CardHeader>
                {bookings.length === 0 ? (
                  <CardContent>
                    <p className="text-muted-foreground text-sm">No bookings for this class today.</p>
                  </CardContent>
                ) : (
                  <div className="divide-y">
                    {bookings.map((b) => {
                      const member = Array.isArray(b.member) ? b.member[0] : b.member;
                      return (
                        <div key={b.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="font-medium text-sm">{member?.full_name ?? "Unknown"}</p>
                            {member?.primary_email && (
                              <p className="text-xs text-muted-foreground">{member.primary_email}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`text-xs ${STATUS_COLOURS[b.status] ?? ""}`}
                            >
                              {b.status.replace("_", " ")}
                            </Badge>
                            {b.status === "confirmed" && (
                              <div className="flex gap-1">
                                <form action="/attendance/mark" method="POST">
                                  <input type="hidden" name="id" value={b.id} />
                                  <input type="hidden" name="status" value="attended" />
                                  <button type="submit"
                                    className="h-7 rounded bg-success/20 px-2 text-xs text-success-foreground hover:bg-success/30">
                                    ✓ Present
                                  </button>
                                </form>
                                <form action="/attendance/mark" method="POST">
                                  <input type="hidden" name="id" value={b.id} />
                                  <input type="hidden" name="status" value="no_show" />
                                  <button type="submit"
                                    className="h-7 rounded bg-destructive/10 px-2 text-xs text-destructive hover:bg-destructive/20">
                                    ✗ No-show
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
