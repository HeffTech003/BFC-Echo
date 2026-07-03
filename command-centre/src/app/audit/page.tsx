import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit Log — BFC Command Centre" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireRole(["owner_director"]);
  const { q } = await searchParams;
  const supabase = await createClient();
  const query = (q ?? "").trim();

  let builder = supabase
    .from("audit_logs")
    .select("*, actor:profiles!audit_logs_actor_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (query) builder = builder.or(`action.ilike.%${query}%,resource_type.ilike.%${query}%`);

  const { data } = await builder;
  const logs = data ?? [];

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Audit Log</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Every sensitive view, write and export. Owner/Director only; entries are
        immutable (no update or delete path exists).
      </p>

      <form className="mb-6 flex max-w-md gap-2" action="/audit" method="get">
        <Input name="q" defaultValue={query} placeholder="Filter by action or resource…" />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No audit entries.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => {
                const actor = Array.isArray(l.actor) ? l.actor[0] : l.actor;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateTime(l.created_at)}
                    </TableCell>
                    <TableCell>{actor?.full_name ?? (l.actor_role === "public_form" ? "public form" : "—")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.actor_role ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.action}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.resource_type}
                      {l.resource_id ? ` · ${String(l.resource_id).slice(0, 8)}…` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
                      {JSON.stringify(l.details)}
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
