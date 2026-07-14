import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { recordGrading, deleteGrading } from "./actions";
import Link from "next/link";

export const metadata = { title: "Gradings — Bendigo Fight Centre" };

const DISCIPLINES = ["muay_thai","bjj","boxing","mma","wrestling","kickboxing","other"] as const;
const DISC_LABELS: Record<string,string> = {
  muay_thai:"Muay Thai", bjj:"BJJ", boxing:"Boxing", mma:"MMA",
  wrestling:"Wrestling", kickboxing:"Kickboxing", other:"Other",
};
// Belt/grade colours per discipline (approximate)
const GRADE_COLOURS: Record<string,string> = {
  white:"bg-gray-100 text-gray-800", yellow:"bg-yellow-100 text-yellow-800",
  orange:"bg-orange-100 text-orange-800", green:"bg-green-100 text-green-800",
  blue:"bg-blue-100 text-blue-800", purple:"bg-purple-100 text-purple-800",
  brown:"bg-amber-800/20 text-amber-900", red:"bg-red-100 text-red-800",
  black:"bg-gray-900 text-white",
};

export default async function GradingPage() {
  const profile = await requireRole(["owner_director","operations_admin","coach"]);
  const supabase = await createClient();

  const [gradingsRes, membersRes, coachesRes] = await Promise.all([
    supabase
      .from("member_gradings")
      .select("*, member:members!member_gradings_member_id_fkey(id,full_name), graded_by_coach:members!member_gradings_graded_by_fkey(id,full_name)")
      .order("graded_at", { ascending: false })
      .limit(200),
    supabase.from("members").select("id,full_name").eq("member_status","active").is("merged_into",null).order("full_name"),
    supabase.from("members").select("id,full_name").eq("member_type","staff").eq("member_status","active").is("merged_into",null).order("full_name"),
  ]);

  const gradings = gradingsRes.data ?? [];
  const members  = membersRes.data ?? [];
  const coaches  = coachesRes.data ?? [];
  const canManage = ["owner_director","operations_admin"].includes(profile.role);

  // Latest grade per member per discipline
  const latestByMember = new Map<string, Map<string, typeof gradings[number]>>();
  for (const g of [...gradings].reverse()) {
    if (!latestByMember.has(g.member_id)) latestByMember.set(g.member_id, new Map());
    latestByMember.get(g.member_id)!.set(g.discipline, g);
  }

  // Summary counts
  const gradingsByDisc: Record<string,number> = {};
  for (const g of gradings) {
    gradingsByDisc[g.discipline] = (gradingsByDisc[g.discipline] ?? 0) + 1;
  }

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Gradings & Belt Promotions</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Track grade progressions across all disciplines. {gradings.length} total recorded gradings.
      </p>

      {/* Discipline summary */}
      <div className="mb-8 flex flex-wrap gap-3">
        {DISCIPLINES.filter(d => gradingsByDisc[d]).map(d => (
          <Card key={d} className="px-4 py-3">
            <div className="text-2xl font-bold tabular-nums">{gradingsByDisc[d]}</div>
            <div className="text-xs text-muted-foreground">{DISC_LABELS[d]}</div>
          </Card>
        ))}
      </div>

      {/* Record new grading */}
      <Card className="mb-8">
        <CardHeader><CardTitle className="text-base">Record a grading</CardTitle></CardHeader>
        <CardContent>
          <form action={recordGrading} className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Member *</label>
              <select name="member_id" required className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select member…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Discipline *</label>
              <select name="discipline" required className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                {DISCIPLINES.map(d => <option key={d} value={d}>{DISC_LABELS[d]}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Grade / Belt *</label>
              <input name="grade" required placeholder="e.g. blue, level 2, amateur"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Date *</label>
              <input name="graded_at" type="date" required
                className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Graded by</label>
              <select name="graded_by" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select coach…</option>
                {coaches.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-sm font-medium">Notes</label>
              <input name="notes" placeholder="optional"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="flex items-end">
              <button type="submit"
                className="h-9 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Record grading
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Grading log */}
      <Card>
        <CardHeader><CardTitle className="text-base">Grading history</CardTitle></CardHeader>
        {gradings.length === 0 ? (
          <CardContent><p className="text-muted-foreground text-sm">No gradings recorded yet.</p></CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Discipline</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Graded by</TableHead>
                  <TableHead>Notes</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {gradings.map(g => {
                  const member = Array.isArray(g.member) ? g.member[0] : g.member;
                  const coach  = Array.isArray(g.graded_by_coach) ? g.graded_by_coach[0] : g.graded_by_coach;
                  const gradeKey = g.grade?.toLowerCase().split(" ")[0];
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="text-sm">{formatDate(g.graded_at)}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/members/${g.member_id}`} className="text-primary hover:underline">
                          {member?.full_name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{DISC_LABELS[g.discipline] ?? g.discipline}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs font-medium ${GRADE_COLOURS[gradeKey ?? ""] ?? ""}`}>
                          {g.grade}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{coach?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{g.notes ?? "—"}</TableCell>
                      {canManage && (
                        <TableCell>
                          <form action={deleteGrading}>
                            <input type="hidden" name="id" value={g.id} />
                            <button type="submit" className="text-xs text-destructive hover:underline">remove</button>
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
