/**
 * POST /api/lead-followup
 *
 * Task #14 — Lead follow-up automation.
 * Two modes:
 *   1. Triggered immediately when a new lead is created (from chatbot, contact form, etc.)
 *   2. Triggered by n8n scheduled job (daily) for cold leads > 3 days with no activity
 *
 * For new leads:
 *   - Sends immediate auto-reply (via n8n) acknowledging their enquiry
 *   - Creates a follow-up task for Kaleb (due 24h)
 *
 * For cold leads (no activity in N days):
 *   - Creates a task for Kaleb to reach out
 *   - Optionally triggers automated nudge email (day 3, 7, 14)
 *
 * Auth: X-Webhook-Secret
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
    lead_id?: string;
    mode?: "new_lead" | "cold_leads";
    cold_threshold_days?: number;
    dry_run?: boolean;
  };

  const { lead_id, mode = "new_lead", cold_threshold_days = 3, dry_run = false } = body;

  const supabase = await createClient();

  if (mode === "new_lead" && lead_id) {
    // Create a task for Kaleb to follow up
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id, full_name, email, phone, source, status, notes")
      .eq("id", lead_id)
      .single();

    if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

    const dueDate = new Date(Date.now() + 24 * 3600000).toISOString();

    if (!dry_run) {
      await supabase.from("staff_tasks").insert({
        title:       `Follow up: ${lead.full_name} (${lead.source ?? "website"})`,
        description: `New lead needs follow-up within 24 hours.\n\nContact: ${lead.email ?? lead.phone ?? "no contact info"}\n\nNotes: ${lead.notes ?? "none"}`,
        priority:    lead.status === "qualified" ? "urgent" : "normal",
        status:      "open",
        due_date:    dueDate,
      });
    }

    // Forward to n8n for auto-reply
    const n8nUrl = process.env.N8N_LEAD_FOLLOWUP_WEBHOOK_URL;
    if (n8nUrl && !dry_run) {
      try {
        await fetch(n8nUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id, name: lead.full_name, email: lead.email, phone: lead.phone, source: lead.source }),
        });
      } catch {}
    }

    return Response.json({ ok: true, task_created: !dry_run, lead_id });
  }

  if (mode === "cold_leads") {
    // Find leads with no update in cold_threshold_days
    const cutoff = new Date(Date.now() - cold_threshold_days * 864e5).toISOString();
    const { data: coldLeads } = await supabase
      .from("crm_leads")
      .select("id, full_name, email, phone, source, created_at")
      .in("status", ["new", "contacted"])
      .lte("updated_at", cutoff)
      .limit(50);

    if (!coldLeads?.length) return Response.json({ ok: true, cold_leads: 0 });

    if (dry_run) {
      return Response.json({ would_followup: coldLeads.length, leads: coldLeads.map((l) => l.email) });
    }

    // Create tasks for each cold lead
    await supabase.from("staff_tasks").insert(
      coldLeads.map((lead) => ({
        title:       `Cold lead follow-up: ${lead.full_name}`,
        description: `This lead has been inactive for ${cold_threshold_days}+ days.\n\nContact: ${lead.email ?? lead.phone ?? "no contact info"}\nSource: ${lead.source ?? "unknown"}\nCreated: ${new Date(lead.created_at).toLocaleDateString("en-AU")}`,
        priority:    "normal",
        status:      "open",
      }))
    );

    // Update lead status to show we've attempted contact
    await supabase.from("crm_leads")
      .update({ status: "contacted", updated_at: new Date().toISOString() })
      .in("id", coldLeads.map((l) => l.id));

    return Response.json({ ok: true, cold_leads: coldLeads.length });
  }

  return Response.json({ error: "Invalid mode" }, { status: 400 });
}
