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
import { formatDateTime } from "@/lib/format";
import { decideEmail } from "./actions";

export const metadata = { title: "Email Review — Bendigo Fight Centre" };

export default async function EmailReviewPage() {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const [pendingRes, recentRes] = await Promise.all([
    supabase
      .from("email_review_queue")
      .select("*")
      .eq("status", "pending")
      .order("received_at", { ascending: true })
      .limit(50),
    supabase
      .from("email_review_queue")
      .select("id, subject, status, suggested_action, suggested_label, applied_at, apply_error, decided_at")
      .neq("status", "pending")
      .order("decided_at", { ascending: false })
      .limit(15),
  ]);

  await logAudit("email_review.view", "email_review_queue");

  const pending = pendingRes.data ?? [];
  const recent = recentRes.data ?? [];

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Email Review</h1>
      <p className="text-muted-foreground mb-4 text-sm">
        Suggested classifications from the inbox scanner. Approving lets n8n apply the
        label or create a <em>draft</em> reply — nothing is ever sent automatically, and
        protected categories (complaints, legal, safeguarding, cancellations,
        chargebacks) can never be archived.
      </p>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className={`gap-2 py-4 border-l-4 ${pending.length > 0 ? "border-l-warning" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{pending.length}</div>
            <div className="mt-1 text-sm font-medium">Awaiting review</div>
            <div className="text-xs text-muted-foreground mt-0.5">AI suggestions to check</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-success">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{recent.filter(r => r.status === "approved").length}</div>
            <div className="mt-1 text-sm font-medium">Approved</div>
            <div className="text-xs text-muted-foreground mt-0.5">recent decisions</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{recent.length}</div>
            <div className="mt-1 text-sm font-medium">Recent decisions</div>
            <div className="text-xs text-muted-foreground mt-0.5">last 15 reviewed</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 font-medium">
        Awaiting review <span className="text-muted-foreground">({pending.length})</span>
      </h2>

      {pending.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">
          Nothing waiting. New suggestions appear here after each inbox scan.
        </p>
      ) : (
        <div className="mb-10 space-y-4">
          {pending.map((e) => (
            <Card key={e.id} className="gap-3 py-4">
              <CardHeader className="px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{e.subject ?? "(no subject)"}</CardTitle>
                  <div className="flex flex-wrap gap-1">
                    {e.protected && <Badge variant="destructive">protected</Badge>}
                    <Badge variant="secondary">{e.category ?? "uncategorised"}</Badge>
                    <Badge variant="outline">
                      {e.suggested_action}
                      {e.suggested_label ? ` → ${e.suggested_label}` : ""}
                    </Badge>
                    {e.confidence && <Badge variant="outline">{e.confidence}</Badge>}
                  </div>
                </div>
                <CardDescription>
                  {e.from_address ?? "unknown sender"} · {formatDateTime(e.received_at)}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                {e.ai_summary && <p className="mb-2 text-sm">{e.ai_summary}</p>}
                {e.snippet && (
                  <p className="text-muted-foreground mb-3 text-xs italic">
                    &ldquo;{e.snippet}&rdquo;
                  </p>
                )}
                {e.ai_draft_reply && (
                  <div className="bg-muted mb-3 rounded-md p-3 text-sm">
                    <div className="text-muted-foreground mb-1 text-xs font-medium">
                      Suggested draft reply (approval creates a Gmail draft only):
                    </div>
                    {e.ai_draft_reply}
                  </div>
                )}
                <div className="flex gap-2">
                  {!(e.protected && e.suggested_action === "archive") && (
                    <form action={decideEmail}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <Button size="sm" type="submit">
                        Approve
                      </Button>
                    </form>
                  )}
                  <form action={decideEmail}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <Button size="sm" variant="outline" type="submit">
                      Reject
                    </Button>
                  </form>
                  <form action={decideEmail}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="decision" value="skipped" />
                    <Button size="sm" variant="ghost" type="submit">
                      Skip
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-2 font-medium">Recent decisions</h2>
      {recent.length === 0 ? (
        <p className="text-muted-foreground text-sm">No decisions yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {recent.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  e.status === "approved"
                    ? "success"
                    : e.status === "rejected"
                      ? "destructive"
                      : "outline"
                }
              >
                {e.status}
              </Badge>
              <span className="max-w-md truncate">{e.subject ?? "(no subject)"}</span>
              <span className="text-muted-foreground text-xs">
                {e.suggested_action}
                {e.applied_at
                  ? ` · applied ${formatDateTime(e.applied_at)}`
                  : e.status === "approved"
                    ? " · awaiting n8n"
                    : ""}
                {e.apply_error ? ` · error: ${e.apply_error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
