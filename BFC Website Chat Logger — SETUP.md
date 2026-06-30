# BFC Website Chat Logger — Setup Guide

Records and stores the **key details** from chats the BFC website chatbot has, into a
Google Sheet — same pattern as your other BFC Echo trackers.

> **Status (live):** Deployed on the Railway n8n instance as **BFC Website Chat Logger**
> (`taoaVYdeSWu2h9rW`). The main **BFC Public Chat Widget** workflow (`g7mQRlbx7Y6dadsh`)
> calls this logger directly — there is no extra widget-side JS to add. This repo copy is a
> version-controlled backup of that live workflow; re-import it to restore.

It is an n8n workflow (`BFC Website Chat Logger.json`) that exposes a **webhook**. The chat
widget workflow POSTs to it whenever the AI returns a loggable status, and the workflow
writes a row to the **`Website Chat Log`** tab of the **BFC Echo Tracker** spreadsheet.

```
BFC Public Chat Widget workflow  ──POST──▶  Logger Webhook  ──▶  Extract details  ──▶  Google Sheet row  ──▶  reply {success:true}
```

**Logged statuses** (the AI sets these; `in_progress` is never logged):

| status | When | How it's logged |
|---|---|---|
| `trial_requested` | Visitor books a free trial | Lead = Yes, Urgency = High, also triggers the prospect + Kaleb emails |
| `issue_detected` | Complaint / negative sentiment / gap | Urgency = High |
| `unknown_question` | Bot couldn't answer | Logged so Kaleb can fill the knowledge gap in the system prompt |

---

## What gets captured

| Column | Meaning |
|---|---|
| Date / Time | When the chat was logged |
| Conversation ID | The widget's chat/session id |
| Visitor Name | Name the visitor gave |
| Email | Visitor email (auto-detected from the chat if not supplied) |
| Phone | Visitor phone (auto-detected from the chat if not supplied) |
| Enquiry Topic | What it was about (membership, classes, pricing, trial…) |
| Enquiry Summary | Short summary / last message / transcript snippet |
| Is Lead | `Yes` if any contact detail was captured, else `No` |
| Urgency | `Normal` unless the widget sends a priority |
| Recommended Next Action | e.g. "Follow up with visitor" |
| Page URL | The page the chat happened on |
| Chatbot / Source | Which widget sent it |
| Bot Status | The widget's status flag, e.g. `trial_requested` |
| Status | Starts as `New` for the BFC team to work |
| Logged By | Always `Website Chat Logger` |

The field-matching is deliberately flexible — it reads common alternative names
(`visitor_email`/`email`, `session_id`/`conversation_id`, `history[]`/`messages[]`,
and the AI's `data:{firstName,lastName,email}`), and if only a transcript is sent it
will still scrape out an email/phone. `trial_requested` and `issue_detected` are marked
High urgency; each status gets a sensible topic and recommended next action.

---

## How it's wired (live)

The logging is done **server-side inside the BFC Public Chat Widget workflow** — there is
no extra JavaScript in the WordPress widget. The widget posts each message to the chat
workflow (`/webhook/bfc-public-chat`); the workflow asks OpenAI for a reply, and when the
AI returns a loggable `status` it builds a payload and POSTs it to this logger:

```
BFC Public Chat Widget (g7mQRlbx7Y6dadsh)
  └─ Trial Requested?  ──true──▶ Build Trial Payload   ─▶ Log Trial   ─┐
  └─ Unknown Question? ──true──▶ Build Unknown Payload ─▶ Log Unknown ─┼─▶  POST  ──▶  this logger
  └─ Issue Detected?   ──true──▶ Build Issue Payload   ─▶ Log Issue   ─┘
```

Logger webhook: `https://n8n-production-eaabe.up.railway.app/webhook/bfc-website-chat-log`

### Sheet target (live config)

- Spreadsheet: **BFC Echo Tracker** — `1QZeQ_g1SroWTN8qRE9O-lPz_0VFAB4i9KmCpE5KqX4M`
- Tab: **Website Chat Log** — gid `1686368022`, selected in the Google Sheets node using
  **By ID** mode (numeric gid), not the name dropdown.

---

## Restoring / re-importing this backup

This repo file mirrors the live `taoaVYdeSWu2h9rW` workflow. To restore it:

1. In n8n: *Workflows → Import from File →* `BFC Website Chat Logger.json`.
2. On the **Append chat to sheet** node, re-select the **Google Sheets OAuth2** credential,
   the **BFC Echo Tracker** document, and the **Website Chat Log** tab (By ID, gid `1686368022`).
3. Activate. Per the instance's quirk, after any API `PUT` you must **Unpublish → Publish in
   the UI** to re-register the webhook (the API activate/deactivate endpoints return 403).

### Manual test (run from a machine that can reach the n8n host)

```bash
curl -X POST https://n8n-production-eaabe.up.railway.app/webhook/bfc-website-chat-log \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id":"test-1",
    "status":"trial_requested",
    "data":{"firstName":"Test","lastName":"Visitor","email":"test@example.com"},
    "history":[
      {"role":"user","content":"Can I do a free trial for kids muay thai?"},
      {"role":"assistant","content":"Sure! Can I grab your name and email?"}
    ],
    "page_url":"https://bendigofightcentre.com/"
  }'
```

Expect `{"success":true,...}` and a new row in the sheet. (Delete the test row afterwards.)

> Note: CORS is allowed (`*`) on the webhook so a browser could post directly, but the live
> design posts from the chat workflow server-side, which is the safer path.

---

## Notes

- The workflow reuses your existing **Google Sheets OAuth2** credential and the **BFC Echo
  Tracker** spreadsheet, so it stays consistent with the rest of the BFC Echo system.
- Want Echo to read/summarise these chat logs later? This sheet can be added as a source for
  a future "Website Chat Review Helper" the same way the other tracker helpers work.
