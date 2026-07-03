import Link from "next/link";
import { requireProfile } from "@/lib/auth";
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
import { formatDateTime, sourceLabel } from "@/lib/format";

export const metadata = { title: "Members — BFC Command Centre" };

const STATUS_VARIANT: Record<string, "success" | "secondary" | "warning" | "outline"> = {
  active: "success",
  legacy: "warning",
  lead: "secondary",
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireProfile();
  const { q } = await searchParams;
  const supabase = await createClient();
  const query = (q ?? "").trim();

  let members: {
    id: string;
    full_name: string;
    primary_email: string | null;
    primary_phone: string | null;
    member_status: string;
    is_youth: boolean;
    updated_at: string;
  }[] = [];

  let unlinked: {
    id: string;
    source_system: string;
    source_record_id: string;
    display_name: string | null;
    email: string | null;
    match_status: string;
    last_synced_at: string;
  }[] = [];

  if (query) {
    const like = `%${query}%`;
    const [membersRes, unlinkedRes] = await Promise.all([
      supabase
        .from("members")
        .select("id, full_name, primary_email, primary_phone, member_status, is_youth, updated_at")
        .is("merged_into", null)
        .or(`full_name.ilike.${like},primary_email.ilike.${like},primary_phone.ilike.${like}`)
        .order("full_name")
        .limit(50),
      // Unlinked fragments matching the search — surfaces legacy records that
      // don't have a canonical member yet. RLS hides this from non-admin roles.
      supabase
        .from("member_source_records")
        .select("id, source_system, source_record_id, display_name, email, match_status, last_synced_at")
        .is("member_id", null)
        .or(`display_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .order("last_synced_at", { ascending: false })
        .limit(25),
    ]);
    members = membersRes.data ?? [];
    unlinked = unlinkedRes.data ?? [];
    await logAudit("member.search", "members", undefined, {
      query,
      results: members.length,
    });
  }

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Member Search</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Search once across canonical members and unlinked source records.
      </p>

      <form className="mb-8 flex max-w-xl gap-2" action="/members" method="get">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Name, email or phone…"
          autoFocus
        />
        <Button type="submit">Search</Button>
      </form>

      {query && (
        <>
          <h2 className="mb-2 font-medium">
            Members <span className="text-muted-foreground">({members.length})</span>
          </h2>
          {members.length === 0 ? (
            <p className="text-muted-foreground mb-8 text-sm">
              No canonical members match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="mb-8 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.full_name}
                        {m.is_youth && (
                          <Badge variant="outline" className="ml-2">
                            Youth
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{m.primary_email ?? "—"}</TableCell>
                      <TableCell>{m.primary_phone ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[m.member_status] ?? "outline"}>
                          {m.member_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/members/${m.id}`}
                          className="text-primary text-sm underline-offset-4 hover:underline"
                        >
                          Open profile
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {unlinked.length > 0 && (
            <>
              <h2 className="mb-2 font-medium">
                Unlinked source records{" "}
                <span className="text-muted-foreground">({unlinked.length})</span>
              </h2>
              <p className="text-muted-foreground mb-2 text-sm">
                Fragments from source systems with no canonical member yet — resolve
                them in the Match Queue.
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name in source</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Source ID</TableHead>
                      <TableHead>Last synced</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unlinked.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.display_name ?? "—"}</TableCell>
                        <TableCell>{r.email ?? "—"}</TableCell>
                        <TableCell>{sourceLabel(r.source_system)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.source_record_id}
                        </TableCell>
                        <TableCell>{formatDateTime(r.last_synced_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.match_status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
