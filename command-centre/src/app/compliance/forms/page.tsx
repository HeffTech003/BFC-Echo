import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { formatDate, formatDateTime, isoDaysAgo } from "@/lib/format";
import { createFormLink, expireFormLink } from "./actions";

export const metadata = { title: "Medical Forms — Bendigo Fight Centre" };

export default async function FormsPage() {
  const profile = await requireRole(["owner_director", "child_safety_lead"]);
  const supabase = await createClient();

  const [formsRes, linksRes] = await Promise.all([
    supabase
      .from("medical_forms")
      .select("*, member:members(id, full_name, is_youth)")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("form_links")
      .select("*, member:members(id, full_name)")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Restricted area: log the access itself.
  await logAudit("medical_forms.list_view", "medical_forms");

  const forms = formsRes.data ?? [];
  const nowIso = isoDaysAgo(0);
  const soonIso = isoDaysAgo(-60);
  const links = (linksRes.data ?? []).filter((l) => l.expires_at > nowIso);
  const expiringSoon = forms.filter((f) => f.expires_at && f.expires_at > nowIso && f.expires_at < soonIso).length;
  const youthForms = forms.filter((f) => {
    const m = Array.isArray(f.member) ? f.member[0] : f.member;
    return m?.is_youth;
  }).length;

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Medical & Emergency Forms</h1>
      <p className="text-muted-foreground mb-4 text-sm">
        Restricted to Owner/Director and Child Safety Lead. Forms are completed by the
        member or guardian through secure expiring links — staff never type in health
        data on someone&apos;s behalf.
      </p>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{forms.length}</div>
            <div className="mt-1 text-sm font-medium">Forms on file</div>
            <div className="text-xs text-muted-foreground mt-0.5">submitted total</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{youthForms}</div>
            <div className="mt-1 text-sm font-medium">Youth forms</div>
            <div className="text-xs text-muted-foreground mt-0.5">under-18 members</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${expiringSoon > 0 ? "border-l-warning" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{expiringSoon}</div>
            <div className="mt-1 text-sm font-medium">Expiring soon</div>
            <div className="text-xs text-muted-foreground mt-0.5">within 60 days</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${links.length > 0 ? "border-l-warning" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{links.length}</div>
            <div className="mt-1 text-sm font-medium">Pending links</div>
            <div className="text-xs text-muted-foreground mt-0.5">sent, not yet completed</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Send a form link</CardTitle>
          <CardDescription>
            Generates a single-use link to share with the member/guardian (SMS or email).
            Youth onboarding includes the child-safety policy acknowledgements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createFormLink} className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="member_email">Member email</Label>
              <Input id="member_email" name="member_email" type="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="form_type">Form</Label>
              <select
                id="form_type"
                name="form_type"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="medical_participation">Medical / participation</option>
                <option value="youth_onboarding">Youth onboarding (guardian)</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiry_days">Expires in (days)</Label>
              <Input id="expiry_days" name="expiry_days" type="number" defaultValue={14} min={1} max={60} />
            </div>
            <div className="flex items-end">
              <Button type="submit">Create link</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <h2 className="mb-2 font-medium">
        Active links <span className="text-muted-foreground">({links.length})</span>
      </h2>
      {links.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">No active links.</p>
      ) : (
        <div className="mb-8 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Link (share securely)</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((l) => {
                const member = Array.isArray(l.member) ? l.member[0] : l.member;
                return (
                  <TableRow key={l.id}>
                    <TableCell>{member?.full_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.form_type.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs">
                      /forms/{l.token}
                    </TableCell>
                    <TableCell>{formatDateTime(l.expires_at)}</TableCell>
                    <TableCell>
                      <form action={expireFormLink}>
                        <input type="hidden" name="id" value={l.id} />
                        <Button size="sm" variant="outline" type="submit">
                          Revoke
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-2 font-medium">
        Submitted forms <span className="text-muted-foreground">({forms.length})</span>
      </h2>
      {forms.length === 0 ? (
        <p className="text-muted-foreground text-sm">No forms yet.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Guardian consent</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((f) => {
                const member = Array.isArray(f.member) ? f.member[0] : f.member;
                const expiringSoon = f.expires_at && f.expires_at < soonIso;
                return (
                  <TableRow key={f.id}>
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
                      {member?.is_youth && (
                        <Badge variant="outline" className="ml-2">
                          Youth
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{f.form_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant={f.status === "submitted" ? "success" : "outline"}>
                        {f.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{f.guardian_consent ? "Yes" : "—"}</TableCell>
                    <TableCell>{formatDate(f.submitted_at)}</TableCell>
                    <TableCell className={expiringSoon ? "text-destructive font-medium" : ""}>
                      {formatDate(f.expires_at)}
                      {expiringSoon && " (renew)"}
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
