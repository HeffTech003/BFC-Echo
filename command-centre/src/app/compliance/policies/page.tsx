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
import { formatDate } from "@/lib/format";
import { createPolicyVersion, recordAcknowledgement } from "./actions";

export const metadata = { title: "Policies — BFC Command Centre" };

export default async function PoliciesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = ["owner_director", "operations_admin"].includes(profile.role);
  const canAck = ["owner_director", "operations_admin", "child_safety_lead"].includes(
    profile.role
  );

  const [versionsRes, ackCountsRes] = await Promise.all([
    supabase
      .from("policy_versions")
      .select("*")
      .order("policy_name")
      .order("created_at", { ascending: false }),
    supabase.from("policy_acknowledgements").select("policy_version_id"),
  ]);

  const versions = versionsRes.data ?? [];
  const ackCounts = new Map<string, number>();
  for (const a of ackCountsRes.data ?? []) {
    ackCounts.set(a.policy_version_id, (ackCounts.get(a.policy_version_id) ?? 0) + 1);
  }
  const current = versions.filter((v) => v.is_current);

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Policy Library</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Versioned policies with signed acknowledgements. Only the current version of
        each policy is offered for signing.
      </p>

      {canManage && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">New policy version</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createPolicyVersion} className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="policy_name">Policy name</Label>
                <Input
                  id="policy_name"
                  name="policy_name"
                  required
                  placeholder="e.g. Child Safety Policy"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="version">Version</Label>
                <Input id="version" name="version" required placeholder="e.g. 1.0" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="document_url">Document URL (optional)</Label>
                <Input id="document_url" name="document_url" type="url" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="effective_date">Effective date</Label>
                <Input id="effective_date" name="effective_date" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="review_date">Review date</Label>
                <Input id="review_date" name="review_date" type="date" />
              </div>
              <div className="grid gap-2">
                <Label>Required audience</Label>
                <div className="flex flex-wrap gap-3 text-sm">
                  {["members", "youth_guardians", "staff", "coaches"].map((a) => (
                    <label key={a} className="flex items-center gap-1">
                      <input type="checkbox" name={`audience_${a}`} />
                      {a.replace("_", " ")}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-4 md:col-span-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_current" defaultChecked />
                  Make this the current version (retires the previous one)
                </label>
                <Button type="submit">Create version</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Policy</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Review due</TableHead>
              <TableHead>Acks</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">
                  {v.document_url ? (
                    <a
                      href={v.document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {v.policy_name}
                    </a>
                  ) : (
                    v.policy_name
                  )}
                </TableCell>
                <TableCell>{v.version}</TableCell>
                <TableCell className="text-xs">
                  {(v.required_audience ?? []).join(", ") || "—"}
                </TableCell>
                <TableCell>{formatDate(v.effective_date)}</TableCell>
                <TableCell>{formatDate(v.review_date)}</TableCell>
                <TableCell className="tabular-nums">{ackCounts.get(v.id) ?? 0}</TableCell>
                <TableCell>
                  {v.is_current ? (
                    <Badge variant="success">current</Badge>
                  ) : (
                    <Badge variant="outline">superseded</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canAck && current.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record an acknowledgement (manual)</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={recordAcknowledgement} className="grid gap-4 md:grid-cols-4">
              <div className="grid gap-2">
                <Label htmlFor="policy_version_id">Policy (current versions)</Label>
                <select
                  id="policy_version_id"
                  name="policy_version_id"
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
                >
                  {current.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.policy_name} v{v.version}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="member_email">Member email (to link)</Label>
                <Input id="member_email" name="member_email" type="email" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="signed_name">Signed by (full name)</Label>
                <Input id="signed_name" name="signed_name" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="guardian_name">Guardian name (youth)</Label>
                <Input id="guardian_name" name="guardian_name" />
              </div>
              <div className="md:col-span-4">
                <Button type="submit">Record acknowledgement</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
