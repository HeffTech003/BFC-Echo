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
| Status | Starts as `New` for the BFC team to work |
| Logged By | Always `Website Chat Logger` |

The field-matching is deliberately flexible — it reads common alternative names
(`visitor_email`/`email`, `session_id`/`conversation_id`, `messages[]`, etc.), and if
the widget only sends a transcript it will still scrape out an email/phone.

---

## One-time setup (≈5 min)

1. **Create the sheet tab.** Open the **BFC Echo Tracker** spreadsheet and add a new tab
   named exactly `Website Chat Log`. Put these headers in row 1 (left → right):

   `Date / Time | Conversation ID | Visitor Name | Email | Phone | Enquiry Topic | Enquiry Summary | Is Lead | Urgency | Recommended Next Action | Page URL | Chatbot / Source | Status | Logged By`

2. **Import the workflow.** In n8n: *Workflows → Import from File →* `BFC Website Chat Logger.json`.

3. **Reconnect the two pickers** (import can't keep them bound):
   - **Append chat to sheet** node → confirm the **Google Sheets** credential
     (`Google Sheets OAuth2 API`), the document **BFC Echo Tracker**, and select the
     **`Website Chat Log`** tab from the dropdown.

4. **Activate** the workflow (toggle top-right). Open the **Website Chat Webhook** node and
   copy the **Production URL** — it looks like:

   ```
   https://<your-n8n-host>/webhook/bfc-website-chat-log
   ```

5. **Test it** from a terminal:

   ```bash
   curl -X POST https://<your-n8n-host>/webhook/bfc-website-chat-log \
     -H "Content-Type: application/json" \
     -d '{
       "conversation_id":"test-1",
       "name":"Test Visitor",
       "email":"test@example.com",
       "phone":"0400 000 000",
       "topic":"Membership enquiry",
       "summary":"Asked about junior muay thai pricing",
       "page_url":"https://bendigofightcentre.com/memberships"
     }'
   ```

   You should get `{"success":true,...}` and a new row in the sheet.

---

## Connecting your chat widget

Send a single `POST` (JSON) to the webhook when a conversation ends (or when a contact
detail is captured). Minimum useful payload:

```json
{
  "conversation_id": "abc-123",
  "name": "Jordan",
  "email": "jordan@example.com",
  "phone": "0400 000 000",
  "topic": "Membership enquiry",
  "summary": "Wants junior class times and pricing",
  "page_url": "https://bendigofightcentre.com/memberships"
}
```

You can instead send the whole conversation and let the workflow do the extraction:

```json
{
  "conversation_id": "abc-123",
  "messages": [
    {"role": "visitor", "text": "How much for kids muay thai?"},
    {"role": "bot",     "text": "Junior is $X/week — your name & email?"},
    {"role": "visitor", "text": "Jordan, jordan@example.com"}
  ],
  "page_url": "https://bendigofightcentre.com/memberships"
}
```

### Per-platform pointers

- **Tidio / Crisp / Intercom / tawk.to / Chatbase / Voiceflow / Botpress, etc.** — use the
  vendor's *Webhook* / *Outbound integration* (sometimes called "Zapier/Make/HTTP" or
  "post-chat webhook"). Paste the webhook URL above and map the fields you collect to the
  JSON keys listed in *What gets captured*.
- **No native webhook?** Route it through Zapier/Make: trigger = "new conversation/lead in
  <widget>", action = "Webhook POST" to the URL above.
- **Custom JS chat widget** — drop this in at the end of a conversation:

  ```html
  <script>
  function logBfcChat(details) {
    return fetch("https://<your-n8n-host>/webhook/bfc-website-chat-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details)
    });
  }
  // e.g. logBfcChat({ conversation_id, name, email, phone, topic, summary,
  //                   page_url: location.href });
  </script>
  ```

CORS is already allowed (`*`) so a browser widget can post directly. If you prefer to lock
it down, set **Allowed Origins (CORS)** on the webhook node to
`https://bendigofightcentre.com`.

---

## Notes

- The workflow reuses your existing **Google Sheets OAuth2** credential and the **BFC Echo
  Tracker** spreadsheet, so it stays consistent with the rest of the BFC Echo system.
- Want Echo to read/summarise these chat logs later? This sheet can be added as a source for
  a future "Website Chat Review Helper" the same way the other tracker helpers work.
