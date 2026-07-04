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
| 0 | Scaffold, auth, 6 roles + RLS, audit framework, 13-table data model | ✅ |
| 1 | Dashboard tiles, member search, canonical profile, match queue, sync status, payments/legacy view | ✅ app side — n8n connectors follow `docs/sync-contracts.md` |
| 2 | Task queue, leads pipeline, email review + approvals, cancellations, supplier invoices | ✅ app side — n8n feeds per `docs/sync-contracts.md` |
| 3 | Compliance & safety: policy library (create/edit + acknowledgement matrix), secure expiring form links with explicit consent, guardian youth onboarding, coach medical-note flag, restricted incidents (people/witnesses/evidence/notifications), audit viewer | ✅ — ⚠️ legal/privacy review required before collecting real health/child-safety data (see below) |
| 4 | Controlled write actions: request → human approval → n8n executes → result recorded. High-risk (cancel/pause/refund/bulk) Owner-only. | ✅ app side — enable the n8n executor only once read-only data is trusted in production |

Migrations: run in order `0001_phase0_foundation.sql` → `0002_phase1_reconciliation.sql`
→ `0003_phase2_operations.sql` → `0004_phase3_compliance.sql` →
`0005_phase4_actions.sql` → `0006_phase3_completion.sql`.
For a demo without live syncs, run `supabase/seed-dev.sql` (dev/staging only).

> ### ⚠️ Before collecting real health or child-safety data (Phase 3)
> Obtain a **privacy/legal review first**. This platform stores health information,
> youth records, and safeguarding incidents, which attract specific obligations
> under the **Australian Privacy Act 1988 (Cth)** (including the Australian Privacy
> Principles and, for health information, the higher bar for sensitive information)
> and **Working With Children** requirements for anyone handling youth data. Also:
> enable **MFA** for all staff accounts in Supabase Auth, keep `medical_forms` and
> `incident_reports` RLS-locked to Owner/Director + Child Safety Lead (never widen
> to make a feature work), never send health data by ordinary email (secure form
> links only), and confirm every medical/incident view is audit-logged.

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
