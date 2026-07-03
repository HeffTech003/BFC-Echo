import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import { updateCancellation } from "./actions";

export const metadata = { title: "Cancellations — BFC Command Centre" };

const STATUS_VARIANT: Record<string, "secondary" | "warning" | "success" | "outline"> = {
  new: "warning",
  in_progress: "secondary",
  processed: "outline",
  retained: "success",
  withdrawn: "outline",
};

export default async function CancellationsPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();
  const canEdit = ["owner_director", "operations_admin"].includes(profile.role);

  const { data } = await supabase
    .from("cancellation_requests")
    .select("*, member:members(id, full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  await logAudit("cancellations.view", "cancellation_requests");

  const requests = data ?? [];
  const open = requests.filter((r) => ["new", "in_progress"].includes(r.status));
  const closed = requests.filter((r) => !["new", "in_progress"].includes(r.status));

  const renderRow = (r: (typeof requests)[number]) => {
    const member = Array.isArray(r.member) ? r.member[0] : r.member;
    return (
      <TableRow key={r.id}>
        <TableCell>
          <div className="font-medium">
            {member ? (
              <Link
                href={`/members/${member.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {member.full_name}
              </Link>
            ) : (
              (r.full_name ?? "—")
            )}
          </div>
          <div className="text-muted-foreground text-xs">{r.email ?? r.phone ?? ""}</div>
        </TableCell>
        <TableCell>
          <Badge variant="outline">{r.request_type}</Badge>
        </TableCell>
        <TableCell>{r.membership_type ?? "—"}</TableCell>
        <TableCell className="max-w-xs truncate">{r.reason ?? "—"}</TableCell>
        <TableCell>{formatDate(r.preferred_last_date)}</TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>
          <div className="text-muted-foreground mt-0.5 text-xs">
            {r.intake_source ?? ""} · {formatDateTime(r.created_at)}
          </div>
        </TableCell>
        {canEdit && (
          <TableCell>
            {["new", "in_progress"].includes(r.status) ? (
              <form action={updateCancellation} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <select
                  name="status"
                  defaultValue={r.status}
                  className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                >
                  <option value="new">New</option>
                  <option value="in_progress">In progress</option>
                  <option value="processed">Processed (done in source system)</option>
                  <option value="retained">Retained (member stayed)</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
                <Input name="outcome_notes" placeholder="outcome notes" className="h-8 w-40 text-xs" />
                <Button size="sm" variant="outline" type="submit">
                  Save
                </Button>
              </form>
            ) : (
              <span className="text-muted-foreground text-xs">{r.outcome_notes ?? ""}</span>
            )}
          </TableCell>
        )}
      </TableRow>
    );
  };

  const header = (
    <TableHeader>
      <TableRow>
        <TableHead>Member</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Membership</TableHead>
        <TableHead>Reason</TableHead>
        <TableHead>Last date</TableHead>
        <TableHead>Status</TableHead>
        {canEdit && <TableHead>Update</TableHead>}
      </TableRow>
    </TableHeader>
  );

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Cancellations & Pauses</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Intake from the chatbot, web form, email and staff. Recording an outcome here is
        bookkeeping — the actual change is made by a human in the source system.
      </p>

      <h2 className="mb-2 font-medium">
        Open <span className="text-muted-foreground">({open.length})</span>
      </h2>
      {open.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">No open requests.</p>
      ) : (
        <div className="mb-8 rounded-md border">
          <Table>
            {header}
            <TableBody>{open.map(renderRow)}</TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-2 font-medium">
        Closed <span className="text-muted-foreground">({closed.length})</span>
      </h2>
      {closed.length === 0 ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            {header}
            <TableBody>{closed.slice(0, 30).map(renderRow)}</TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
