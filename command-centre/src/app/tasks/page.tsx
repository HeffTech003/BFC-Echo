import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, isoToday } from "@/lib/format";
import { createTask, updateTaskStatus } from "./actions";

export const metadata = { title: "Tasks — Bendigo Fight Centre" };

const PRIORITY_VARIANT: Record<string, "destructive" | "warning" | "secondary" | "outline"> = {
  urgent: "destructive",
  high: "warning",
  normal: "secondary",
  low: "outline",
};

export default async function TasksPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const isAdmin = ["owner_director", "operations_admin"].includes(profile.role);

  const [tasksRes, staffRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*, assignee:profiles!tasks_assigned_to_fkey(id, full_name), member:members(id, full_name)"
      )
      .in("status", ["open", "in_progress"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200),
    isAdmin
      ? supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name")
      : Promise.resolve({ data: null }),
  ]);

  const tasks = tasksRes.data ?? [];
  const staff = staffRes.data ?? [];
  const today = isoToday();

  // Stats
  const overdueTasks   = tasks.filter(t => t.due_date && t.due_date <= today);
  const urgentTasks    = tasks.filter(t => t.priority === "urgent");
  const inProgressTasks = tasks.filter(t => t.status === "in_progress");

  // Sort: overdue first, then by priority weight, then by due_date
  const PRIORITY_WEIGHT: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const sortedTasks = [...tasks].sort((a, b) => {
    const aOverdue = a.due_date && a.due_date <= today ? 0 : 1;
    const bOverdue = b.due_date && b.due_date <= today ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const pw = (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2);
    if (pw !== 0) return pw;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

  return (
    <AppShell profile={profile}>
      <div className="mb-4 flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Task Queue</h1>
        <span className="text-muted-foreground text-sm">{tasks.length} open</span>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{tasks.length}</div>
            <div className="mt-1 text-sm font-medium">Total open</div>
            <div className="text-xs text-muted-foreground mt-0.5">open + in progress</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${overdueTasks.length > 0 ? "border-l-destructive" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className={`text-3xl font-bold tabular-nums ${overdueTasks.length > 0 ? "text-destructive" : ""}`}>
              {overdueTasks.length}
            </div>
            <div className="mt-1 text-sm font-medium">Overdue</div>
            <div className="text-xs text-muted-foreground mt-0.5">past due date</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${urgentTasks.length > 0 ? "border-l-warning" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{urgentTasks.length}</div>
            <div className="mt-1 text-sm font-medium">Urgent</div>
            <div className="text-xs text-muted-foreground mt-0.5">high priority</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{inProgressTasks.length}</div>
            <div className="mt-1 text-sm font-medium">In progress</div>
            <div className="text-xs text-muted-foreground mt-0.5">being worked on</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">New task</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTask} className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="What needs doing?" />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="description">Details (optional)</Label>
              <Input id="description" name="description" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                defaultValue="normal"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="due_date">Due date</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label htmlFor="assigned_to">Assign to</Label>
                <select
                  id="assigned_to"
                  name="assigned_to"
                  defaultValue={profile.id}
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end">
              <Button type="submit">Create task</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No open tasks. 🎉</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.map((t) => {
                const assignee = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee;
                const member = Array.isArray(t.member) ? t.member[0] : t.member;
                const overdue = t.due_date && t.due_date <= today;
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.title}</div>
                      {t.description && (
                        <div className="text-muted-foreground max-w-md truncate text-xs">
                          {t.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[t.priority] ?? "outline"}>
                        {t.priority}
                      </Badge>
                      {t.status === "in_progress" && (
                        <Badge variant="outline" className="ml-1">
                          in progress
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={overdue ? "text-destructive font-medium" : ""}>
                      {formatDate(t.due_date)}
                    </TableCell>
                    <TableCell>{assignee?.full_name ?? "—"}</TableCell>
                    <TableCell>
                      {member ? (
                        <Link
                          href={`/members/${member.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {member.full_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {t.status === "open" && (
                          <form action={updateTaskStatus}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="status" value="in_progress" />
                            <Button size="sm" variant="outline" type="submit">
                              Start
                            </Button>
                          </form>
                        )}
                        <form action={updateTaskStatus}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="status" value="done" />
                          <Button size="sm" type="submit">
                            Done
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
