import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Workflow = {
  id: string;
  name: string;
  trigger: string;
  webhookPath: string;
  envVar: string;
  description: string;
  autoActions: string[];
};

const WORKFLOWS: Workflow[] = [
  {
    id: "email-triage",
    name: "WF-Email-Triage",
    trigger: "Gmail — new email in inbox",
    webhookPath: "/api/inbound-email",
    envVar: "N8N_WEBHOOK_SECRET",
    description: "AI classifies inbound emails, saves to email_triage_log, auto-creates CRM leads for trials/enquiries, creates tasks for cancellations/injuries.",
    autoActions: ["Creates CRM lead for trial/enquiry emails", "Creates staff task for cancellations and injury complaints", "Saves suggested reply to email_triage_log"],
  },
  {
    id: "welcome",
    name: "WF-Welcome",
    trigger: "Stripe checkout.session.completed (new member paid)",
    webhookPath: "/api/welcome-sequence",
    envVar: "N8N_WELCOME_WEBHOOK_URL",
    description: "Sends multi-day welcome email sequence: Day 0 (welcome + booking link), Day 2 (check-in), Day 7 (timetable), Day 14 (community), Day 30 (review request).",
    autoActions: ["Triggered automatically after Stripe payment", "Can also be triggered manually from member profile"],
  },
  {
    id: "reengage",
    name: "WF-Reengage",
    trigger: "Daily scheduled job OR manual trigger from /retention",
    webhookPath: "/api/reengage",
    envVar: "N8N_REENGAGE_WEBHOOK_URL",
    description: "Finds lapsed members (churned/cancelled) not contacted in 30 days. Sends personalised re-engagement sequence: Day 0 (we miss you), Day 3 (special offer), Day 7 (final nudge).",
    autoActions: ["Skips members contacted in last 30 days", "Logs to reengage_log table"],
  },
  {
    id: "campaigns",
    name: "WF-Campaigns",
    trigger: "Manual send from /campaigns page",
    webhookPath: "/api — handled by n8n campaign webhook",
    envVar: "N8N_CAMPAIGN_WEBHOOK_URL",
    description: "Receives bulk campaign payload (subject, body, recipient list) and sends via email/SMS provider. Supports merge tags like {{name}}.",
    autoActions: ["Receives full recipient list from platform", "Handles rate limiting and delivery"],
  },
  {
    id: "lead-followup",
    name: "WF-LeadFollowup",
    trigger: "New lead created (chatbot/contact form) OR manual from /leads",
    webhookPath: "/api/lead-followup",
    envVar: "N8N_LEAD_FOLLOWUP_WEBHOOK_URL",
    description: "Sends immediate auto-reply acknowledging enquiry. Creates 24h follow-up task for Kaleb.",
    autoActions: ["Auto-reply sent within minutes of lead creation", "Staff task created with lead details"],
  },
  {
    id: "cold-leads",
    name: "WF-ColdLeads (scheduled)",
    trigger: "n8n Schedule — daily at 9am",
    webhookPath: "/api/lead-followup (mode=cold_leads)",
    envVar: "N8N_LEAD_FOLLOWUP_WEBHOOK_URL",
    description: "Finds leads inactive for 3+ days, creates staff tasks, marks as contacted. Run via n8n Schedule node calling POST /api/lead-followup with {mode: cold_leads}.",
    autoActions: ["Creates tasks for all cold leads", "Updates lead status to contacted"],
  },
];

const ENV_VARS = [
  { key: "ANTHROPIC_API_KEY",          desc: "Claude AI — for /advisor and /email-triage AI features",     required: true },
  { key: "N8N_WEBHOOK_SECRET",         desc: "Shared secret for all n8n → platform webhooks",              required: true },
  { key: "N8N_WELCOME_WEBHOOK_URL",    desc: "n8n webhook URL for welcome email sequence",                  required: false },
  { key: "N8N_REENGAGE_WEBHOOK_URL",   desc: "n8n webhook URL for re-engagement campaign",                  required: false },
  { key: "N8N_CAMPAIGN_WEBHOOK_URL",   desc: "n8n webhook URL for bulk campaigns",                         required: false },
  { key: "N8N_LEAD_FOLLOWUP_WEBHOOK_URL", desc: "n8n webhook URL for lead follow-up automation",           required: false },
  { key: "N8N_COMMS_WEBHOOK_URL",      desc: "n8n webhook URL for individual message sends (/communications)", required: false },
  { key: "STRIPE_SECRET_KEY",          desc: "Stripe secret key for membership billing and portal",         required: true },
  { key: "STRIPE_WEBHOOK_SECRET",      desc: "Stripe webhook signing secret (whsec_...)",                   required: true },
  { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", desc: "Stripe publishable key for /join page",              required: true },
  { key: "STRIPE_PRICE_CASUAL",        desc: "Stripe Price ID for casual membership",                       required: false },
  { key: "STRIPE_PRICE_GYM_MONTHLY",   desc: "Stripe Price ID for gym monthly membership",                  required: false },
  { key: "STRIPE_PRICE_NAC_MONTHLY",   desc: "Stripe Price ID for NAC monthly membership",                  required: false },
  { key: "XERO_TENANT_ID",             desc: "Xero organisation ID (for bank feed + payroll)",              required: false },
  { key: "GOCARDLESS_ACCESS_TOKEN",    desc: "GoCardless API token (for legacy direct debit)",              required: false },
  { key: "NEXT_PUBLIC_APP_URL",        desc: "Your Vercel app URL (e.g. https://bfc-echo.vercel.app)",     required: true },
];

export default async function IntegrationsPage() {
  const profile = await requireRole(["owner_director"]);

  return (
    <AppShell profile={profile}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Integrations &amp; Setup</h1>
          <p className="text-sm text-muted-foreground">
            n8n workflow docs, webhook endpoints, and environment variable reference
          </p>
        </div>

        {/* n8n Workflows */}
        <Card>
          <CardHeader>
            <CardTitle>n8n Workflows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All automations are triggered by POSTing to these platform endpoints. Set up n8n workflows
              to call them, and configure the matching env vars in Vercel.
            </p>
            {WORKFLOWS.map((wf) => (
              <div key={wf.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{wf.name}</h3>
                    <p className="text-xs text-muted-foreground">Trigger: {wf.trigger}</p>
                  </div>
                  <code className="rounded bg-muted px-2 py-1 text-xs font-mono shrink-0">{wf.envVar}</code>
                </div>
                <p className="text-sm text-muted-foreground">{wf.description}</p>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Webhook endpoint:</p>
                  <code className="rounded bg-zinc-900 text-green-400 px-3 py-1.5 text-xs font-mono block">
                    POST {wf.webhookPath}
                  </code>
                </div>
                <div className="space-y-0.5">
                  {wf.autoActions.map((action, i) => (
                    <p key={i} className="text-xs text-muted-foreground">&#10003; {action}</p>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Environment variables */}
        <Card>
          <CardHeader>
            <CardTitle>Environment Variables</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Variable</th>
                  <th className="px-4 py-2 text-left font-medium">Description</th>
                  <th className="px-4 py-2 text-left font-medium">Required</th>
                </tr>
              </thead>
              <tbody>
                {ENV_VARS.map((v) => (
                  <tr key={v.key} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <code className="text-xs font-mono text-primary">{v.key}</code>
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{v.desc}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.required ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                        {v.required ? "Required" : "Optional"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Stripe webhooks */}
        <Card>
          <CardHeader><CardTitle>Stripe Webhook Events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Add <code className="rounded bg-muted px-1 text-xs font-mono">/api/stripe/webhook</code> as a
              webhook endpoint in your Stripe Dashboard. Enable these events:
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {[
                "customer.subscription.created",
                "customer.subscription.updated",
                "customer.subscription.deleted",
                "invoice.payment_succeeded",
                "invoice.payment_failed",
                "checkout.session.completed",
              ].map((event) => (
                <code key={event} className="rounded bg-zinc-900 text-green-400 px-3 py-1 text-xs font-mono">
                  {event}
                </code>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Xero */}
        <Card>
          <CardHeader><CardTitle>Xero Bank Feed Setup</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Complete Xero OAuth2 flow via n8n (save access token to <code className="text-xs font-mono">xero_tokens</code> table)</p>
            <p>2. Set <code className="text-xs font-mono">XERO_TENANT_ID</code> in Vercel env vars</p>
            <p>3. Go to <a href="/bank-feed" className="text-primary hover:underline">/bank-feed</a> and click &quot;Sync from Xero&quot;</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
