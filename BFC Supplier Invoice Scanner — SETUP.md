# BFC Supplier Invoice Scanner (Workflow 06) — Setup

Built to the approved design with your choices: **daily 7:00am**, **keyword search**,
**auto-record as "Pending Review"** (never auto-approved), **no Xero**, and a **daily digest
email to bendigofightcentre@gmail.com**.

File: `BFC Supplier Invoice Scanner.json`

```
Daily 7am
  → Search Invoice Emails (Gmail)
  → Read Attachment (→ Email Attachment Reader V2)
  → Build Extraction Input (Code)
  → Extract Invoice Fields (OpenAI, JSON)
  → Parse & Map Invoice (Code)
  → Record Invoice (→ Transaction Tracker Helper)   ← status: Pending Review
  → Needs Review?  ──true──▶ Label "Needs Review" ─┐
                   ──false─▶ Label "Logged"        ─┴▶ Collect Row
  → Aggregate Results → Build Digest → Send Daily Digest (Gmail → bendigofightcentre@gmail.com)
```

## What it does

1. **7:00am daily**, searches Gmail for likely invoices:
   `has:attachment -from:me newer_than:14d (invoice OR "tax invoice" OR "amount due" OR statement OR remittance OR bill) -label:BFC-Invoice-Logged -label:BFC-Invoice-Review`
2. For each, calls your **Email Attachment Reader V2** (`1uDZbaWBflxm68Oe`) to pull the
   attachment text, then asks OpenAI (`gpt-4o`, JSON output) for supplier / amount / due date /
   invoice number / GST / confidence.
3. **Records every invoice** into the **BFC Transaction Tracker** (via the Tracker Helper
   `5YPKMF7lDOli3niB`) as `money out`, `tracker_status = Pending Review`,
   `human_payment_status = not confirmed`. It **never pays or confirms** anything — Kaleb
   confirms before paying. Amounts are never invented; unreadable invoices are recorded at
   `risk_level = medium` with a "needs manual read" note.
4. **Labels the email** so it's logged exactly once (dedupe) and never reprocessed.
5. **Sends one digest** at the end to bendigofightcentre@gmail.com listing what was recorded.
   (If nothing matched, no email is sent.)

## One-time setup

1. **Create two Gmail labels** (exact names): `BFC-Invoice-Logged` and `BFC-Invoice-Review`.
   The search query excludes them, so labelling is what prevents duplicates.
2. **Import** `BFC Supplier Invoice Scanner.json` (Workflows → Import from File).
3. **Reconnect on import** (n8n drops some bindings):
   - **Search Invoice Emails**, **Label: Needs Review**, **Label: Logged**, **Send Daily
     Digest** → confirm the **Gmail OAuth2** credential. On the two **Label** nodes, pick the
     matching label (`BFC-Invoice-Review` / `BFC-Invoice-Logged`) in *Label Names or IDs*.
   - **Extract Invoice Fields (OpenAI)** → confirm the **OpenAI** credential
     (predefined credential type → OpenAI account).
   - **Read Attachment** → workflow = *BFC Email Attachment Reader Helper V2*.
   - **Record Invoice** → workflow = *BFC Transaction Tracker Helper — callable*.
4. **Test once manually:** open the workflow and click **Execute Workflow**. Check that any
   matching invoice lands in the Transaction Tracker with status **Pending Review**, the email
   gets a label, and a digest arrives at bendigofightcentre@gmail.com. Delete any test rows.
5. **Activate** (and Unpublish → Publish in the UI so the schedule registers).

## Tuning notes

- **Keyword breadth:** the query is broad on purpose; if it catches the odd non-invoice, the
  AI sets `confidence: low` and it's filed under *Needs Review* rather than treated as a clean
  invoice — nothing is lost, but you can tighten the keywords or add a supplier sender list
  later (`from:(billing@x.com OR accounts@y.com ...)`).
- **`newer_than:14d`** is just a safety bound so the very first run doesn't sweep your whole
  history; the labels are what actually prevent duplicates. Widen it for a one-off backfill.
- **Volume:** capped at 25 messages/run (`limit`). Raise if a daily batch is ever larger.

## Not included (by your call)

- **Xero matching** — `xero_match` is written as `not checked`. Your Payment Review Helper
  already has a Xero tool we can wire in later when you want it.
