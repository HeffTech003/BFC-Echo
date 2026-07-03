# BFC Cancellation Intake (Workflow 07) — Setup

Built to the approved design with your decisions: all four channels, log-only to a new
**Cancellations** sheet (no alert emails), Clubworx membership types, your keyword list,
and the chatbot channel wired **now**.

Files:
- `BFC Cancellation Intake.json` — the new workflow (3 entry points, 15 nodes)
- `BFC Public Chat Widget.json` — **updated** in the same commit: blank-name bug fixed
  **and** the new `cancellation_requested` chatbot branch added

```
[A] Cancellation Form (web + staff/phone) ─▶ Normalise Form ────────────▶ Append Cancellation
[B] Cancellation Webhook (from chatbot)   ─▶ Normalise Chatbot ─▶ Respond ─▶ Append Cancellation
[C] Daily 7:05am ─▶ Search Gmail ─▶ Read Email ─▶ OpenAI extract ─▶ Is Cancellation?
        ├─ yes ─▶ Append Email Cancellation ─▶ Label: Cancellations
        └─ no ──────────────────────────────▶ Label: Cancellations   (flagged, never archived)
```

## Cancellations sheet — create the tab first

In the **BFC Echo Tracker** spreadsheet, add a tab named exactly `Cancellations` with this
header row:

`Date / Time | Source | Member Name | Email | Phone | Membership Type | Reason | Preferred Last Training Date | Comments / Summary | Status | Logged By`

- **Source** will be one of: `Web Form` · `Staff / Phone` · `Chatbot` · `Email`
- **Status** starts as `New` — a human processes the actual cancellation in Clubworx/Ezidebit;
  nothing is ever auto-cancelled.

## Gmail label — create before first run

Create the nested label **`BFC/Memberships/Cancellations`**. Matched emails are labelled and
left in the inbox (**never archived**, per your instruction). The daily search excludes
already-labelled mail, so nothing is processed twice. Search keywords used:
`cancel, cancellation, terminate, "end my membership", "stop membership", leaving, quit,
discontinue, "notice period"` (last 14 days, excluding mail from yourself).

Non-cancellation matches (the AI filters false positives) are **labelled but not logged**,
so they stop being re-scanned without polluting the sheet.

## Import steps

### 1. BFC Cancellation Intake (new workflow)
1. Import `BFC Cancellation Intake.json`.
2. Reconnect credentials/pickers:
   - **Search Cancellation Emails**, **Read Cancellation Email**, **Label: Cancellations** →
     Gmail credential; on **Label: Cancellations** pick `BFC/Memberships/Cancellations`.
   - **Extract Cancellation (OpenAI)** → OpenAI credential.
   - **Append Cancellation** and **Append Email Cancellation** → Google Sheets credential,
     document **BFC Echo Tracker**, tab **Cancellations**.
3. Activate (Unpublish → Publish in the UI per the instance quirk). This registers:
   - the **form** at its Production URL (open the *Cancellation Form* node to copy it —
     link it on the website and bookmark it for staff phone entries; the *Submitted By*
     field distinguishes the two), and
   - the **webhook** at `https://n8n-production-eaabe.up.railway.app/webhook/bfc-cancellation`.

### 2. BFC Public Chat Widget (update the live workflow)
Deploy the updated `BFC Public Chat Widget.json` over `g7mQRlbx7Y6dadsh` (API PUT of
`nodes` + `connections` + `settings: { executionOrder: 'v1' }`, then Unpublish → Publish).
What changed:
- **Bug fix:** `data.firstName`/`data.lastName` → `data.name` in the subject **and body** of
  both *Email Prospect* and *Notify Kaleb Trial Lead* (4 expressions) — welcome emails and
  lead alerts will now show the visitor's name.
- **New branch:** system prompt gains a `cancellation_requested` status (collects name,
  email, phone, membership type, reason, last training date, comments — once per
  conversation, never promises the cancellation is complete), and the flow gains
  `Cancellation Requested? → Build Cancellation Payload → Log Cancellation → Respond Chat`,
  posting to `/webhook/bfc-cancellation`.

## Test checklist

1. **Form:** submit a test via the form URL → row appears with Source `Web Form`.
2. **Chatbot:** on the website, chat "I want to cancel my membership" and answer the bot's
   questions → row with Source `Chatbot`, and the bot's reply mentions the team will confirm.
3. **Email:** send yourself a "please cancel my membership" email from another address, run
   the workflow manually → row with Source `Email` + the label applied.
4. **Trial-email fix:** book a test trial via the chat → welcome email now greets by name.
5. Delete the test rows / emails afterwards.
