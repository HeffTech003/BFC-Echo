# Workflow 07 — Cancellation Intake — DESIGN (for review)

> Status: **design only**, no JSON built yet. Review the decisions in §5, then I'll build it.

## 1. Goal

Capture every membership **cancellation request**, from whatever channel it arrives, and log
it to a single **Cancellations** sheet for the BFC team to action. Your choices:

- **Channels:** all four — web form, email, chatbot, and phone/staff manual entry.
- **Storage:** a new **Cancellations** tab in the **BFC Echo Tracker** spreadsheet.
- **Alerts:** none — log only (no per-cancellation email).

## 2. Shape: one workflow, three entry points → one normaliser → one sheet

```
[A] Form Trigger  (hosted n8n form)  ─┐
[B] Webhook       (from chatbot)     ─┼─▶ Normalise Cancellation (Code) ─▶ Append to Cancellations (Sheets)
[C] Schedule → Gmail scan → AI       ─┘
```

One workflow can hold several trigger nodes that converge on the same normaliser. Each entry
point produces slightly different data; the **Normalise Cancellation** code maps them all to
the same columns.

### [A] Web form + phone/staff manual entry — n8n **Form Trigger**
A single hosted form URL covers both "member fills it in on the website" and "staff type it
in after a phone call". Fields: Member name, Email, Phone, Membership type (dropdown:
Adult Weekly / Adult Monthly / Youth Weekly / Youth Monthly / Casual), Reason (dropdown +
free text), Requested cancellation date, Notes. You can embed/link the form on the site and
bookmark it for staff. `Source` is set from a hidden field (`Web Form` vs `Staff / Phone`).

### [B] Chatbot — **Webhook** (`/webhook/bfc-cancellation`)
Adds a new AI status to the chat widget so the bot can detect cancellation intent and post
the details here. Requires a small widget change (mirrors the existing logging branches):

- **Prompt:** add a `cancellation_requested` status. When a visitor says they want to cancel,
  the bot collects name + membership type + reason and returns:
  ```json
  { "message": "...", "status": "cancellation_requested",
    "data": { "name":"", "email":"", "phone":"", "membership_type":"", "reason":"", "requested_date":"" } }
  ```
- **Flow:** a new `Cancellation Requested?` IF branch → `Build Cancellation Payload` →
  HTTP POST to `/webhook/bfc-cancellation` → `Respond Chat` (same pattern as Log Issue /
  Log Unknown).

### [C] Email intake — **Schedule (daily 7:05am) → Gmail search → AI extract**
Same pattern as the Supplier Invoice Scanner, deduped by Gmail label `BFC-Cancellation-Logged`:
```
has:attachment=off -from:me newer_than:14d
("cancel my membership" OR "cancel membership" OR cancellation OR "want to cancel" OR "stop my membership")
-label:BFC-Cancellation-Logged
```
→ OpenAI (JSON) extracts member name / email / membership type / reason / requested date /
confidence → normalise → append → label the email.

## 3. Cancellations sheet (new tab in BFC Echo Tracker)

| Column | Notes |
|---|---|
| Date / Time | When logged |
| Source | Web Form · Staff / Phone · Chatbot · Email |
| Member Name | |
| Email | |
| Phone | |
| Membership Type | Adult/Youth Weekly/Monthly, Casual, or unknown |
| Reason | Category and/or free text |
| Requested Cancel Date | If given |
| Summary / Notes | Free text or AI summary |
| Status | Starts `New` for the BFC team |
| Logged By | `Cancellation Intake` |

(Header row must exist before first run — I'll list it exactly in the setup guide.)

## 4. Notes / safety

- **Log only** — the workflow records the request; a human processes the actual cancellation
  (Ezidebit/Clubworx). Nothing is auto-cancelled.
- **Dedupe** on the email path via Gmail label so re-runs can't double-log. Form and chatbot
  paths are event-driven (one submission = one row).
- Consistent with your other trackers: `Status = New`, human owns the outcome.

## 5. Decisions before I build

1. **Form fields** — the set in [A] above OK, or add/remove any (e.g. member ID / DOB)?
2. **Chatbot channel now or later?** Wiring [B] means editing the live chat widget (new prompt
   status + branch). Build it into this workflow now, or ship form + email first and add the
   chatbot branch in a follow-up?
3. **Email keywords** — the list in [C] OK, or tune it? (Broad = catches more, may need the AI
   `confidence` flag to filter noise, same as invoices.)
4. **Membership-type dropdown values** — use the five above (Adult Weekly/Monthly, Youth
   Weekly/Monthly, Casual), or a different list?

"Defaults are fine" works for all four.
