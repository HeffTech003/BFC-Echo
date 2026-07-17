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
type Disc = typeof DISCIPLINES[number];

const DISC_LABELS: Record<string,string> = {
  muay_thai:"Muay Thai", bjj:"BJJ", boxing:"Boxing", mma:"MMA",
  wrestling:"Wrestling", kickboxing:"Kickboxing", other:"Other",
};
const DISC_ICONS: Record<string,string> = {
  muay_thai:"🥊", bjj:"🥋", boxing:"🥊", mma:"🏆",
  wrestling:"🤼", kickboxing:"👟", other:"🎖️",
};

// Belt/grade colour classes
const GRADE_COLOURS: Record<string,string> = {
  white:  "bg-gray-100 text-gray-800 border border-gray-300",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-800",
  green:  "bg-green-100 text-green-800",
  blue:   "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
  brown:  "bg-amber-700/20 text-amber-900",
  red:    "bg-red-100 text-red-800",
  black:  "bg-gray-900 text-white",
};

function gradeColour(grade?: string | null) {
  if (!grade) return "";
  const key = grade.toLowerCase().split(" ")[0];
  return GRADE_COLOURS[key] ?? "bg-muted text-muted-foreground";
}

export default async function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ disc?: string }>;
}) {
  const profile = await requireRole(["owner_director","operations_admin","coach"]);
  const supabase = await createClient();
  const { disc } = await searchParams;
  const activeDisc: Disc = (DISCIPLINES as readonly string[]).includes(disc ?? "") ? disc as Disc : "muay_thai";

  const [gradingsRes, membersRes, coachesRes] = await Promise.all([
    supabase
      .from("member_gradings")
      .select("*, member:members!member_gradings_member_id_fkey(id,full_name), graded_by_coach:members!member_gradings_graded_by_fkey(id,full_name)")
      .order("graded_at", { ascending: false })
      .limit(500),
    supabase.from("members").select("id,full_name").eq("member_status","active").is("merged_into",null).order("full_name"),
    supabase.from("members").select("id,full_name").eq("member_type","staff").eq("member_status","active").is("merged_into",null).order("full_name"),
  ]);

  const gradings = gradingsRes.data ?? [];
  const members  = membersRes.data ?? [];
  const coaches  = coachesRes.data ?? [];
  const canManage = ["owner_director","operations_admin"].includes(profile.role);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-01`;
  const gradingsThisMonth = gradings.filter(g => g.graded_at >= monthStart).length;
  const membersGraded = new Set(gradings.map(g => g.member_id)).size;
  const gradingsByDisc: Record<string,number> = {};
  for (const g of gradings) {
    gradingsByDisc[g.discipline] = (gradingsByDisc[g.discipline] ?? 0) + 1;
  }
  const topDisc = Object.entries(gradingsByDisc).sort((a,b) => b[1]-a[1])[0];

  // ── Latest grade per member per discipline ─────────────────────────────────
  // Map: memberId → disciplineName → grading record
  const latestByMember = new Map<string, Map<string, typeof gradings[number]>>();
  for (const g of [...gradings].reverse()) {
    if (!latestByMember.has(g.member_id)) latestByMember.set(g.member_id, new Map());
    latestByMember.get(g.member_id)!.set(g.discipline, g);
  }

  // Members who have at least one grading in active discipline
  const beltBoard = members
    .map(m => ({
      member: m,
      grades: latestByMember.get(m.id) ?? new Map(),
    }))
    .filter(row => row.grades.has(activeDisc));

  // Grade distribution for active discipline (for the belt breakdown bar)
  const gradeDist: Record<string,number> = {};
  for (const row of beltBoard) {
    const g = row.grades.get(activeDisc)!;
    const key = g.grade?.toLowerCase().split(" ")[0] ?? "other";
    gradeDist[key] = (gradeDist[key] ?? 0) + 1;
  }

  // Recent gradings tab (active discipline only)
  const discHistory = gradings.filter(g => g.discipline === activeDisc);

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Gradings &amp; Belt Promotions</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Track grade progressions across all disciplines.
      </p>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{gradings.length}</div>
            <div className="mt-1 text-sm font-medium">Total gradings</div>
            <div className="text-muted-foreground text-xs mt-0.5">all time, all disciplines</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-success">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{membersGraded}</div>
            <div className="mt-1 text-sm font-medium">Members graded</div>
            <div className="text-muted-foreground text-xs mt-0.5">unique members with grades</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-warning">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{gradingsThisMonth}</div>
            <div className="mt-1 text-sm font-medium">This month</div>
            <div className="text-muted-foreground text-xs mt-0.5">gradings recorded</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{topDisc ? DISC_ICONS[topDisc[0]] : "—"}</div>
            <div className="mt-1 text-sm font-medium">{topDisc ? DISC_LABELS[topDisc[0]] : "—"}</div>
            <div className="text-muted-foreground text-xs mt-0.5">most active discipline ({topDisc?.[1] ?? 0} records)</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Discipline tabs ────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-2">
        {DISCIPLINES.filter(d => gradingsByDisc[d] || d === "muay_thai").map(d => (
          <Link
            key={d}
            href={`/grading?disc=${d}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeDisc === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <span>{DISC_ICONS[d]}</span>
            <span>{DISC_LABELS[d]}</span>
            {gradingsByDisc[d] ? (
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${activeDisc === d ? "bg-white/20" : "bg-background"}`}>
                {gradingsByDisc[d]}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {/* ── Belt board for active discipline ──────────────────────────────── */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {DISC_ICONS[activeDisc]} {DISC_LABELS[activeDisc]} Belt Board
            </CardTitle>
            <span className="text-sm text-muted-foreground">{beltBoard.length} members</span>
          </div>
          {/* Grade distribution pills */}
          {Object.keys(gradeDist).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(gradeDist)
                .sort((a,b) => {
                  const order = ["white","yellow","orange","green","blue","purple","brown","red","black"];
                  return order.indexOf(a[0]) - order.indexOf(b[0]);
                })
                .map(([grade, count]) => (
                  <span key={grade} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${GRADE_COLOURS[grade] ?? "bg-muted text-muted-foreground"}`}>
                    {grade} × {count}
                  </span>
                ))}
            </div>
          )}
        </CardHeader>
        {beltBoard.length === 0 ? (
          <CardContent>
            <p className="text-muted-foreground text-sm">No {DISC_LABELS[activeDisc]} gradings recorded yet.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Current grade</TableHead>
                  <TableHead>Graded by</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {beltBoard
                  .sort((a, b) => {
                    const order = ["black","red","brown","purple","blue","green","orange","yellow","white"];
                    const ga = a.grades.get(activeDisc)?.grade?.toLowerCase().split(" ")[0] ?? "zzz";
                    const gb = b.grades.get(activeDisc)?.grade?.toLowerCase().split(" ")[0] ?? "zzz";
                    return order.indexOf(ga) - order.indexOf(gb);
                  })
                  .map(row => {
                    const g = row.grades.get(activeDisc)!;
                    const coach = Array.isArray(g.graded_by_coach) ? g.graded_by_coach[0] : g.graded_by_coach;
                    return (
                      <TableRow key={row.member.id}>
                        <TableCell className="font-medium">
                          <Link href={`/members/${row.member.id}`} className="text-primary hover:underline">
                            {row.member.full_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={"text-xs font-medium " + gradeColour(g.grade)}>
                            {g.grade}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{coach?.full_name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(g.graded_at)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{g.notes ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* ── Record new grading ─────────────────────────────────────────────── */}
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
              <select name="discipline" required defaultValue={activeDisc} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
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

      {/* ── Grading history for active discipline ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {DISC_LABELS[activeDisc]} grading history
          </CardTitle>
          <p className="text-sm text-muted-foreground">{discHistory.length} records</p>
        </CardHeader>
        {discHistory.length === 0 ? (
          <CardContent><p className="text-muted-foreground text-sm">No gradings recorded for this discipline yet.</p></CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Graded by</TableHead>
                  <TableHead>Notes</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {discHistory.map(g => {
                  const member = Array.isArray(g.member) ? g.member[0] : g.member;
                  const coach  = Array.isArray(g.graded_by_coach) ? g.graded_by_coach[0] : g.graded_by_coach;
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="text-sm">{formatDate(g.graded_at)}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/members/${g.member_id}`} className="text-primary hover:underline">
                          {member?.full_name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={"text-xs font-medium " + gradeColour(g.grade)}>
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
