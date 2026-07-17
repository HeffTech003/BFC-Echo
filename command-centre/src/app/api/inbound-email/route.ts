/**
 * POST /api/inbound-email
 *
 * Webhook endpoint called by n8n (WF-Email-Triage workflow) when a new email
 * arrives in the BFC Gmail inbox.
 *
 * n8n workflow steps:
 *  1. Gmail trigger (new email in inbox)
 *  2. HTTP Request → POST /api/inbound-email  ← this endpoint
 *  3. This endpoint: calls Anthropic AI to classify + draft reply
 *  4. Saves result to email_triage_log table
 *  5. Returns classification — n8n routes based on it:
 *     - priority=high OR escalate=true → Slack notification to Kaleb
 *     - category=lead → creates CRM lead
 *     - category=trial_class_request → creates CRM lead + sends auto-reply
 *     - category=cancellation_request → creates task for Kaleb to handle
 *
 * Auth: n8n must send X-Webhook-Secret header matching N8N_WEBHOOK_SECRET env var
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TriageResult } from "@/app/api/email-triage/route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (secret) {
    const incoming = req.headers.get("x-webhook-secret");
    if (incoming !== secret) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const body = await req.json() as {
    from: string;
    subject: string;
    body: string;
    message_id?: string;
    thread_id?: string;
    received_at?: string;
  };

  const { from, subject, body: emailBody, message_id, thread_id, received_at } = body;

  // ── Call AI triage ──────────────────────────────────────────────────────────
  const CATEGORIES = ["membership_enquiry","trial_class_request","cancellation_request","billing_dispute","injury_complaint","general_enquiry","lead","spam","supplier","compliment","media_press","other"];

  const systemPrompt = `You are an email triage AI for Bendigo Fight Centre (BFC), a martial arts gym in Bendigo, Victoria.
Analyse the email and respond with a JSON object (no markdown, no code fences):
{
  "category": one of [${CATEGORIES.join(", ")}],
  "priority": "high" | "medium" | "low",
  "summary": "1-2 sentences",
  "suggestedReply": "professional reply ready to send",
  "crmAction": "specific CRM action",
  "escalate": boolean,
  "tags": ["array","of","tags"]
}
Priority: high = injury/complaint/legal/cancellation/billing; medium = new lead/trial; low = general/spam/supplier`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: `From: ${from}\nSubject: ${subject}\n\n${emailBody}` }],
    }),
  });

  let triage: TriageResult | null = null;
  if (aiRes.ok) {
    const aiData = await aiRes.json() as { content: { type: string; text: string }[] };
    try { triage = JSON.parse(aiData.content?.[0]?.text ?? "{}"); } catch {}
  }

  // ── Save to email_triage_log ─────────────────────────────────────────────────
  const supabase = await createClient();

  const { data: logRow } = await supabase.from("email_triage_log").insert({
    from_address:   from,
    subject,
    body_preview:   emailBody.slice(0, 500),
    message_id:     message_id ?? null,
    thread_id:      thread_id ?? null,
    received_at:    received_at ?? new Date().toISOString(),
    category:       triage?.category ?? "other",
    priority:       triage?.priority ?? "low",
    summary:        triage?.summary ?? null,
    suggested_reply: triage?.suggestedReply ?? null,
    crm_action:     triage?.crmAction ?? null,
    escalate:       triage?.escalate ?? false,
    tags:           triage?.tags ?? [],
    ai_raw:         triage as unknown as Record<string, unknown>,
  }).select("id").single();

  // ── Auto-actions ────────────────────────────────────────────────────────────
  // Create CRM lead for lead/trial_class_request
  if (triage && ["lead", "trial_class_request"].includes(triage.category)) {
    await supabase.from("leads").insert({
      full_name:   from.split("@")[0].replace(/[._]/g, " "),
      email:       from,
      source:      "email_inbound",
      stage:       "new_enquiry",
      notes:       `Auto-created from email: ${subject}\n\n${triage.summary}`,
    }).single();
  }

  // Create task for cancellation/billing/injury
  if (triage && ["cancellation_request", "billing_dispute", "injury_complaint"].includes(triage.category)) {
    await supabase.from("tasks").insert({
      title:       `[${triage.category.replace(/_/g, " ")}] Email from ${from}`,
      description: `${triage.summary}\n\nSuggested reply drafted — check email triage log.\n\nCRM action: ${triage.crmAction}`,
      priority:    triage.priority === "high" ? "urgent" : "normal",
      status:      "open",
    });
  }

  return Response.json({
    ok: true,
    log_id:   logRow?.id,
    category: triage?.category,
    priority: triage?.priority,
    escalate: triage?.escalate,
  });
}
