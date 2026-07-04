import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
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
import { formatDate, isoDaysAgo, isoToday } from "@/lib/format";

export const metadata = { title: "Compliance — BFC Command Centre" };

export default async function CompliancePage() {
  const profile = await requireRole([
    "owner_director",
    "operations_admin",
    "child_safety_lead",
    "coach",
  ]);
  const supabase = await createClient();
  const isRestricted = ["owner_director", "child_safety_lead"].includes(profile.role);
  const isCoach = profile.role === "coach";
  const today = isoToday();
  const soon = isoDaysAgo(-60);

  // -------------------------------------------------------------------------
  // Coach view: their OWN acknowledgement status only. No restricted data.
  // -------------------------------------------------------------------------
  if (isCoach) {
    const [policiesRes, myAcksRes] = await Promise.all([
      supabase
        .from("policy_versions")
        .select("id, policy_name, version, required_audience, review_date")
        .eq("is_current", true)
        .order("policy_name"),
      supabase
        .from("policy_acknowledgements")
        .select("policy_version_id")
        .eq("profile_id", profile.id),
    ]);
    const staffPolicies = (policiesRes.data ?? []).filter((p) =>
      (p.required_audience ?? []).some((a: string) => a === "coaches" || a === "staff")
    );
    const acked = new Set((myAcksRes.data ?? []).map((a) => a.policy_version_id));

    return (
      <AppShell profile={profile}>
        <h1 className="mb-1 text-2xl font-semibold">My Compliance</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Your own policy acknowledgement status. Member health and incident records are
          not accessible from this role.
        </p>
        {staffPolicies.length === 0 ? (
          <p className="text-muted-foreground text-sm">No staff/coach policies to sign.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Your status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffPolicies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.policy_name}</TableCell>
                    <TableCell>{p.version}</TableCell>
                    <TableCell>
                      {acked.has(p.id) ? (
                        <Badge variant="success">signed</Badge>
                      ) : (
                        <Badge variant="warning">outstanding</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AppShell>
    );
  }

  // -------------------------------------------------------------------------
  // Manager / Child Safety Lead view: full compliance dashboard.
  // -------------------------------------------------------------------------
  const [policiesRes, acksRes, activeMembersRes, youthRes] = await Promise.all([
    supabase
      .from("policy_versions")
      .select("id, policy_name, version, required_audience, review_date")
      .eq("is_current", true)
      .order("policy_name"),
    supabase.from("policy_acknowledgements").select("policy_version_id, member_id"),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("member_status", "active")
      .is("merged_into", null),
    supabase
      .from("members")
      .select("id, full_name")
      .eq("is_youth", true)
      .eq("member_status", "active")
      .is("merged_into", null),
  ]);

  const policies = policiesRes.data ?? [];
  const activeMemberCount = activeMembersRes.count ?? 0;
  const youthMembers = youthRes.data ?? [];

  // distinct member acknowledgements per current policy version
  const ackedMembers = new Map<string, Set<string>>();
  for (const a of acksRes.data ?? []) {
    if (!a.member_id) continue;
    if (!ackedMembers.has(a.policy_version_id))
      ackedMembers.set(a.policy_version_id, new Set());
    ackedMembers.get(a.policy_version_id)!.add(a.member_id);
  }

  const matrix = policies.map((p) => {
    const audience = p.required_audience ?? [];
    const signed = ackedMembers.get(p.id)?.size ?? 0;
    let target: number | null = null;
    if (audience.includes("youth_guardians")) target = youthMembers.length;
    else if (audience.includes("members")) target = activeMemberCount;
    const outstanding = target != null ? Math.max(target - signed, 0) : null;
    const reviewOverdue = p.review_date && p.review_date < today;
    return { ...p, signed, target, outstanding, reviewOverdue };
  });

  // Restricted summaries (Owner/Director + Child Safety Lead only)
  let overdueForms = 0;
  let overdueIncidents = 0;
  let incompleteYouth: { id: string; full_name: string }[] = [];
  if (isRestricted) {
    const [formsRes, incidentsRes, youthFormsRes] = await Promise.all([
      supabase
        .from("medical_forms")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted")
        .lte("expires_at", soon),
      supabase
        .from("incident_reports")
        .select("id", { count: "exact", head: true })
        .neq("status", "closed")
        .lt("review_date", today),
      supabase
        .from("medical_forms")
        .select("member_id")
        .eq("form_type", "youth_onboarding")
        .eq("status", "submitted"),
    ]);
    overdueForms = formsRes.count ?? 0;
    overdueIncidents = incidentsRes.count ?? 0;
    const onboarded = new Set((youthFormsRes.data ?? []).map((f) => f.member_id));
    incompleteYouth = youthMembers.filter((m) => !onboarded.has(m.id));
  }

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Compliance & Safety</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Restricted area. Medical and incident data is limited to the Owner/Director and
        Child Safety Lead; every access is audit-logged.
      </p>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Link href="/compliance/policies">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Policy Library</CardTitle>
              <CardDescription>{policies.length} current policies</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {isRestricted && (
          <>
            <Link href="/compliance/forms">
              <Card className={overdueForms > 0 ? "border-l-warning h-full border-l-4" : "h-full"}>
                <CardHeader>
                  <CardTitle className="text-base">Medical & Emergency Forms</CardTitle>
                  <CardDescription>
                    {overdueForms} expiring within 60 days
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/compliance/incidents">
              <Card className={overdueIncidents > 0 ? "border-l-destructive h-full border-l-4" : "h-full"}>
                <CardHeader>
                  <CardTitle className="text-base">Incident Reports</CardTitle>
                  <CardDescription>
                    {overdueIncidents} with overdue review
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </>
        )}
      </div>

      <h2 className="mb-2 font-medium">Acknowledgement status by policy</h2>
      {matrix.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">No current policies yet.</p>
      ) : (
        <div className="mb-8 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Signed</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.policy_name}</TableCell>
                  <TableCell>{p.version}</TableCell>
                  <TableCell className="text-xs">
                    {(p.required_audience ?? []).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{p.signed}</TableCell>
                  <TableCell>
                    {p.outstanding == null ? (
                      <span className="text-muted-foreground text-xs">n/a</span>
                    ) : p.outstanding === 0 ? (
                      <Badge variant="success">all signed</Badge>
                    ) : (
                      <Badge variant="warning">{p.outstanding} of {p.target}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.reviewOverdue ? (
                      <Badge variant="destructive">overdue</Badge>
                    ) : (
                      formatDate(p.review_date)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {isRestricted && (
        <>
          <h2 className="mb-2 font-medium">
            Youth with incomplete onboarding{" "}
            <span className="text-muted-foreground">({incompleteYouth.length})</span>
          </h2>
          {incompleteYouth.length === 0 ? (
            <p className="text-muted-foreground mb-8 text-sm">
              All active youth members have completed onboarding. 🎉
            </p>
          ) : (
            <ul className="mb-8 space-y-1 text-sm">
              {incompleteYouth.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Badge variant="warning">onboarding incomplete</Badge>
                  <Link
                    href={`/members/${m.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {m.full_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="text-muted-foreground mt-4 max-w-2xl text-xs">
        ⚠️ Before collecting real health or child-safety data in production, complete a
        legal/privacy review (Australian Privacy Act 1988 + Working With Children
        obligations) and enable MFA for all staff accounts in Supabase Auth.
      </p>
    </AppShell>
  );
}
