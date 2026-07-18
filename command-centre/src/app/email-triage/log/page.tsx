import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markEmailActioned } from "./actions";

export const dynamic = "force-dynamic";

const PRIORITY_COLOURS: Record<string, string> = {
  high:   "bg-red-100 text-red-800",
  medium: "bg-yellow-100 text-yellow-800",
  low:    "bg-green-100 text-green-700",
};
const CATEGORY_LABELS: Record<string, string> = {
  membership_enquiry:   "Membership",
  trial_class_request:  "Trial",
  cancellation_request: "Cancellation",
  billing_dispute:      "Billing",
  injury_complaint:     "Injury",
  general_enquiry:      "General",
  lead:                 "Lead",
  spam:                 "Spam",
  supplier:             "Supplier",
  compliment:           "Compliment",
  media_press:          "Media",
  other:                "Other",
};

export default async function EmailTriageLogPage() {
  const profile  = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("email_triage_log")
    .select("id, from_address, subject, received_at, category, priority, summary, suggested_reply, crm_action, escalate, tags, actioned_at")
    .order("received_at", { ascending: false })
    .limit(100);

  const pending   = logs?.filter((l) => !l.actioned_at).length ?? 0;
  const escalated = logs?.filter((l) => l.escalate && !l.actioned_at).length ?? 0;

  return (
    <AppShell profile={profile}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Email Triage Log</h1>
            <p className="text-sm text-muted-foreground">AI-classified inbound emails</p>
          </div>
          <a href="/email-triage" className="text-sm text-muted-foreground hover:underline">&#8592; Triage Tool</a>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="gap-2 py-4 border-l-4 border-l-border">
            <CardContent className="px-4">
              <div className="text-3xl font-bold tabular-nums">{logs?.length ?? 0}</div>
              <div className="mt-1 text-sm font-medium">Total logged</div>
              <div className="text-xs text-muted-foreground mt-0.5">all AI-classified emails</div>
            </CardContent>
          </Card>
          <Card className={`gap-2 py-4 border-l-4 ${pending > 0 ? "border-l-warning" : "border-l-border"}`}>
            <CardContent className="px-4">
              <div className="text-3xl font-bold tabular-nums">{pending}</div>
              <div className="mt-1 text-sm font-medium">Pending action</div>
              <div className="text-xs text-muted-foreground mt-0.5">awaiting staff response</div>
            </CardContent>
          </Card>
          <Card className={`gap-2 py-4 border-l-4 ${escalated > 0 ? "border-l-destructive" : "border-l-border"}`}>
            <CardContent className="px-4">
              <div className={`text-3xl font-bold tabular-nums ${escalated > 0 ? "text-destructive" : ""}`}>{escalated}</div>
              <div className="mt-1 text-sm font-medium">Needs escalation</div>
              <div className="text-xs text-muted-foreground mt-0.5">flagged by AI</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          {(logs ?? []).map((log) => (
            <Card key={log.id} className={log.escalate && !log.actioned_at ? "border-l-4 border-l-destructive" : ""}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLOURS[log.priority] ?? "bg-gray-100 text-gray-700"}`}>
                        {log.priority}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {CATEGORY_LABELS[log.category] ?? log.category}
                      </span>
                      {log.escalate && !log.actioned_at && (
                        <span className="rounded-full bg-red-600 text-white px-2 py-0.5 text-xs font-bold">ESCALATE</span>
                      )}
                      {log.actioned_at && (
                        <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs">Actioned</span>
                      )}
                    </div>
                    <div className="mt-1 font-medium text-sm">{log.subject ?? "(no subject)"}</div>
                    <div className="text-xs text-muted-foreground">
                      {log.from_address} &middot; {log.received_at ? new Date(log.received_at).toLocaleString("en-AU") : ""}
                    </div>
                  </div>
                </div>
                {log.summary && <p className="text-sm text-muted-foreground">{log.summary}</p>}
                {log.crm_action && <p className="text-xs font-medium text-primary">CRM: {log.crm_action}</p>}
                {log.suggested_reply && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                      View suggested reply
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs font-sans leading-relaxed">
                      {log.suggested_reply}
                    </pre>
                  </details>
                )}
                {!log.actioned_at && (
                  <form action={markEmailActioned}>
                    <input type="hidden" name="log_id" value={log.id} />
                    <button type="submit" className="rounded border bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
                      Mark Actioned
                    </button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))}
          {!logs?.length && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No emails logged yet. Connect Gmail to n8n to start.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
