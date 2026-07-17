import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

export type TriageResult = {
  category: string;
  priority: "high" | "medium" | "low";
  summary: string;
  suggestedReply: string;
  crmAction: string;
  escalate: boolean;
  tags: string[];
};

const CATEGORIES = [
  "membership_enquiry",
  "trial_class_request",
  "cancellation_request",
  "billing_dispute",
  "injury_complaint",
  "general_enquiry",
  "lead",
  "spam",
  "supplier",
  "compliment",
  "media_press",
  "other",
];

export async function POST(req: NextRequest) {
  try {
    await requireRole(["owner_director", "operations_admin"]);
  } catch {
    return new Response("Unauthorised", { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { subject, body, from } = await req.json() as {
    subject: string;
    body: string;
    from: string;
  };

  const systemPrompt = `You are an email triage AI for Bendigo Fight Centre (BFC), a martial arts gym in Bendigo, Victoria, Australia.

BFC offers BJJ, wrestling, boxing, muay thai, and MMA classes. They have ~130 active members, run two membership tiers (~$70/month casual, ~$90/month unlimited), and use a custom management platform.

Analyse the incoming email and respond with a JSON object (no markdown, no code fences) matching this exact structure:
{
  "category": one of [${CATEGORIES.join(", ")}],
  "priority": "high" | "medium" | "low",
  "summary": "1-2 sentence summary of what this email is about",
  "suggestedReply": "A professional, warm reply in Kaleb's voice as BFC owner — ready to send, no placeholders",
  "crmAction": "Specific CRM action to take, e.g. 'Create lead for John Smith — trial class interest BJJ'",
  "escalate": true if urgent/complaint/legal/injury, false otherwise,
  "tags": ["array", "of", "relevant", "tags"]
}

Priority rules:
- high: injury, complaint, legal threat, cancellation, billing dispute, media
- medium: new lead, trial request, membership enquiry
- low: general question, compliment, supplier, spam`;

  const userContent = `From: ${from}
Subject: ${subject}

${body}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return new Response(errText, { status: res.status });
  }

  const data = await res.json() as { content: { type: string; text: string }[] };
  const text = data.content?.[0]?.text ?? "{}";

  // Strip markdown code fences if the model wraps the JSON
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let parsed: TriageResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return new Response(JSON.stringify({ error: "AI response malformed", raw: text }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json" },
  });
}
