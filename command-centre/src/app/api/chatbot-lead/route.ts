/**
 * POST /api/chatbot-lead
 *
 * Task #11 — Wire website chatbot conversations into Supabase as CRM leads.
 *
 * Called by the BFC website chatbot (via n8n or directly) when a conversation
 * captures contact details or a clear intent to join/enquire.
 *
 * Payload from chatbot:
 *  - name, email, phone (optional)
 *  - intent: "join" | "trial" | "enquiry" | "other"
 *  - conversation_summary: AI-generated summary of the chat
 *  - source: "website_chatbot" | "facebook_messenger" | etc.
 *
 * Creates a CRM lead and optionally triggers the welcome/lead-followup sequence.
 *
 * Auth: N8N_WEBHOOK_SECRET
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret   = process.env.N8N_WEBHOOK_SECRET;
  const incoming = req.headers.get("x-webhook-secret");
  if (secret && incoming !== secret) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    name?: string;
    email?: string;
    phone?: string;
    intent?: "join" | "trial" | "enquiry" | "other";
    conversation_summary?: string;
    source?: string;
    disciplines?: string[];
  };

  const { name, email, phone, intent = "enquiry", conversation_summary, source = "website_chatbot", disciplines } = body;

  if (!email && !phone && !name) {
    return Response.json({ error: "At least one of name, email, or phone required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check for existing lead with same email
  if (email) {
    const { data: existing } = await supabase.from("leads").select("id").eq("email", email).single();
    if (existing) {
      // Update with new conversation info
      await supabase.from("leads").update({
        notes:      conversation_summary ? `Chatbot follow-up: ${conversation_summary}` : undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      return Response.json({ ok: true, lead_id: existing.id, action: "updated_existing" });
    }
  }

  // Create new lead
  const { data: lead, error } = await supabase.from("leads").insert({
    full_name:   name ?? email?.split("@")[0] ?? "Unknown",
    email:       email ?? null,
    phone:       phone ?? null,
    source,
    stage:            "new_enquiry",
    interested_class: disciplines?.join(", ") ?? null,
    notes:            conversation_summary
      ? `Chatbot summary: ${conversation_summary}${disciplines?.length ? `\nInterested in: ${disciplines.join(", ")}` : ""}`
      : `Intent: ${intent}`,
  }).select("id").single();

  if (error || !lead) {
    return Response.json({ error: "Failed to create lead" }, { status: 500 });
  }

  // Trigger lead follow-up if n8n is connected
  const followupUrl = process.env.N8N_LEAD_FOLLOWUP_WEBHOOK_URL;
  if (followupUrl) {
    try {
      await fetch(followupUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, name, email, phone, intent, source }),
      });
    } catch {}
  }

  return Response.json({ ok: true, lead_id: lead.id, action: "created" });
}
