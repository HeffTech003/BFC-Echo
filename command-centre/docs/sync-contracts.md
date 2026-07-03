# Sync contracts — n8n → Supabase

How the existing n8n instance feeds the Command Centre database. **Read-only
direction only**: source systems → Supabase. Nothing in these contracts writes
back to Clubworx/GoCardless/Xero/WooCommerce/Square (that's Phase 4, human-approved).

## Transport

n8n HTTP Request nodes call the Supabase REST API directly:

```
POST {SUPABASE_URL}/rest/v1/{table}
Headers:
  apikey:        {SUPABASE_SERVICE_ROLE_KEY}
  Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
  Content-Type:  application/json
  Prefer:        resolution=merge-duplicates
Query: ?on_conflict=source_system,source_record_id
Body:  JSON array of rows (batch up to ~500)
```

- The **service role key** lives ONLY in the n8n credential store (as a Header
  Auth credential). Never in workflow JSON, never in the frontend.
- `Prefer: resolution=merge-duplicates` + `on_conflict=source_system,source_record_id`
  makes every sync **idempotent** — webhook re-deliveries and re-runs upsert
  instead of duplicating. Always set `last_synced_at` to `{{$now}}` so updates refresh it.

## Run bookkeeping (every connector, every run)

1. **Start**: `POST /rest/v1/sync_runs` with
   `{ "source_system": "...", "run_type": "scheduled|webhook|manual|backfill", "status": "running" }`
   — capture the returned `id` (add header `Prefer: return=representation`).
2. **Finish**: `PATCH /rest/v1/sync_runs?id=eq.{id}` with
   `{ "status": "success", "finished_at": "{{$now}}", "records_processed": N, "records_created": N, "records_updated": N }`.
3. **On error**: same PATCH with `{ "status": "error", "error_message": "..." }`.
   The Sync Status page shows red for any error in the last 7 days.

## Table contracts

### member_source_records — one row per person-record in a source system

| column | value |
|---|---|
| source_system | `clubworx` \| `gocardless` \| `xero` \| `woocommerce` \| `square` \| `chatbot` |
| source_record_id | the system's own id (Clubworx member id, GoCardless customer id `CU…`, Xero contact id, Woo customer id, Square customer id) |
| source_record_type | `member` / `customer` / `contact` / `lead` |
| display_name, email, phone | as known in that system |
| raw_data | the full source object (jsonb) |
| last_synced_at | `{{$now}}` |

Never set `member_id` or `match_status` from n8n — linking is a **human decision**
made in the Match Queue.

### memberships (Clubworx primarily; GoCardless subscriptions as legacy billing)

Key fields: `source_system`, `source_record_id` (membership/subscription id),
**`source_customer_id`** (the member/customer id it belongs to — required, this
is how approved matches attach it), `membership_type`, `status`
(`active|paused|cancelled|expired`), `billing_provider`
(`gocardless|ezidebit|square|manual`), `amount`, `billing_interval`
(`weekly|monthly`), `start_date`, `end_date`, `raw_data`, `last_synced_at`.

### payment_events

Key fields: `source_system`, `source_record_id` (payment/order/transaction id),
**`source_customer_id`**, `event_type`, `status`, `amount` (decimal dollars, not
cents — convert GoCardless/Square cents), `currency` (`AUD`), `description`,
`occurred_at`, `raw_data`, `last_synced_at`.

`event_type` mapping:

| Source event | event_type |
|---|---|
| GoCardless `payments.confirmed` / `paid_out` | `payment_paid` |
| GoCardless `payments.failed` / `late_failure_settled` | `payment_failed` |
| GoCardless refunds | `refund` |
| GoCardless chargebacks / `charged_back` | `chargeback` |
| WooCommerce order (paid/completed) | `order` |
| Square payment `COMPLETED` | `payment_paid` (or `order` for POS sales) |
| Xero invoice paid | `payment_paid` |

### leads (website chatbot / trial intake)

`source_system: 'chatbot'`, `source_record_id`: conversation id, plus
`full_name`, `email`, `phone`, `interested_class`, `stage`
(`new_enquiry|trial_booked|trial_attended|follow_up_required|joined|did_not_convert`),
`source: 'website_chatbot'`, `last_synced_at`.
(The existing trial-intake workflow can dual-write here alongside the Google Sheet.)

### communication_events (optional, Phase 2 expands this)

`channel` (`gmail|chatbot`), `direction`, `subject`, `summary`, `occurred_at`,
`source_system`, `source_record_id`, `raw_data`.

## Phase 2 tables

### email_review_queue — inbox classification suggestions

n8n's inbox scanner classifies mail and inserts one row per message
(`on_conflict=gmail_message_id`):

| column | value |
|---|---|
| gmail_message_id / gmail_thread_id | Gmail ids |
| from_address, subject, snippet, received_at | message metadata |
| category | `payments_failed` \| `leads_new` \| `supplier_invoice` \| `cancellation` \| `complaint` \| `legal` \| `safeguarding` \| `routine` \| `other` |
| protected | **must be `true`** for complaint / legal / safeguarding / cancellation / chargeback / medical — a DB trigger makes archive-approval impossible for these |
| suggested_label | e.g. `BFC/Payments/Failed`, `BFC/Action-Required` |
| suggested_action | `label` \| `archive` \| `draft_reply` \| `create_task` \| `none` |
| ai_summary / ai_draft_reply / confidence | AI output; drafts are DRAFTS — approval never sends |

**Applying decisions** (second n8n workflow, every ~15 min):
1. `GET /rest/v1/email_review_queue?status=eq.approved&applied_at=is.null`
2. Apply in Gmail: `label` → add label; `archive` → archive (never possible on
   protected rows); `draft_reply` → create a Gmail **draft**; `create_task` →
   insert into `tasks`.
3. `PATCH …?id=eq.{id}` with `{ "applied_at": "{{$now}}" }` (or `apply_error`).

### cancellation_requests — dual-write from the existing cancellation intake

The live Cancellation Intake workflow adds a POST here alongside the Google
Sheet: `request_type` (`cancellation|pause`), `full_name`, `email`, `phone`,
`membership_type`, `reason`, `preferred_last_date`, `comments`,
`intake_source` (`chatbot|web_form|email|staff_phone`), `source_system:
'n8n_cancellation_intake'`, `source_record_id` (conversation/form id),
`last_synced_at`. Status stays `new` — staff work it in the app.

### supplier_invoices — dual-write from the Supplier Invoice Scanner

`supplier`, `amount`, `gst`, `invoice_reference`, `due_date`, `description`,
`email_link` (Gmail permalink), `source_system: 'gmail_invoice_scanner'`,
`source_record_id` (Gmail message id), `last_synced_at`. Status stays
`pending_review`.

## Phase 4: executing approved actions (the ONLY write-back path)

One n8n workflow (schedule, every ~5–15 min):

1. **Fetch the queue**:
   `GET /rest/v1/action_requests?status=eq.approved&applied_at=is.null&order=approved_at.asc`
2. **For each request**, before executing:
   `PATCH …?id=eq.{id}` `{ "attempt_count": {n+1}, "last_attempt_at": "{{$now}}" }`
3. **Execute** per `action_type` against the target system's supported API:

| action_type | Execution |
|---|---|
| `update_clubworx_contact` | Clubworx API — update contact fields in `payload` on `target_record_id` |
| `create_xero_invoice` | Xero API — create draft invoice from `payload` |
| `create_gmail_draft` | Gmail API — create a **draft** (`payload.to/subject/body`) — never send |
| `apply_gmail_label` | Gmail API — add `payload.label` to `payload.message_id` |
| `archive_email` | Gmail API — archive `payload.message_id` (routine mail only; protected categories never reach this queue) |
| `payment_follow_up_task` | insert into `tasks` |
| `membership_pause_request` | Clubworx/GoCardless API — submit pause per `payload` |
| `membership_cancellation_request` | Clubworx/GoCardless API — submit cancellation per `payload` |
| `refund_request` | GoCardless API — create refund per `payload` |
| `bulk_reminder_send` | Gmail — send the approved reminder batch in `payload` (only after explicit Owner approval) |

4. **Write back the result** (handoff requirement — every field):
   - success: `PATCH …` `{ "status": "applied", "applied_at": "{{$now}}", "api_response": {…} }`
   - failure: `PATCH …` `{ "status": "failed", "error_message": "...", "api_response": {…} }`

   The row already carries requested action, approver, target system and exact
   record; together with the PATCH this satisfies: requested action ✓ approver ✓
   target system ✓ exact record ✓ timestamp ✓ API response ✓ success/failure ✓
   retry state (`attempt_count`, `last_attempt_at`) ✓.

**Never** execute a row whose `status` isn't `approved`. Failed rows are re-queued
only by a human pressing Retry in the app (`failed → approved`, same frozen payload).

## Recommended connector order

1. **Clubworx** (daily schedule): members → `member_source_records` + active
   memberships → `memberships`. This seeds the canonical directory.
2. **GoCardless** (existing webhooks + daily backfill): customers →
   `member_source_records`; subscriptions → `memberships`
   (`billing_provider: 'gocardless'`); payment events → `payment_events`.
3. **Xero** (daily): contacts → `member_source_records`; paid invoices → `payment_events`.
4. **WooCommerce / Square** (existing webhooks): customers → `member_source_records`;
   orders/payments → `payment_events`.

After each sync: an Owner/Ops user opens **Match Queue → Run matcher** in the app
and approves/rejects suggestions. Financial rows attach to members automatically
on approval via `source_customer_id`.

## Guardrail reminders

- Read-only: these contracts only ever INSERT/UPSERT sync data and sync_runs.
- No deletes. If a record disappears at the source, leave the row; set a status
  field in `raw_data` if needed.
- Source system id + `last_synced_at` must always be populated — the UI shows
  them on every record.
