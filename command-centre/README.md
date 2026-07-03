# BFC Command Centre

Private operational intelligence platform for Bendigo Fight Centre. Sits **above**
the existing systems of record (Clubworx, GoCardless, Xero, WooCommerce, Square,
Gmail) — it never replaces them. The existing n8n instance remains the
integration/action layer.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui**
  (note: Next 16 uses `src/proxy.ts` instead of `middleware.ts`)
- **Supabase** (PostgreSQL + Auth), Sydney region `ap-southeast-2`
- Roles + row-level security, audit-logged sensitive access
- Hosting: Railway or Vercel — separate **staging** and **production**

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold, auth, 6 roles + RLS, audit framework, 13-table data model | ✅ this codebase |
| 1 | Dashboard tiles, member search, canonical profile, read-only syncs, match queue | next |
| 2 | Tasks, leads pipeline, email review | later |
| 3 | Compliance & safety (policies, medical forms, youth onboarding, incidents) | later |
| 4 | Controlled write actions (human-approved, via n8n) | last |

## Local setup

1. **Create the Supabase project** (region `ap-southeast-2`). In the SQL editor,
   run `supabase/migrations/0001_phase0_foundation.sql`.
2. **Create the first user** (Authentication → Users → Add user: Kaleb's email +
   password), then promote it:
   ```sql
   update public.profiles
   set role = 'owner_director', full_name = 'Kaleb Heffernan'
   where id = '<that-user-uuid>';
   ```
3. `cp .env.local.example .env.local` and fill in the Supabase URL + anon key.
4. `npm install && npm run dev` → http://localhost:3000 → sign in.

Every additional user starts as **General Staff** (least privilege); the
Owner/Director assigns roles by updating `profiles.role`.

## Roles

| Role | Access summary |
|---|---|
| Owner / Director | Everything, incl. audit logs and user management |
| Operations Admin | Members, leads, tasks, comms; **no** medical/incident data |
| Coach | Training-relevant member flags only |
| Child Safety Lead | Youth compliance, medical forms, incident reports |
| Finance | Payments, invoices, sync status; no safeguarding data |
| General Staff | Day-to-day member status + own tasks |

Enforced twice: PostgreSQL **row-level security** (the real gate — see the
migration) and `requireRole()` server-side page gates.

## Audit logging

Call `logAudit(action, resourceType, resourceId?, details?)` from server code on
every sensitive view/write/export. Inserts go through a `security definer`
function; the `audit_logs` table accepts no direct writes and is readable only
by the Owner/Director.

## Data model (13 tables)

`members` (canonical record) · `member_source_records` (fragmented system
records + match queue) · `memberships` · `payment_events` · `communication_events`
· `leads` · `tasks` · `policy_versions` · `policy_acknowledgements` ·
`medical_forms` (restricted) · `incident_reports` (restricted) · `audit_logs` ·
`sync_runs` — plus `profiles` for staff/roles.

Every synced table carries `source_system`, `source_record_id` and
`last_synced_at`, and `(source_system, source_record_id)` is unique so webhook
re-deliveries can't duplicate rows.

## Non-negotiable guardrails

1. No production credentials in code or GitHub — `.env.local` only.
2. No AI-initiated cancellations, refunds, or payment changes.
3. No general-staff access to health/youth/incident data (RLS-enforced).
4. No auto-archiving of complaints, safeguarding, cancellation or legal emails.
5. Read-only before write-enabled.
6. Source-system ID + sync timestamp visible on every record.
