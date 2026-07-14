import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bookClass, cancelBooking } from "./actions";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Book a Class — Bendigo Fight Centre" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TYPE_LABELS: Record<string, string> = {
  group: "Group", private: "Private", semi_private: "Semi-private",
  kids: "Kids", competition: "Competition", other: "Other",
};

// Get next 14 days of class occurrences
function getUpcomingDates(dayOfWeek: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === dayOfWeek) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default async function BookClassPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [classesRes, myBookingsRes] = await Promise.all([
    supabase
      .from("class_templates")
      .select("*, coach:members(id, full_name)")
      .eq("is_active", true)
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("class_bookings")
      .select("id, class_template_id, booked_date, status")
      .eq("member_id", profile.member_id ?? "")
      .gte("booked_date", new Date().toISOString().slice(0, 10))
      .in("status", ["confirmed", "attended"]),
  ]);

  const classes = classesRes.data ?? [];
  const myBookings = myBookingsRes.data ?? [];
  const bookedKeys = new Set(myBookings.map((b) => `${b.class_template_id}::${b.booked_date}`));

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Book a Class</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Upcoming classes over the next 14 days. Tap a time slot to book.
      </p>

      {/* My upcoming bookings */}
      {myBookings.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">My upcoming bookings</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {myBookings.map((b) => {
              const cls = classes.find((c) => c.id === b.class_template_id);
              return (
                <div key={b.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{cls?.name ?? "Unknown class"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(b.booked_date)} · {cls?.start_time?.slice(0, 5)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={b.status === "confirmed" ? "success" : "secondary"} className="text-xs">
                      {b.status}
                    </Badge>
                    {b.status === "confirmed" && (
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit"
                          className="text-xs text-destructive hover:underline">
                          cancel
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Class schedule with book buttons */}
      {classes.length === 0 ? (
        <p className="text-muted-foreground text-sm">No active classes in the timetable yet.</p>
      ) : (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => {
            const dayclasses = classes.filter((c) => c.day_of_week === day);
            if (!dayclasses.length) return null;
            const upcomingDates = getUpcomingDates(day);
            if (!upcomingDates.length) return null;
            return (
              <div key={day}>
                <h2 className="mb-2 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  {DAYS[day]} · {formatDate(upcomingDates[0])}
                </h2>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {dayclasses.map((cls) => {
                    const coach = Array.isArray(cls.coach) ? cls.coach[0] : cls.coach;
                    const nextDate = upcomingDates[0];
                    const alreadyBooked = bookedKeys.has(`${cls.id}::${nextDate}`);
                    return (
                      <Card key={cls.id} className={alreadyBooked ? "border-success" : ""}>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">{cls.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {cls.start_time?.slice(0, 5)} · {cls.duration_minutes}min
                                {coach && ` · ${coach.full_name}`}
                              </p>
                              {cls.max_capacity && (
                                <p className="text-xs text-muted-foreground">
                                  Max {cls.max_capacity} spots
                                </p>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {TYPE_LABELS[cls.class_type] ?? cls.class_type}
                            </Badge>
                          </div>
                          <div className="mt-3">
                            {alreadyBooked ? (
                              <span className="text-xs font-medium text-success-foreground">✓ Booked</span>
                            ) : (
                              <form action={bookClass}>
                                <input type="hidden" name="class_template_id" value={cls.id} />
                                <input type="hidden" name="booked_date" value={nextDate} />
                                <button type="submit"
                                  className="h-8 w-full rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90">
                                  Book — {formatDate(nextDate)}
                                </button>
                              </form>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
