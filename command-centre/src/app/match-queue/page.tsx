import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, sourceLabel } from "@/lib/format";
import {
  approveMatch,
  createMemberFromSource,
  rejectMatch,
  runMatcher,
} from "./actions";

export const metadata = { title: "Match Queue — Bendigo Fight Centre" };

export default async function MatchQueuePage() {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const [suggestedRes, unmatchedRes] = await Promise.all([
    supabase
      .from("member_source_records")
      .select(
        "id, source_system, source_record_id, display_name, email, phone, match_confidence, last_synced_at, suggested_member_id, suggested:members!member_source_records_suggested_member_id_fkey(id, full_name, primary_email)"
      )
      .eq("match_status", "suggested")
      .order("match_confidence", { ascending: false })
      .limit(100),
    supabase
      .from("member_source_records")
      .select("id, source_system, source_record_id, display_name, email, phone, last_synced_at")
      .eq("match_status", "unmatched")
      .order("last_synced_at", { ascending: false })
      .limit(100),
  ]);

  await logAudit("match_queue.view", "member_source_records");

  const suggested = suggestedRes.data ?? [];
  const unmatched = unmatchedRes.data ?? [];
  const highConfidence = suggested.filter((r) => (r.match_confidence ?? 0) >= 0.9).length;
  const lowConfidence  = suggested.filter((r) => (r.match_confidence ?? 0) < 0.8).length;

  return (
    <AppShell profile={profile}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Duplicate / Legacy Match Queue</h1>
          <p className="text-muted-foreground text-sm">
            Rule-based suggestions (email 0.95 · phone 0.85 · name 0.60). Nothing is
            merged without your approval.
          </p>
        </div>
        <form action={runMatcher}>
          <Button type="submit">Run matcher</Button>
        </form>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className={`gap-2 py-4 border-l-4 ${suggested.length > 0 ? "border-l-warning" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{suggested.length}</div>
            <div className="mt-1 text-sm font-medium">Awaiting review</div>
            <div className="text-xs text-muted-foreground mt-0.5">suggested matches</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${unmatched.length > 0 ? "border-l-destructive" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className={`text-3xl font-bold tabular-nums ${unmatched.length > 0 ? "text-destructive" : ""}`}>{unmatched.length}</div>
            <div className="mt-1 text-sm font-medium">Unmatched records</div>
            <div className="text-xs text-muted-foreground mt-0.5">no candidate found</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-success">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{highConfidence}</div>
            <div className="mt-1 text-sm font-medium">High confidence</div>
            <div className="text-xs text-muted-foreground mt-0.5">≥90% match score</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${lowConfidence > 0 ? "border-l-warning" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{lowConfidence}</div>
            <div className="mt-1 text-sm font-medium">Low confidence</div>
            <div className="text-xs text-muted-foreground mt-0.5">&lt;80% — review carefully</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-2 font-medium">
        Suggested matches <span className="text-muted-foreground">({suggested.length})</span>
      </h2>
      {suggested.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">
          Nothing awaiting review. Run the matcher after a sync to generate suggestions.
        </p>
      ) : (
        <div className="mb-8 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source record</TableHead>
                <TableHead>System</TableHead>
                <TableHead>Suggested member</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Last synced</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggested.map((r) => {
                const m = Array.isArray(r.suggested) ? r.suggested[0] : r.suggested;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.display_name ?? "—"}</div>
                      <div className="text-muted-foreground text-xs">
                        {r.email ?? r.phone ?? ""} ·{" "}
                        <span className="font-mono">{r.source_record_id}</span>
                      </div>
                    </TableCell>
                    <TableCell>{sourceLabel(r.source_system)}</TableCell>
                    <TableCell>
                      {m ? (
                        <Link
                          href={`/members/${m.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {m.full_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <div className="text-muted-foreground text-xs">
                        {m?.primary_email ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          (r.match_confidence ?? 0) >= 0.9
                            ? "success"
                            : (r.match_confidence ?? 0) >= 0.8
                              ? "warning"
                              : "outline"
                        }
                      >
                        {r.match_confidence != null
                          ? `${Math.round(Number(r.match_confidence) * 100)}%`
                          : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDateTime(r.last_synced_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <form action={approveMatch}>
                          <input type="hidden" name="source_record_id" value={r.id} />
                          <input
                            type="hidden"
                            name="member_id"
                            value={r.suggested_member_id ?? ""}
                          />
                          <Button size="sm" type="submit">
                            Approve
                          </Button>
                        </form>
                        <form action={rejectMatch}>
                          <input type="hidden" name="source_record_id" value={r.id} />
                          <Button size="sm" variant="outline" type="submit">
                            Reject
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-2 font-medium">
        Unmatched records <span className="text-muted-foreground">({unmatched.length})</span>
      </h2>
      <p className="text-muted-foreground mb-2 text-sm">
        No candidate found. Create a new canonical member, or wait for more data.
      </p>
      {unmatched.length === 0 ? (
        <p className="text-muted-foreground text-sm">Queue is clear.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source record</TableHead>
                <TableHead>System</TableHead>
                <TableHead>Source ID</TableHead>
                <TableHead>Last synced</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unmatched.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.display_name ?? "—"}</div>
                    <div className="text-muted-foreground text-xs">
                      {r.email ?? r.phone ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>{sourceLabel(r.source_system)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.source_record_id}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(r.last_synced_at)}</TableCell>
                  <TableCell className="text-right">
                    <form action={createMemberFromSource}>
                      <input type="hidden" name="source_record_id" value={r.id} />
                      <Button size="sm" variant="secondary" type="submit">
                        Create member
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
