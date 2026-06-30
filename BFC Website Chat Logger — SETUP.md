# BFC Website Chat Logger — Setup Guide

Records and stores the **key details** from chats your website chatbot has, into a
Google Sheet — same pattern as your other BFC Echo trackers.

It is delivered as an n8n workflow (`BFC Website Chat Logger.json`) that exposes a
**webhook**. Your third-party chat widget on https://bendigofightcentre.com sends each
finished conversation to that webhook, and the workflow writes a row to a new
**`Website Chat Log`** tab in your existing **BFC Echo Tracker** spreadsheet.

```
Website chat widget  ──POST──▶  n8n Webhook  ──▶  Extract details  ──▶  Google Sheet row  ──▶  reply {success:true}
```

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
will still scrape out an email/phone. When `status` is `trial_requested`, the row is
marked as a lead with High urgency and "Contact visitor to book / confirm free trial".

---

## One-time setup (≈5 min)

1. **Create the sheet tab.** Open the **BFC Echo Tracker** spreadsheet and add a new tab
   named exactly `Website Chat Log`. Put these headers in row 1 (left → right):

   `Date / Time | Conversation ID | Visitor Name | Email | Phone | Enquiry Topic | Enquiry Summary | Is Lead | Urgency | Recommended Next Action | Page URL | Chatbot / Source | Bot Status | Status | Logged By`

2. **Import the workflow.** In n8n: *Workflows → Import from File →* `BFC Website Chat Logger.json`.

3. **Reconnect the two pickers** (import can't keep them bound):
   - **Append chat to sheet** node → confirm the **Google Sheets** credential
     (`Google Sheets OAuth2 API`), the document **BFC Echo Tracker**, and select the
     **`Website Chat Log`** tab from the dropdown.

4. **Activate** the workflow (toggle top-right). The webhook is then live at:

   ```
   https://n8n-production-eaabe.up.railway.app/webhook/bfc-website-chat-log
   ```

5. **Test it** from a terminal:

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

   You should get `{"success":true,...}` and a new row in the sheet.

---

## Connecting the BFC website widget (custom HTML/JS via WPCode)

The widget already POSTs every message to `/webhook/bfc-public-chat` with a `history`
array, and the AI returns `status: "trial_requested"` + `data:{firstName,lastName,email}`
when a trial is captured. To log a chat, fire a **second** POST to the logger webhook.

**Recommended trigger: log when a trial is captured** (one clean lead row per visitor,
no row-per-message noise). Inside the widget's `sendMessage`, after the AI reply is parsed:

```js
// after you have the AI response object `res` and the running `history` array
if (res.status === "trial_requested") {
  fetch("https://n8n-production-eaabe.up.railway.app/webhook/bfc-website-chat-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId,   // whatever id/session the widget uses
      status: res.status,                // "trial_requested"
      data: res.data,                    // { firstName, lastName, email }
      history: history,                  // full [{role, content}] array
      page_url: location.href,
      chatbot: "BFC Website Chatbot"
    })
  }).catch(() => {});                     // fire-and-forget; never blocks the chat
}
```

The fields map straight onto the sheet — no extra mapping needed. The logger also
auto-fills topic = "Free trial request", Is Lead = Yes, Urgency = High, and the
follow-up action for `trial_requested`.

**Optional: also log a summary at conversation end.** If you'd rather capture every
conversation (not just trials), call the same `fetch` when the chat window closes / goes
idle, sending `{ conversation_id, history, page_url }`. The workflow will scrape any
email/phone from the transcript and mark it a lead only if contact details were found.

CORS is already allowed (`*`) so the browser widget can post directly. To lock it down,
set **Allowed Origins (CORS)** on the webhook node to `https://bendigofightcentre.com`.

---

## Notes

- The workflow reuses your existing **Google Sheets OAuth2** credential and the **BFC Echo
  Tracker** spreadsheet, so it stays consistent with the rest of the BFC Echo system.
- Want Echo to read/summarise these chat logs later? This sheet can be added as a source for
  a future "Website Chat Review Helper" the same way the other tracker helpers work.
