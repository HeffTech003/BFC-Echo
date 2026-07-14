# BFC Platform — Master Vision & Task Reference

Last updated: 12 July 2026

---

## THE END GOAL

Build a fully custom, self-owned platform for Bendigo Fight Centre that replaces all third-party software.  
One system. Full control. No ongoing SaaS bills.

### What it replaces (eventually)
- **Clubworx** ($159 AUD/mo) — member management, bookings, Ezidebit payments
- **GoCardless** — recurring billing (17 legacy members still here, migrating off)
- **WooCommerce** — subscriptions (6 active, migrating off)
- **Xero** (partially) — financial tracking already mirrored into Supabase

### Core philosophy
- **AI prepares, humans approve, systems execute** — nothing sensitive (money, cancellations, comms) happens without Kaleb's eyes on it
- Clubworx stays as data source until the platform can fully replace it
- Clean up legacy mess first, build forward second

---

## CURRENT STACK

| Layer | Tool | Notes |
|---|---|---|
| Database | Supabase (PostgreSQL) | Sydney region, RLS enforced |
| Automation | n8n on Railway | WF14–WF18 active |
| App hosting | Vercel | bfc-echo.vercel.app |
| Repo | GitHub HeffTech003/BFC-Echo | main branch → production |
| Payments | GoCardless (legacy) + Ezidebit via Clubworx | Stripe planned as replacement |
| Accounting | Xero | Synced via WF17 (contacts) + WF18 (financials) |
| AI assistant | Echo (n8n Claude agent) | Daily briefing, callable tools |

---

## SYSTEM STATUS — WHAT'S BUILT

### ✅ Done & working
- Member profiles, list, search, filter chips
- Family/relationship linking (RelationshipManager — but currently missing from profile UI, see bug #39)
- Data sync pipeline: Clubworx→Supabase (WF14), GoCardless→Supabase (WF16), Xero contacts (WF17), Xero financials (WF18)
- Financial dashboard (P&L, invoices, expenses — but P&L expenses bug, see #37)
- GoCardless subscriptions page (but not showing data, see bug #36)
- Retention & churn dashboard (but corrupted by date bug, see #34)
- Trial conversion funnel (empty — no leads wired yet)
- Cancellations intake
- Email Review page (awaiting Gmail integration)
- Communications page
- Tasks queue
- Leads pipeline (empty — needs CRM wiring)
- Match queue (100 unmatched records pending)
- Echo AI: daily briefing, tool nodes, cancellation triage, invoice scanner
- Member-facing portal (login + view own profile)
- BFC red/black theme applied
- Mobile responsive

### 🔶 Partially working
- Communications — wired but no automated flows built yet
- Member portal — view only, no self-service actions
- Payments page — data exists but 30-day queries broken

---

## KNOWN BUGS (in priority order)

| Task | Bug | Root cause |
|---|---|---|
| #32 | Root URL redirect loop | proxy.ts auth redirect loop — PR open but not merged |
| #33 | Dashboard shows 298 active (should be 76) | Query not filtering by member_status = 'active' |
| #34 | Retention shows fake +595 spike | WF14 sync overwrote joined_at with sync timestamp |
| #35 | 100 unmatched Clubworx members | WF14 pagination fix brought in new records with no canonical members |
| #36 | Subscriptions page shows 0 GoCardless | WF16 not writing to the table the page queries |
| #37 | Financial P&L shows $0 expenses | P&L query looking at wrong table for bills |
| #38 | Payments page $0 for all sources | 30-day revenue queries broken |
| #39 | RelationshipManager missing from profiles | Component not rendered in profile page |
| #40 | 17 GoCardless subs all "unlinked" | Not matched to canonical member records |

---

## FULL TASK ROADMAP

### Immediate cleanup (admin tasks — Kaleb does these)
- #2 Suspend Clubworx billing for 17 GoCardless legacy members (stops kiosk blocking, stops fake debt)
- #3 Send hard-deadline migration email to GoCardless members (deadline: 1 Sept)
- #4 Migrate 6 WooCommerce active subscribers to Clubworx
- #5 Fix Angie/Raul SALISBURY relationship link in RelationshipManager

### Bug fixes (build tasks)
- #32 Fix root URL redirect loop
- #33 Fix dashboard active member count
- #34 Fix joined_at dates corrupted by WF14
- #35 Bulk-create 100 canonical members from match queue
- #36 Fix Subscriptions page GoCardless data
- #37 Fix Financial P&L expenses = $0
- #38 Fix Payments page 30-day revenue queries
- #39 Fix RelationshipManager missing from profiles
- #40 Link 17 GoCardless subs to canonical members

### Data quality
- #6 Investigate active member count gap (76 showing vs ~129 in Clubworx)
- #31 Fix WF14 NAC rate limit (add delay node)

### In-app AI Advisor
- #41 Build in-app AI advisor — create/solve tasks, approval layer, reads platform data, proposes fixes, drafts comms (never auto-executes)
- #42 Email triage AI — classifies inbound emails, drafts replies, escalates with situation reports, adapts to scenario

### App rename
- #1 Rename "Command Centre" → "Bendigo Fight Centre" throughout app

### Gmail + Email Intelligence
- #7 Build intelligent email triage — AI classifies inbound, drafts replies, CRM-logs, escalates with situation reports
- #42 Build email triage AI brain — scenario classification, adaptive tone, BFC knowledge base, escalation report format
- #8 Build welcome email sequence for new members
- #9 Build lapsed member re-engagement automation
- #10 Build bulk email/SMS campaign builder

### CRM / Lead Pipeline
- #11 Wire website chatbot → Supabase leads
- #12 Wire website contact forms → Supabase leads
- #13 Build CRM lead pipeline view (New → Contacted → Trial → Converted)
- #14 Build lead follow-up automation

### Coach & Staff Compliance
- #15 Build coach compliance DB (WWCC, First Aid, Police Check, qualifications)
- #16 Build red/amber/green compliance dashboard
- #17 Build expiry alert automation (30d, 7d, expiry day)

### Policy Hub
- #18 Build policy & documents hub
- #19 Build digital waiver system (sign + store on profile)

### Payroll (human-in-the-loop)
- #20 Build coach hours/classes log
- #21 Build pay run calculation + review UI (Kaleb approves before anything moves)
- #22 Wire approved pay run to Xero Payroll API

### Class & Schedule
- #23 Build class timetable management
- #24 Build member class booking system
- #25 Build attendance & roll call tracking
- #26 Build grading & belt promotion tracking

### Member Portal expansion
- #27 Members can update own details, book classes, manage subscription

### Payments (replacing Clubworx/Ezidebit — long-term)
- #28 Integrate Stripe for recurring membership billing
- #29 Build member sign-up flow with waiver + payment setup

### Merch Shop (future)
- #30 Build merch shop — products, orders, inventory

---

## KEY RULES (non-negotiable)
1. **Never put credentials in code, GitHub, Claude chat, or docs** — use environment variables
2. **AI never autonomously moves money** — always human approval before any financial action
3. **AI never auto-sends emails/SMS** — draft only, Kaleb reviews and sends
4. **No AI-initiated cancellations, refunds, or payment changes**
5. RLS policies in Supabase are the real auth layer — never weaken them

---

## CONTEXT FOR FUTURE SESSIONS

- App URL: https://bfc-echo.vercel.app
- Supabase project: arokqidhsqatlahceajy (Sydney)
- n8n: https://n8n-production-eaabe.up.railway.app
- GitHub: HeffTech003/BFC-Echo
- Kaleb's email: bendigofightcentre@gmail.com (also kalebheffernan@gmail.com on Vercel)
- Clubworx gym ID: 11204
- WF14 workflow ID: eChGNgBes3HdrYad (Clubworx sync — pagination fixed July 2026)
- GoCardless: 17 active mandate holders still on legacy billing
- WooCommerce: 6 active subscribers still need migrating
- Active members: 76 confirmed in platform, ~129 in Clubworx (gap due to unmatched records)
