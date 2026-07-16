/**
 * POST /api/campaigns/complete
 *
 * Called by n8n WF-Campaigns after it has finished delivering all recipients.
 * Updates the campaign status from "sending" → "sent" and records the sent count.
 *
 * Auth: X-Webhook-Secret header matching N8N_WEBHOOK_SECRET env var.
 */
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret   = process.env.N8N_WEBHOOK_SECRET;
  const incoming = req.headers.get("x-webhook-secret");
  if (secret && incoming !== secret) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { campaign_id?: string; sent_count?: number };
  const { campaign_id, sent_count } = body;

  if (!campaign_id) {
    return Response.json({ error: "campaign_id required" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  const { error } = await supabase
    .from("campaigns")
    .update({
      status:     "sent",
      sent_at:    new Date().toISOString(),
      sent_count: sent_count ?? 0,
    })
    .eq("id", campaign_id)
    .in("status", ["sending", "queued"]);  // only update if it hasn't already been marked

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Mark all pending sends as sent
  await supabase
    .from("campaign_sends")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("campaign_id", campaign_id)
    .eq("status", "pending");

  return Response.json({ ok: true, campaign_id, sent_count });
}
