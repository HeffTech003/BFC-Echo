# BFC n8n Workflows

Import these into your n8n instance to activate all automations.

## How to Import

1. Open n8n → click **+** → **Import from file**
2. Select the `.json` file
3. Follow the SETUP notes inside each workflow (visible in n8n's workflow notes panel)
4. Activate the workflow with the toggle in the top-right

---

## Workflows

| File | Purpose | Trigger | Vercel Env Var |
|---|---|---|---|
| `WF-Email-Triage.json` | Watches Gmail, AI-classifies all inbound emails, alerts for high priority | Gmail Trigger | *(none — workflow calls platform)* |
| `WF-Welcome.json` | 5-email welcome sequence over 30 days for new members | Webhook (called after Stripe payment) | `N8N_WELCOME_WEBHOOK_URL` |
| `WF-Reengage.json` | 3-email re-engagement sequence for lapsed members | Webhook (called by /api/reengage) | `N8N_REENGAGE_WEBHOOK_URL` |
| `WF-Campaigns.json` | Delivers bulk email/SMS campaigns to member segments | Webhook (called from /campaigns page) | `N8N_CAMPAIGN_WEBHOOK_URL` |
| `WF-LeadFollowup.json` | Auto-replies to new leads + 7-day follow-up sequence | Webhook (called by /api/chatbot-lead, /api/contact-form) | `N8N_LEAD_FOLLOWUP_WEBHOOK_URL` |
| `WF-ColdLeads-Daily.json` | Daily 9am trigger — finds cold leads, creates tasks, emails Kaleb | Schedule (cron: `0 23 * * *`) | *(none — calls platform directly)* |

---

## Setup Order

1. **Set n8n environment variable:** `N8N_WEBHOOK_SECRET` = same value as in Vercel
2. **Connect Gmail account** in n8n Credentials (shared across all workflows)
3. **Import each workflow** and activate
4. **Copy webhook URLs** from WF-Welcome, WF-Reengage, WF-Campaigns, WF-LeadFollowup
5. **Paste webhook URLs** into Vercel environment variables (see table above)
6. **Redeploy Vercel** after adding the new env vars

---

## Security

Every webhook-triggered workflow verifies the `X-Webhook-Secret` header against `N8N_WEBHOOK_SECRET`.  
If the secret doesn't match, the execution ends silently.

Do not put the secret value in code or share it — store it only in:
- n8n: Settings → Variables → `N8N_WEBHOOK_SECRET`
- Vercel: Settings → Environment Variables → `N8N_WEBHOOK_SECRET`

---

## Customise

- **Email copy** — edit the `message` field in each Gmail node directly in n8n
- **Google Review link** — replace `[YOUR_GOOGLE_REVIEW_LINK]` in WF-Welcome Day 30 email
- **SMS** — WF-Campaigns includes a Twilio node; connect your Twilio credentials and set `TWILIO_FROM_NUMBER` in n8n vars
- **Cold lead threshold** — change `cold_threshold_days: 3` in WF-ColdLeads-Daily
- **Schedule timezone** — cron `0 23 * * *` = 9am AEST; adjust for daylight saving if needed
