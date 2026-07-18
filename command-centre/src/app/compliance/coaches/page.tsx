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
import { upsertCertification } from "../cert-actions";
import { isoToday, isoDaysAgo, formatDate } from "@/lib/format";

export const metadata = { title: "Coach Certifications — Bendigo Fight Centre" };

const CERT_TYPES = ["wwcc", "first_aid", "police_check"] as const;
type CertType = (typeof CERT_TYPES)[number];

const CERT_LABELS: Record<CertType, string> = {
  wwcc:         "WWCC",
  first_aid:    "First Aid",
  police_check: "Police Check",
};

const STATUSES = ["pending", "current", "expired", "not_required"] as const;

export default async function CoachesCertPage() {
  const profile = await requireRole([
    "owner_director",
    "operations_admin",
    "child_safety_lead",
  ]);
  const supabase = await createClient();
  const today = isoToday();
  const soon60 = isoDaysAgo(-60); // 60 days from now

  const [staffRes, certsRes] = await Promise.all([
    supabase
      .from("members")
      .select("id, full_name")
      .eq("member_type", "staff")
      .eq("member_status", "active")
      .is("merged_into", null)
      .order("full_name"),
    supabase
      .from("coach_certifications")
      .select("id, member_id, cert_type, cert_number, issued_at, expires_at, status, notes"),
  ]);

  const coaches = staffRes.data ?? [];
  const allCerts = certsRes.data ?? [];

  // cert_type → cert record map per member
  const certMap = new Map<string, Map<CertType, (typeof allCerts)[number]>>();
  for (const c of allCerts) {
    if (!CERT_TYPES.includes(c.cert_type as CertType)) continue;
    if (!certMap.has(c.member_id)) certMap.set(c.member_id, new Map());
    certMap.get(c.member_id)!.set(c.cert_type as CertType, c);
  }

  // Classify each coach's overall status
  function certStatus(cert: (typeof allCerts)[number] | undefined): "ok" | "expiring" | "expired" | "missing" {
    if (!cert || cert.status === "pending") return "missing";
    if (cert.status === "not_required") return "ok";
    if (cert.status === "expired" || (cert.expires_at && cert.expires_at < today)) return "expired";
    if (cert.expires_at && cert.expires_at < soon60) return "expiring";
    if (cert.status === "current") return "ok";
    return "missing";
  }

  function coachOverall(memberId: string): "ok" | "expiring" | "expired" | "missing" {
    const statuses = CERT_TYPES.map((t) => certStatus(certMap.get(memberId)?.get(t)));
    if (statuses.includes("expired"))  return "expired";
    if (statuses.includes("missing"))  return "missing";
    if (statuses.includes("expiring")) return "expiring";
    return "ok";
  }

  // Summary counts
  const summary = { ok: 0, expiring: 0, expired: 0, missing: 0 };
  for (const c of coaches) summary[coachOverall(c.id)]++;

  function statusBadge(s: "ok" | "expiring" | "expired" | "missing") {
    if (s === "ok")       return <Badge variant="success" className="text-xs">compliant</Badge>;
    if (s === "expiring") return <Badge variant="warning" className="text-xs">expiring soon</Badge>;
    if (s === "expired")  return <Badge variant="destructive" className="text-xs">expired</Badge>;
    return                       <Badge variant="outline" className="text-xs">missing</Badge>;
  }

  function certCell(cert: (typeof allCerts)[number] | undefined) {
    const s = certStatus(cert);
    if (s === "ok") {
      return (
        <div>
          <Badge variant="success" className="text-xs">current</Badge>
          {cert?.expires_at && (
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(cert.expires_at)}</p>
          )}
          {cert?.cert_number && (
            <p className="font-mono text-xs text-muted-foreground">{cert.cert_number}</p>
          )}
        </div>
      );
    }
    if (s === "expiring") {
      return (
        <div>
          <Badge variant="warning" className="text-xs">expiring</Badge>
          {cert?.expires_at && (
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(cert.expires_at)}</p>
          )}
        </div>
      );
    }
    if (s === "expired") {
      return (
        <div>
          <Badge variant="destructive" className="text-xs">expired</Badge>
          {cert?.expires_at && (
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(cert.expires_at)}</p>
          )}
        </div>
      );
    }
    return <Badge variant="outline" className="text-xs">missing</Badge>;
  }

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex items-baseline gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Coach Certifications</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            WWCC · First Aid · Police Check — red/amber/green per coach
          </p>
        </div>
        <a href="/compliance" className="ml-auto text-sm text-primary hover:underline">
          ← Back to Compliance
        </a>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-success">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{summary.ok}</div>
            <div className="mt-1 text-sm font-medium">Fully compliant</div>
            <div className="text-xs text-muted-foreground mt-0.5">all certs current</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-warning">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{summary.expiring}</div>
            <div className="mt-1 text-sm font-medium">Expiring soon</div>
            <div className="text-xs text-muted-foreground mt-0.5">within 60 days</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${summary.expired > 0 ? "border-l-destructive" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{summary.expired}</div>
            <div className="mt-1 text-sm font-medium">Expired</div>
            <div className="text-xs text-muted-foreground mt-0.5">needs renewal</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${summary.missing > 0 ? "border-l-warning" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{summary.missing}</div>
            <div className="mt-1 text-sm font-medium">Records missing</div>
            <div className="text-xs text-muted-foreground mt-0.5">not yet uploaded</div>
          </CardContent>
        </Card>
      </div>

      {/* Cert matrix */}
      {coaches.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No active staff members found. Members must have{" "}
          <code className="text-xs bg-muted px-1 rounded">member_type = &apos;staff&apos;</code> to appear here.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certification matrix</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coach</TableHead>
                  <TableHead>Overall</TableHead>
                  {CERT_TYPES.map((t) => (
                    <TableHead key={t}>{CERT_LABELS[t]}</TableHead>
                  ))}
                  <TableHead>Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coaches.map((coach) => (
                  <TableRow key={coach.id}>
                    <TableCell className="font-medium">
                      <a
                        href={`/members/${coach.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {coach.full_name}
                      </a>
                    </TableCell>
                    <TableCell>{statusBadge(coachOverall(coach.id))}</TableCell>
                    {CERT_TYPES.map((t) => (
                      <TableCell key={t}>{certCell(certMap.get(coach.id)?.get(t))}</TableCell>
                    ))}
                    <TableCell>
                      <details className="relative">
                        <summary className="cursor-pointer text-xs text-primary hover:underline list-none">
                          edit
                        </summary>
                        <div className="absolute left-0 z-10 mt-1 w-72 rounded-lg border bg-card shadow-lg p-4">
                          <form action={upsertCertification} className="flex flex-col gap-2">
                            <input type="hidden" name="member_id" value={coach.id} />
                            <select name="cert_type" className="h-8 rounded border border-input bg-background px-2 text-sm">
                              {CERT_TYPES.map((t) => (
                                <option key={t} value={t}>{CERT_LABELS[t]}</option>
                              ))}
                            </select>
                            <select name="status" className="h-8 rounded border border-input bg-background px-2 text-sm">
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <input
                              name="cert_number"
                              placeholder="Certificate number"
                              className="h-8 rounded border border-input bg-background px-3 text-sm"
                            />
                            <input
                              name="issued_at"
                              type="date"
                              className="h-8 rounded border border-input bg-background px-3 text-sm"
                            />
                            <input
                              name="expires_at"
                              type="date"
                              className="h-8 rounded border border-input bg-background px-3 text-sm"
                            />
                            <textarea
                              name="notes"
                              placeholder="Notes (optional)"
                              rows={2}
                              className="rounded border border-input bg-background px-3 py-1.5 text-sm"
                            />
                            <button
                              type="submit"
                              className="h-8 rounded bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                            >
                              Save
                            </button>
                          </form>
                        </div>
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Records requiring action: {summary.expired + summary.missing} coaches with expired or missing certifications.
        Expiring within 60 days: {summary.expiring}.
      </p>
    </AppShell>
  );
}
