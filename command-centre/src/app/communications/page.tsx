import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { CommunicationsForm } from "./communications-form";

export const metadata = { title: "Communications — Bendigo Fight Centre" };

const CHANNEL_VARIANT: Record<string, "secondary" | "outline"> = {
  email: "secondary",
  sms: "outline",
};

export default async function CommunicationsPage() {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const { data: logData } = await supabase
    .from("communications_log")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(50);

  await logAudit("communications.view", "communications_log");

  const log = logData ?? [];
  const sentToday = log.filter((l) => {
    const d = l.sent_at ? new Date(l.sent_at) : null;
    if (!d) return false;
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;
  const emailSent = log.filter((l) => l.channel === "email").length;
  const smsSent   = log.filter((l) => l.channel === "sms").length;

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Communications</h1>
      <p className="text-muted-foreground mb-4 text-sm">
        Manual email and SMS via SendGrid / Twilio. For bulk outreach use{" "}
        <a href="/campaigns" className="text-primary hover:underline">Campaigns</a>.
      </p>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{sentToday}</div>
            <div className="mt-1 text-sm font-medium">Sent today</div>
            <div className="text-xs text-muted-foreground mt-0.5">all channels</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{log.length}</div>
            <div className="mt-1 text-sm font-medium">Recent sends</div>
            <div className="text-xs text-muted-foreground mt-0.5">last 50 messages</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{emailSent}</div>
            <div className="mt-1 text-sm font-medium">Emails</div>
            <div className="text-xs text-muted-foreground mt-0.5">via SendGrid</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{smsSent}</div>
            <div className="mt-1 text-sm font-medium">SMS</div>
            <div className="text-xs text-muted-foreground mt-0.5">via Twilio</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        {/* Compose form — client component */}
        <div>
          <h2 className="mb-3 font-medium">Compose</h2>
          <CommunicationsForm />
          <p className="mt-3 text-xs text-muted-foreground">
            Delivered via SendGrid (email) and Twilio (SMS) through n8n WF21.
          </p>
        </div>

        {/* Send log */}
        <div>
          <h2 className="mb-3 font-medium">Recent sends</h2>
          {log.length === 0 ? (
            <p className="text-muted-foreground text-sm">No messages sent yet.</p>
          ) : (
            <div className="rounded-md border divide-y">
              {log.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {entry.to_email ?? entry.to_phone ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.template} · {formatDateTime(entry.sent_at)}
                    </div>
                  </div>
                  <Badge variant={CHANNEL_VARIANT[entry.channel] ?? "outline"} className="shrink-0 text-xs">
                    {entry.channel}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
