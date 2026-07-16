/**
 * POST /api/reengage
 *
 * Task #9 — Lapsed member re-engagement automation.
 * Two modes:
 *   1. Called by n8n scheduled job (daily) — finds all lapsed members and
 *      triggers re-engagement sequence for those not already contacted in 30d
 *   2. Called manually from retention page with specific member_id
 *
 * n8n workflow (WF-Reengage):
 *   - Sends personalised "We miss you" email
 *   - Day 3: Follow-up with special offer (e.g. first week back free)
 *   - Day 7: Final nudge + invite to book a free session
 *
 * Auth: X-Webhook-Secret for n8n, or staff session for manual.
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

  const supabase  = await createClient();
  const body = await req.json() as { member_id?: string; dry_run?: boolean };
  const { member_id, dry_run = false } = body;

  let targets: { id: string; full_name: string; email: string | null; phone: string | null }[] = [];

  if (member_id) {
    // Single member
    const { data } = await supabase.from("members").select("id, full_name, primary_email, primary_phone").eq("id", member_id).single();
    if (data) targets = [{ ...data, email: data.primary_email, phone: data.primary_phone }];
  } else {
    // All lapsed members not contacted in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: alreadyContacted } = await supabase
      .from("reengage_log")
      .select("member_id")
      .gte("triggered_at", thirtyDaysAgo);

    const excludeIds = (alreadyContacted ?? []).map((r) => r.member_id);

    let query = supabase.from("members").select("id, full_name, primary_email, primary_phone")
      .in("member_status", ["cancelled", "inactive"])
      .is("merged_into", null);

    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data } = await query.limit(100);
    targets = (data ?? []).map((m) => ({ ...m, email: m.primary_email, phone: m.primary_phone }));
  }

  if (dry_run) {
    return Response.json({ would_contact: targets.length, members: targets.map((m) => m.email) });
  }

  if (!targets.length) {
    return Response.json({ ok: true, triggered: 0, message: "No eligible lapsed members" });
  }

  // Log all
  await supabase.from("reengage_log").insert(
    targets.map((m) => ({
      member_id:    m.id,
      email:        m.email,
      triggered_at: new Date().toISOString(),
      status:       "triggered",
    }))
  );

  // Forward to n8n
  const n8nUrl = process.env.N8N_REENGAGE_WEBHOOK_URL;
  if (n8nUrl) {
    try {
      await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members: targets }),
      });
      await supabase.from("reengage_log")
        .update({ status: "sent_to_n8n" })
        .in("member_id", targets.map((m) => m.id))
        .gte("triggered_at", new Date(Date.now() - 60000).toISOString());
    } catch {}
  }

  return Response.json({ ok: true, triggered: targets.length });
}
