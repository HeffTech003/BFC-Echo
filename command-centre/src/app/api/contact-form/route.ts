/**
 * POST /api/contact-form
 *
 * Task #12 — Wire website contact forms and trial sign-ups into CRM leads.
 *
 * Called by the BFC website (WordPress/Webflow/etc.) when someone submits:
 *   - Contact form
 *   - Trial class sign-up form
 *   - "Book a free session" form
 *
 * Creates a CRM lead and triggers lead follow-up automation.
 *
 * Can be called directly from the website (no auth needed — rate limit via
 * Vercel Edge or cloudflare) OR via n8n with webhook secret.
 *
 * CORS: Set NEXT_PUBLIC_WEBSITE_ORIGIN env var (e.g. https://bendigofightcentre.com.au)
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_ORIGINS = [
  "https://bendigofightcentre.com.au",
  "https://www.bendigofightcentre.com.au",
];

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) || process.env.NODE_ENV === "development";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(req: NextRequest) {
  const origin  = req.headers.get("origin") ?? "";
  const secret  = process.env.N8N_WEBHOOK_SECRET;
  const incoming = req.headers.get("x-webhook-secret");
  const isN8n   = secret && incoming === secret;
  const isSite  = ALLOWED_ORIGINS.includes(origin);

  if (!isN8n && !isSite && process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    name: string;
    email?: string;
    phone?: string;
    message?: string;
    form_type?: "contact" | "trial" | "book_session" | "other";
    disciplines?: string[];
    preferred_time?: string;
    referral_source?: string;
  };

  const {
    name, email, phone, message,
    form_type = "contact",
    disciplines,
    preferred_time,
    referral_source,
  } = body;

  if (!name) return Response.json({ error: "Name required" }, { status: 400 });

  const supabase = await createClient();

  // Dedup by email
  if (email) {
    const { data: existing } = await supabase.from("leads").select("id, stage").eq("email", email).single();
    if (existing) {
      if (existing.stage === "new_enquiry") {
        await supabase.from("leads").update({
          notes: `Website re-submission (${form_type}): ${message ?? ""}`,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      }
      return Response.json({ ok: true, lead_id: existing.id, action: "deduped" });
    }
  }

  const notes = [
    message,
    preferred_time  ? `Preferred time: ${preferred_time}` : null,
    disciplines?.length ? `Interested in: ${disciplines.join(", ")}` : null,
    referral_source ? `Heard about us: ${referral_source}` : null,
  ].filter(Boolean).join("\n");

  const { data: lead, error } = await supabase.from("leads").insert({
    full_name:        name,
    email:            email ?? null,
    phone:            phone ?? null,
    source:           `website_${form_type}`,
    stage:            form_type === "trial" || form_type === "book_session" ? "trial_booked" : "new_enquiry",
    interested_class: disciplines?.join(", ") ?? null,
    notes:            notes || null,
  }).select("id").single();

  if (error || !lead) {
    return Response.json({ error: "Failed to create lead" }, { status: 500 });
  }

  // Trigger lead follow-up
  const followupUrl = process.env.N8N_LEAD_FOLLOWUP_WEBHOOK_URL;
  if (followupUrl) {
    try {
      await fetch(followupUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, name, email, phone, form_type, source: `website_${form_type}` }),
      });
    } catch {}
  }

  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return Response.json(
    { ok: true, lead_id: lead.id },
    { headers: { "Access-Control-Allow-Origin": corsOrigin } }
  );
}
