import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, sourceLabel } from "@/lib/format";
import { updateLead } from "./actions";

export const metadata = { title: "Leads — BFC Command Centre" };

const STAGES = [
  { key: "new_enquiry", label: "New enquiry" },
  { key: "trial_booked", label: "Trial booked" },
  { key: "trial_attended", label: "Trial attended" },
  { key: "follow_up_required", label: "Follow-up required" },
  { key: "joined", label: "Joined" },
  { key: "did_not_convert", label: "Did not convert" },
] as const;

const STAGE_VARIANT: Record<string, "secondary" | "warning" | "success" | "outline" | "destructive"> = {
  new_enquiry: "secondary",
  trial_booked: "warning",
  trial_attended: "warning",
  follow_up_required: "destructive",
  joined: "success",
  did_not_convert: "outline",
};

export default async function LeadsPage() {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const [leadsRes, staffRes] = await Promise.all([
    supabase
      .from("leads")
      .select("*, assignee:profiles!leads_assigned_to_fkey(id, full_name)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
  ]);

  await logAudit("leads.view", "leads");

  const leads = leadsRes.data ?? [];
  const staff = staffRes.data ?? [];
  const open = leads.filter(
    (l) => !["joined", "did_not_convert"].includes(l.stage)
  );

  const counts = new Map<string, number>();
  for (const l of leads) counts.set(l.stage, (counts.get(l.stage) ?? 0) + 1);

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Leads & Trial Pipeline</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        New enquiry → trial booked → trial attended → follow-up → joined / did not convert.
      </p>

      <div className="mb-8 grid grid-cols-3 gap-4 md:grid-cols-6">
        {STAGES.map((s) => (
          <Card key={s.key} className="gap-1 py-3">
            <CardContent className="px-3">
              <div className="text-2xl font-semibold tabular-nums">
                {counts.get(s.key) ?? 0}
              </div>
              <div className="text-muted-foreground text-xs">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 font-medium">
        Open pipeline <span className="text-muted-foreground">({open.length})</span>
      </h2>
      {open.length === 0 ? (
        <p className="text-muted-foreground text-sm">No open leads.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Interested in</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Trial date</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Move to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-medium">{l.full_name ?? "—"}</div>
                    <div className="text-muted-foreground text-xs">
                      {l.email ?? l.phone ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>{l.interested_class ?? "—"}</TableCell>
                  <TableCell>{sourceLabel(l.source ?? l.source_system)}</TableCell>
                  <TableCell>{formatDate(l.trial_date)}</TableCell>
                  <TableCell>
                    <Badge variant={STAGE_VARIANT[l.stage] ?? "outline"}>
                      {STAGES.find((s) => s.key === l.stage)?.label ?? l.stage}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <form action={updateLead} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={l.id} />
                      <select
                        name="stage"
                        defaultValue={l.stage}
                        className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <select
                        name="assigned_to"
                        defaultValue={l.assigned_to ?? ""}
                        className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                      >
                        <option value="">unassigned</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name || s.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <Input
                        name="lost_reason"
                        placeholder="lost reason (if not converting)"
                        className="h-8 w-44 text-xs"
                      />
                      <Button size="sm" variant="outline" type="submit">
                        Save
                      </Button>
                    </form>
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
