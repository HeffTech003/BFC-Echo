import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCampaign, sendCampaign, deleteCampaign } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COLOURS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700",
  queued:    "bg-blue-100 text-blue-700",
  sending:   "bg-yellow-100 text-yellow-700",
  sent:      "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const SEGMENT_LABELS: Record<string, string> = {
  all_active:    "All Active Members",
  lapsed:        "Lapsed / Cancelled",
  trial:         "Trial Members",
  no_booking_7d: "No Booking (7 days)",
  tag:           "Custom Tag",
  custom:        "Custom List",
};

export default async function CampaignsPage() {
  const profile  = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, subject, channels, segment, segment_tag, status, recipient_count, sent_count, sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const totalSent   = campaigns?.filter((c) => c.status === "sent").length ?? 0;
  const totalDraft  = campaigns?.filter((c) => c.status === "draft").length ?? 0;
  const totalReach  = campaigns?.filter((c) => c.status === "sent").reduce((s, c) => s + (c.sent_count ?? 0), 0) ?? 0;

  return (
    <AppShell profile={profile}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Campaign Builder</h1>
          <p className="text-sm text-muted-foreground">Bulk email &amp; SMS to member segments</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Sent Campaigns</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalSent}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Drafts</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalDraft}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Total Recipients Reached</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalReach}</p></CardContent></Card>
        </div>

        {/* Create campaign */}
        <Card>
          <CardHeader><CardTitle>New Campaign</CardTitle></CardHeader>
          <CardContent>
            <form action={createCampaign} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Campaign Name *</label>
                  <input name="name" required className="mt-1 w-full rounded border px-3 py-1.5 text-sm" placeholder="e.g. July Re-engagement" />
                </div>
                <div>
                  <label className="text-sm font-medium">Segment *</label>
                  <select name="segment" required className="mt-1 w-full rounded border px-3 py-1.5 text-sm bg-background">
                    {Object.entries(SEGMENT_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Subject (email)</label>
                  <input name="subject" className="mt-1 w-full rounded border px-3 py-1.5 text-sm" placeholder="Email subject line" />
                </div>
                <div>
                  <label className="text-sm font-medium">Tag (if segment = Custom Tag)</label>
                  <input name="segment_tag" className="mt-1 w-full rounded border px-3 py-1.5 text-sm" placeholder="e.g. bjj, boxing" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Email Body</label>
                  <textarea name="body_email" rows={5} className="mt-1 w-full rounded border px-3 py-1.5 text-sm font-mono"
                    placeholder={"Hi {{name}},\n\nBody of your email...\n\nCheers,\nKaleb @ BFC"} />
                  <p className="mt-1 text-xs text-muted-foreground">Use {`{{name}}`} for first name merge tag</p>
                </div>
                <div>
                  <label className="text-sm font-medium">SMS Body</label>
                  <textarea name="body_sms" rows={5} className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
                    placeholder="Hi {{name}}, this is BFC — quick message for you..." />
                  <p className="mt-1 text-xs text-muted-foreground">Keep under 160 chars for single SMS</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Channels:</span>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="channel_email" defaultChecked /> Email
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="channel_sms" /> SMS
                </label>
              </div>

              <div className="text-right">
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  Save Draft
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Campaign list */}
        <Card>
          <CardHeader><CardTitle>Campaigns ({campaigns?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="space-y-3 p-4">
            {(campaigns ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    {c.subject && <div className="text-sm text-muted-foreground">Subject: {c.subject}</div>}
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{SEGMENT_LABELS[c.segment] ?? c.segment}</span>
                      {c.segment_tag && <span>· tag: {c.segment_tag}</span>}
                      <span>· {(c.channels as string[]).join(", ")}</span>
                      <span>· {c.recipient_count ?? 0} recipients</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[c.status] ?? "bg-gray-100"}`}>
                      {c.status}
                    </span>
                    {c.status === "sent" && (
                      <div className="text-xs text-muted-foreground">
                        {c.sent_count} sent · {c.sent_at ? new Date(c.sent_at).toLocaleDateString("en-AU") : ""}
                      </div>
                    )}
                  </div>
                </div>
                {c.status === "draft" && (
                  <div className="flex gap-2">
                    <form action={sendCampaign}>
                      <input type="hidden" name="campaign_id" value={c.id} />
                      <button type="submit" className="rounded border bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
                        Send Now
                      </button>
                    </form>
                    <form action={deleteCampaign}>
                      <input type="hidden" name="campaign_id" value={c.id} />
                      <button type="submit" className="rounded border bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
                        Delete
                      </button>
                    </form>
                  </div>
                )}
                {c.status === "queued" && (
                  <p className="text-xs text-blue-600">
                    ⏳ Queued — set N8N_CAMPAIGN_WEBHOOK_URL in .env.local to send via n8n
                  </p>
                )}
              </div>
            ))}
            {!campaigns?.length && (
              <p className="py-8 text-center text-muted-foreground">No campaigns yet. Create one above.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
