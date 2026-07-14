/**
 * POST /api/welcome-sequence
 *
 * Triggers the automated welcome email sequence for a new member.
 * Called by:
 *   - /join/actions.ts (submitJoinForm) after successful Stripe checkout
 *   - n8n WF-New-Member trigger (Stripe webhook → n8n → here)
 *   - Manual trigger from member profile page
 *
 * Welcome sequence (sent via n8n WF-Welcome):
 *   Day 0:  Welcome email with first class booking link
 *   Day 2:  "How was your first class?" check-in
 *   Day 7:  Timetable + schedule reminder
 *   Day 14: Community intro (social media, Discord, etc.)
 *   Day 30: 30-day check-in + ask for Google review
 *
 * n8n workflow receives member_id and handles the delay + send logic.
 * Auth: X-Webhook-Secret OR authenticated user (for manual trigger).
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Allow both webhook (n8n) and internal server calls
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const incoming = req.headers.get("x-webhook-secret");
  const isWebhook = secret && incoming === secret;

  if (!isWebhook) {
    // Must be an authenticated internal call — check auth header or cookie
    // For now allow if called from same origin (server action)
    const origin = req.headers.get("origin");
    const host   = req.headers.get("host");
    if (origin && host && !origin.includes(host)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json() as {
    member_id: string;
    email?: string;
    name?: string;
    plan?: string;
  };

  const { member_id, email, name, plan } = body;
  if (!member_id) return Response.json({ error: "member_id required" }, { status: 400 });

  const supabase = await createClient();

  // Fetch member if details not provided
  let memberEmail = email;
  let memberName  = name;
  if (!memberEmail || !memberName) {
    const { data: member } = await supabase
      .from("members")
      .select("email, full_name")
      .eq("id", member_id)
      .single();
    memberEmail = memberEmail ?? member?.email;
    memberName  = memberName ?? member?.full_name;
  }

  if (!memberEmail) {
    return Response.json({ error: "Member email not found" }, { status: 404 });
  }

  // Log the sequence trigger
  await supabase.from("welcome_sequence_log").insert({
    member_id,
    email: memberEmail,
    name:  memberName,
    plan:  plan ?? null,
    triggered_at: new Date().toISOString(),
    status: "triggered",
  });

  // Forward to n8n if webhook URL is configured
  const n8nUrl = process.env.N8N_WELCOME_WEBHOOK_URL;
  if (n8nUrl) {
    try {
      await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id, email: memberEmail, name: memberName, plan }),
      });
      await supabase.from("welcome_sequence_log")
        .update({ status: "sent_to_n8n" })
        .eq("member_id", member_id)
        .order("triggered_at", { ascending: false })
        .limit(1);
    } catch (err) {
      await supabase.from("welcome_sequence_log")
        .update({ status: "n8n_error", error: String(err) })
        .eq("member_id", member_id)
        .order("triggered_at", { ascending: false })
        .limit(1);
    }
  } else {
    // Queue for when n8n is connected
    await supabase.from("welcome_sequence_log")
      .update({ status: "queued_no_n8n" })
      .eq("member_id", member_id)
      .order("triggered_at", { ascending: false })
      .limit(1);
  }

  return Response.json({ ok: true, member_id, email: memberEmail });
}
