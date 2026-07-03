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

export const metadata = { title: "Tasks — BFC Command Centre" };

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

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Task Queue</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {isAdmin ? "All open tasks across the team." : "Tasks assigned to you or created by you."}
      </p>

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
              {tasks.map((t) => {
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
