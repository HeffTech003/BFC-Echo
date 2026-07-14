# BFC Platform — Complete Setup Guide
Last updated: July 2026

Everything you need to configure manually before the platform is fully live.
Do these in order: Git → Vercel → Supabase SQL → Stripe → n8n.

---

## STEP 1 — Fix Git & Push to Vercel

Open **Git Bash** in `C:\Users\kaleb\UserskalebBFC-Echo` and run these commands one at a time:

```bash
# Delete the corrupted lock file
del .git\index.lock

# Reset the index (does not touch your files)
git reset HEAD

# Stage everything
git add -A

# Commit
git commit -m "feat: merch shop, AI advisor, email triage, bank feed, campaigns, n8n automations, error pages, integrations docs"

# Push — triggers Vercel auto-deploy
git push origin main
```

Vercel will deploy automatically. Check https://vercel.com/hefftech003/bfc-echo for build status.

---

## STEP 2 — Vercel Environment Variables

Go to: **Vercel Dashboard → bfc-echo → Settings → Environment Variables**

Add each variable below. Set environment to **Production + Preview**.

### Required (AI + Core)

| Variable | Value / Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys → Create key |
| `NEXT_PUBLIC_APP_URL` | `https://bfc-echo.vercel.app` |

### Required (Stripe)

| Variable | Value / Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys → Secret key (sk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Set up webhook first (Step 4), then paste the signing secret (whsec_...) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys → Publishable key (pk_live_...) |

### Required (Supabase — already set if the app is working)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | https://arokqidhsqatlahceajy.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Project Settings → API |

### Required (n8n Security)

| Variable | Value |
|---|---|
| `N8N_WEBHOOK_SECRET` | Make up a long random string — e.g. `bfc-n8n-secret-2026-XYZ` — same value goes in every n8n HTTP Request node header |

### Optional (n8n Webhook URLs — add as you build each workflow)

These are the URLs of your n8n Webhook nodes. Get them from n8n after building each workflow.

| Variable | Which n8n workflow |
|---|---|
| `N8N_WELCOME_WEBHOOK_URL` | WF-Welcome webhook trigger URL |
| `N8N_REENGAGE_WEBHOOK_URL` | WF-Reengage webhook trigger URL |
| `N8N_CAMPAIGN_WEBHOOK_URL` | WF-Campaigns webhook trigger URL |
| `N8N_LEAD_FOLLOWUP_WEBHOOK_URL` | WF-LeadFollowup webhook trigger URL |
| `N8N_COMMS_WEBHOOK_URL` | WF-Comms webhook trigger URL |

### Optional (Xero + GoCardless)

| Variable | Value |
|---|---|
| `XERO_TENANT_ID` | Xero → Settings → General Settings → Xero Network Key (or get from Xero API) |
| `GOCARDLESS_ACCESS_TOKEN` | GoCardless Dashboard → Developers → Access tokens |

### Optional (Stripe Plan Price IDs)

| Variable | Where to get it |
|---|---|
| `STRIPE_PRICE_CASUAL` | Stripe → Products → Create "Casual" plan → copy Price ID (price_...) |
| `STRIPE_PRICE_GYM_MONTHLY` | Stripe → Products → Create "Gym Monthly" → copy Price ID |
| `STRIPE_PRICE_NAC_MONTHLY` | Stripe → Products → Create "NAC Monthly" → copy Price ID |

---

## STEP 3 — Supabase SQL

Go to: **https://supabase.com/dashboard/project/arokqidhsqatlahceajy/sql/new**

Run Steps 16–21 from `supabase/sql/pending_fixes.sql`. You can copy/paste the whole block at once:

### What each step creates

- **Step 16** — Merch shop tables: `products`, `merch_orders`, `merch_order_items`
- **Step 17** — Bank feed: `bank_transactions`
- **Step 18** — Campaigns: `campaigns`, `campaign_sends`
- **Step 19** — Email triage log: `email_triage_log`
- **Step 20** — Welcome sequence log: `welcome_sequence_log`
- **Step 21** — Re-engage log: `reengage_log`, adds `due_date`/`tags`/`priority` to `staff_tasks`, adds `tags`/`updated_at` to `crm_leads`

---

## STEP 4 — Stripe Webhook

Go to: **Stripe Dashboard → Developers → Webhooks → Add endpoint**

- **Endpoint URL:** `https://bfc-echo.vercel.app/api/stripe/webhook`
- **Events to send** (select all 6):
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `checkout.session.completed`

After saving, click **Reveal signing secret** → copy the `whsec_...` value → paste into `STRIPE_WEBHOOK_SECRET` in Vercel.

---

## STEP 5 — n8n Workflows

Build these 5 workflows in your n8n instance. For each one, every HTTP Request node needs this header:

```
X-Webhook-Secret: [your N8N_WEBHOOK_SECRET value]
```

---

### WF-Email-Triage

**What it does:** Watches Gmail → sends emails to your platform for AI classification → routes based on result.

**Trigger:** Gmail node (watches inbox for new emails)

**Nodes:**

```
1. Gmail Trigger
   - Resource: Message
   - Event: Message Received
   - Filters: (none — all inbox)

2. HTTP Request → POST https://bfc-echo.vercel.app/api/inbound-email
   Headers:
     Content-Type: application/json
     X-Webhook-Secret: [N8N_WEBHOOK_SECRET]
   Body (JSON):
     {
       "from": "{{ $json.from }}",
       "subject": "{{ $json.subject }}",
       "body": "{{ $json.text }}",
       "message_id": "{{ $json.id }}",
       "thread_id": "{{ $json.threadId }}",
       "received_at": "{{ $json.date }}"
     }

3. IF node — check for high priority
   Condition: {{ $json.priority }} equals "high" OR {{ $json.escalate }} equals true
   → True branch: Slack/email alert to Kaleb
   → False branch: continue

4. IF node — check category
   Condition: {{ $json.category }} in ["lead", "trial_class_request"]
   → True: (already auto-handled by platform — CRM lead created)
   → You can add a Slack notification here too if you want
```

---

### WF-Welcome

**What it does:** Receives new member data from your platform (triggered after Stripe payment) and sends a multi-day email sequence.

**Trigger:** Webhook node (your platform calls this)

```
1. Webhook (POST)
   → n8n gives you a URL like https://your-n8n.com/webhook/welcome
   → Copy this URL and paste into NEXT_PUBLIC_APP_URL... wait, no:
   → Paste into N8N_WELCOME_WEBHOOK_URL in Vercel

2. Wait node — 0 delay (Day 0 email)

3. Gmail Send Email
   To: {{ $json.email }}
   Subject: Welcome to Bendigo Fight Centre, {{ $json.name }}! 🥊
   Body:
     Hi {{ $json.name }},

     Welcome to BFC! We're pumped to have you.

     Your membership is now active. Here's what to do next:

     👉 Book your first class: https://bfc-echo.vercel.app/portal
     📅 View the timetable: https://bfc-echo.vercel.app/timetable

     If you have any questions, just reply to this email or call us.

     See you on the mats,
     Kaleb
     Bendigo Fight Centre

4. Wait node — 2 days

5. Gmail Send Email
   To: {{ $json.email }}
   Subject: How's your first week going?
   Body:
     Hey {{ $json.name }},

     Just checking in — have you had a chance to come in yet?

     If you haven't booked your first class, do it here:
     https://bfc-echo.vercel.app/portal

     Let me know if you need anything.

     Kaleb

6. Wait node — 5 days (total = Day 7)

7. Gmail Send Email
   To: {{ $json.email }}
   Subject: Your BFC timetable this week
   Body:
     Hey {{ $json.name }},

     Here's what's on this week — pick a session and come train!

     📋 Full timetable: https://bfc-echo.vercel.app/timetable

     We've got BJJ, boxing, muay thai, wrestling and MMA — something for every level.

     See you soon,
     Kaleb

8. Wait node — 7 days (total = Day 14)

9. Gmail Send Email
   To: {{ $json.email }}
   Subject: You're part of the BFC family now
   Body:
     Hey {{ $json.name }},

     You've been training with us for two weeks — legend!

     Don't forget you can connect with the community and manage your membership at:
     https://bfc-echo.vercel.app/portal

     Kaleb

10. Wait node — 16 days (total = Day 30)

11. Gmail Send Email
    To: {{ $json.email }}
    Subject: Quick favour — leave us a Google review?
    Body:
      Hey {{ $json.name }},

      You've been with us a month now — time flies!

      If you've been enjoying training, we'd really appreciate a Google review.
      It only takes 2 minutes and makes a huge difference for us:
      https://g.page/r/[YOUR_GOOGLE_REVIEW_LINK]/review

      Thanks legend,
      Kaleb
```

---

### WF-Reengage

**What it does:** Receives lapsed member data from your platform and sends a re-engagement sequence.

**Trigger:** Webhook node (your platform calls this — either manually or via daily schedule)

```
1. Webhook (POST)
   → Copy URL → paste into N8N_REENGAGE_WEBHOOK_URL in Vercel
   
   Receives: { members: [{ id, name, email, lapsed_at }] }

2. Split In Batches — process each member

3. Wait — 0 delay (Day 0)

4. Gmail Send Email
   To: {{ $json.email }}
   Subject: We miss you at BFC, {{ $json.name }}
   Body:
     Hey {{ $json.name }},

     We noticed you haven't been in for a while and wanted to check in.

     Life gets busy — we get it. But the mats are always here when you're ready.

     If there's anything that stopped you coming in, I'd genuinely love to know.
     Just reply to this email.

     Your membership can be reactivated anytime:
     https://bfc-echo.vercel.app/join

     Hope to see you soon,
     Kaleb
     Bendigo Fight Centre

5. Wait — 3 days

6. Gmail Send Email
   To: {{ $json.email }}
   Subject: Special offer — come back to BFC
   Body:
     Hey {{ $json.name }},

     I wanted to make it easy to come back.

     Reply to this email and I'll sort you out with your first week back on us.

     Training is the best thing you can do for your body and your head — I genuinely believe that.

     Kaleb

7. Wait — 4 days (total = Day 7)

8. Gmail Send Email
   To: {{ $json.email }}
   Subject: Last one from me, {{ $json.name }}
   Body:
     Hey {{ $json.name }},

     This is the last email from me — I don't want to fill up your inbox.

     If you ever want to come back, the door is always open.
     https://bfc-echo.vercel.app/join

     Take care,
     Kaleb
```

---

### WF-Campaigns

**What it does:** Receives bulk campaign payload from your platform and delivers to a list of recipients.

**Trigger:** Webhook node (your platform calls this when you hit Send on the /campaigns page)

```
1. Webhook (POST)
   → Copy URL → paste into N8N_CAMPAIGN_WEBHOOK_URL in Vercel

   Receives:
   {
     "campaign_id": "uuid",
     "name": "Campaign name",
     "subject": "Email subject",
     "body_email": "Email body with {{name}} merge tags",
     "body_sms": "SMS body",
     "channels": ["email"],
     "recipients": [
       { "member_id": "uuid", "name": "John", "email": "john@example.com", "phone": "+61..." }
     ]
   }

2. Split In Batches
   Batch size: 10 (to avoid hitting Gmail rate limits)

3. For each recipient:

   IF node — check channel
   → email: Gmail Send Email
     To: {{ $json.email }}
     Subject: {{ $('Webhook').item.json.subject }}
     Body: {{ $('Webhook').item.json.body_email.replace('{{name}}', $json.name) }}

   → sms: use your SMS provider (Twilio, MessageBird, etc.)
     To: {{ $json.phone }}
     Body: {{ $('Webhook').item.json.body_sms.replace('{{name}}', $json.name) }}

4. Wait — 1 second between batches (rate limiting)
```

---

### WF-LeadFollowup

**What it does:** Receives new lead data from your platform and sends an immediate auto-reply.

**Trigger:** Webhook node (called when a new lead comes in via chatbot, contact form, or manual trigger)

```
1. Webhook (POST)
   → Copy URL → paste into N8N_LEAD_FOLLOWUP_WEBHOOK_URL in Vercel

   Receives:
   {
     "lead_id": "uuid",
     "name": "John Smith",
     "email": "john@example.com",
     "phone": "+61...",
     "source": "contact_form",
     "interest": "BJJ classes",
     "mode": "new_lead"  (or "cold_leads")
   }

2. IF node — mode check
   Condition: {{ $json.mode }} equals "new_lead"

   → True branch (new lead auto-reply):

   3. Gmail Send Email
      To: {{ $json.email }}
      Subject: Thanks for your enquiry — Bendigo Fight Centre
      Body:
        Hi {{ $json.name }},

        Thanks for getting in touch with Bendigo Fight Centre!

        We've received your enquiry and Kaleb will be in touch within 24 hours.

        In the meantime, feel free to check out our timetable:
        https://bfc-echo.vercel.app/timetable

        Or book a free trial class:
        https://bfc-echo.vercel.app/join

        Talk soon,
        The BFC Team
        📞 [YOUR PHONE NUMBER]

   → False branch (cold_leads — no auto-reply needed, platform already created tasks):
   
   3. (optional) Slack notification to Kaleb: "{{ $json.count }} cold leads flagged for follow-up"
```

---

## STEP 6 — Daily n8n Schedule (Cold Leads)

Add a **Schedule Trigger** workflow that runs daily at 9am:

```
1. Schedule Trigger
   Mode: Cron
   Expression: 0 23 * * *   (9am AEST = 11pm UTC)

2. HTTP Request → POST https://bfc-echo.vercel.app/api/lead-followup
   Headers:
     Content-Type: application/json
     X-Webhook-Secret: [N8N_WEBHOOK_SECRET]
   Body (JSON):
     {
       "mode": "cold_leads",
       "cold_threshold_days": 3
     }
```

---

## Quick Reference — Platform URLs

| Feature | URL |
|---|---|
| Dashboard | /dashboard |
| Members | /members |
| CRM Leads | /leads |
| Campaigns | /campaigns |
| Email Triage | /email-triage |
| Email Triage Log | /email-triage/log |
| AI Advisor | /advisor |
| Bank Feed | /bank-feed |
| Merch Shop | /merch |
| Merch Admin | /merch/admin |
| Member Portal | /portal |
| Integrations Docs | /settings |
| Payroll | /payroll |
| Compliance | /compliance |
| Timetable | /timetable |
| Gradings | /gradings |

---

## AI System Prompts (Already in Code)

These are already written and running — no action needed. Listed here in case you want to customise.

### AI Advisor (`/advisor`)

The advisor knows about BFC's live data (members, leads, tasks, gradings, low-stock products) and helps with operations, retention, finance, and staff management. It responds in plain Australian English and suggests specific tasks when needed.

Customise at: `src/app/api/advisor/route.ts` → `systemPrompt` variable

### Email Triage (`/email-triage` and `/api/inbound-email`)

Classifies emails into 12 categories, sets priority (high/medium/low), writes a suggested reply in Kaleb's voice, suggests a CRM action, and flags escalations.

Categories: `membership_enquiry`, `trial_class_request`, `cancellation_request`, `billing_dispute`, `injury_complaint`, `general_enquiry`, `lead`, `spam`, `supplier`, `compliment`, `media_press`, `other`

Customise at: `src/app/api/email-triage/route.ts` → `systemPrompt` variable
