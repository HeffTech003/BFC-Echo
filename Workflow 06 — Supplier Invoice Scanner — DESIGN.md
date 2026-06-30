# Workflow 06 — Supplier Invoice Scanner — DESIGN (for review)

> Status: **design only**, no JSON built yet. Review the decisions in §6, then I'll build
> the importable workflow + setup guide.

## 1. Goal

Automatically find supplier **invoices** arriving in the BFC Gmail inbox, read the
attachment, extract the key figures (supplier, amount, due date, invoice number), and
record each one into the **BFC Transaction Tracker** as an unconfirmed "money out" item for
the BFC team to action — without double-logging the same invoice.

This reuses what already exists rather than rebuilding it:

| Reused piece | Workflow ID | Role here |
|---|---|---|
| BFC Email Attachment Reader Helper V2 — PDF Extraction | `1uDZbaWBflxm68Oe` | Given a `message_id`, returns the attachment's extracted text/rows (PDF + CSV) |
| BFC Transaction Tracker Helper — callable | `5YPKMF7lDOli3niB` | Appends a row to the Transaction Tracker sheet |
| BFC Transaction Tracker (sheet) | doc `1jsgEPyi1RucoYE-Bf5Se_ov5fp3eAvAuFebrr-bM8gk`, tab `Transaction Tracker` (gid `1186645540`) | Where invoices land |

## 2. Trigger & dedupe strategy

- **Trigger:** `Schedule Trigger` — once daily (proposed 7:00am). Simple, predictable, and
  cheap. (A Gmail Trigger for near-real-time is possible later; polling daily is plenty for
  supplier invoices.)
- **Dedupe by Gmail label** (more reliable than a date window): the scan only looks at mail
  **without** the label `BFC/Invoice-Logged`, and applies that label after a successful
  record. So an invoice is logged exactly once even if the workflow runs repeatedly.

## 3. Node-by-node flow

```
Schedule Trigger (daily 7:00am)
  → Search Invoice Emails (Gmail: getAll, q=...)         ← finds candidate invoice emails
  → Filter / Split Out (one item per message)
  → Read Attachment  (Execute Workflow → Reader V2, message_id)   ← extracted invoice text
  → Extract Invoice Fields (OpenAI, JSON output)         ← supplier, amount, due date, etc.
  → Confident & has amount?  (IF)
        TRUE  → Record to Transaction Tracker (Execute Workflow → Tracker Helper)
                  → Label Email "BFC/Invoice-Logged" (Gmail)
        FALSE → Record as "Needs human review" (Tracker Helper, low confidence)
                  → Label Email "BFC/Invoice-Review" (Gmail)
  → (optional) Notify Kaleb — daily digest of invoices found (Gmail)
```

### 3.1 Search Invoice Emails (Gmail · getAll)
Search query (tunable in §6):
```
has:attachment -from:me -label:BFC/Invoice-Logged -label:BFC/Invoice-Review newer_than:14d
(invoice OR "tax invoice" OR "amount due" OR statement OR "remittance" OR "bill")
```
Returns message ids + basic headers (from, subject, date). `Simplify` on so we get sender/subject.

### 3.2 Read Attachment (Execute Workflow → Reader V2)
Pass `message_id` = the Gmail message id. Reader V2 returns the extracted attachment text
(or a "no readable text" signal — handled as low-confidence below).

### 3.3 Extract Invoice Fields (OpenAI · `response_format: json_object`)
System prompt (draft):
> You extract structured data from a supplier invoice for Bendigo Fight Centre. Given the
> email sender/subject and the extracted attachment text, return JSON only:
> `{ "supplier": "", "amount": "", "currency": "AUD", "gst": "", "due_date": "",
> "invoice_number": "", "description": "", "confidence": "high|medium|low",
> "reason_if_unsure": "" }`.
> If the text is empty/unreadable or it is clearly not an invoice, set confidence "low".
> Never invent an amount — leave it blank if not clearly stated.

### 3.4 Confident & has amount? (IF)
`confidence != low` **and** `amount` is non-empty → record path; else review path.

### 3.5 Record to Transaction Tracker (Execute Workflow → Tracker Helper)
Field mapping into the Tracker Helper inputs:

| Tracker input | Value |
|---|---|
| `transaction_type` | `supplier invoice` |
| `direction` | `money out` |
| `supplier_or_customer` | `{{ supplier }}` (fallback: email sender) |
| `amount` | `{{ amount }}` |
| `due_date` | `{{ due_date }}` |
| `invoice_or_reference` | `{{ invoice_number }}` |
| `source_system` | `Gmail / Supplier Invoice Scanner` |
| `evidence_summary` | short summary: supplier, amount, due date, subject |
| `xero_match` | `not checked` |
| `attachment_status` | `read` / `no readable text` |
| `ai_payment_status` | `invoice received; payment not confirmed` |
| `human_payment_status` | `not confirmed` |
| `risk_level` | `low` normally; `medium` if due within 3 days or amount unreadable |
| `recommended_next_action` | `BFC Team to verify invoice and schedule/confirm payment.` |
| `tracker_status` | `Waiting for BFC Team` |
| `notes` | confidence + `reason_if_unsure` if any |
| `source_id_or_link` | Gmail permalink / message id (also used for traceability) |

The **review path** records the same row with `risk_level=medium`,
`tracker_status="Waiting for BFC Team — needs manual read"`, and notes explaining why
extraction was uncertain — so nothing is silently dropped.

### 3.6 Label the email
Apply `BFC/Invoice-Logged` (or `BFC/Invoice-Review`) so it's never reprocessed and is easy
to find in Gmail.

### 3.7 (Optional) Notify Kaleb
A single daily digest email: "N supplier invoices logged today" with supplier/amount/due
lines and a link to the Transaction Tracker. Skips sending if nothing was found.

## 4. Why this stays safe

- It **never pays anything** and never marks anything confirmed — every row lands as
  `Waiting for BFC Team` / `not confirmed`, consistent with how Echo's tracker is meant to
  work (humans decide).
- Amounts are never invented; unreadable invoices are flagged, not guessed.
- Dedupe-by-label means re-runs can't create duplicate rows.

## 5. Credentials needed (already in your instance)
- Gmail OAuth (the re-authenticated BFC credential)
- OpenAI (as used by the chat widget / Payment Review)
- Google Sheets OAuth2 (`CaoKD3EXIAUsqClz`) — used indirectly via the Tracker Helper

## 6. Decisions I need from you before building

1. **Schedule:** daily 7:00am OK, or a different time / frequency?
2. **Sender scope:** scan all `has:attachment` mail matching the invoice keywords, or
   restrict to a known supplier sender list (give me the addresses/domains)? Keyword-only is
   broader but may catch the odd non-invoice; a sender list is precise but needs maintaining.
3. **Auto-record vs approve-first:** record straight into the Tracker as "Waiting for BFC
   Team" (recommended — that's already a review state), or hold extracted invoices somewhere
   for Kaleb to approve before they hit the Tracker?
4. **Xero matching:** leave `xero_match = not checked` for now, or also look the invoice up
   in Xero during the scan (your Payment Review Helper already has a Xero tool we could
   reuse)?
5. **Digest email:** want the optional daily "invoices found" email to Kaleb, or rely on the
   Tracker + Echo only?

Answer these (even just "defaults are fine") and I'll build the importable JSON + setup guide.
