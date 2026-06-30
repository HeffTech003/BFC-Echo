# BFC Website Chat Review Helper — Setup

A **callable** n8n helper (same family as your Transaction Tracker Search Helper) that lets
**Echo** read and summarise the **Website Chat Log** sheet — so Kaleb can ask things like
*"any new leads from the website chat?"*, *"what complaints came through the bot?"*, or
*"what questions couldn't the bot answer?"*.

File: `BFC Website Chat Review Helper — callable.json`

```
When Executed by Another Workflow  →  Read Website Chat Log (Google Sheets)  →  Return Chat Review (Code)
```

## What it returns

Read-only. It reads every row of the **Website Chat Log** tab
(`1QZeQ_g1SroWTN8qRE9O-lPz_0VFAB4i9KmCpE5KqX4M`, gid `1686368022`) and returns:

- `total_chats_logged`, `lead_count`, `issue_count`, `unknown_question_count`, `open_items_count`
- `leads[]` — visitors who booked a trial or left contact details (name, email, phone, topic, next action…)
- `issues[]` — complaints / negative sentiment / gaps
- `unknown_questions[]` — questions the bot couldn't answer, for filling knowledge gaps
- `recent[]` — the 15 most recent chats

**Input** `focus` narrows the output: `leads` | `issues` | `unknown_questions` | `all` (default).
`request` is free-text context Echo can pass through.

## Install

1. Import `BFC Website Chat Review Helper — callable.json` (Workflows → Import from File).
2. On **Read Website Chat Log**, confirm the **Google Sheets OAuth2** credential, the
   **BFC Echo Tracker** document, and the **Website Chat Log** tab (By ID, gid `1686368022`).
3. Activate (and Unpublish → Publish in the UI if the instance needs it).

## Register it with Echo

In the **Echo — BFC Command Centre** workflow, add a **Tool Workflow** node (copy an existing
`Call 'BFC … Helper'` node), point its **workflowId** at this new workflow, and give it this
description so Echo knows when to use it:

> Use this read-only tool to review and summarise the BFC website chatbot conversations
> (the Website Chat Log sheet). Use it when Kaleb asks about website chat leads, trial
> requests from the website, complaints or issues raised in the chatbot, or questions the
> bot could not answer. Pass `focus` = leads | issues | unknown_questions | all.

Connect its `ai_tool` output into the Echo agent like the other helper tools.
