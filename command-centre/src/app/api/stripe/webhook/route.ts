/**
 * Stripe webhook handler — /api/stripe/webhook
 * Configure in Stripe Dashboard → Webhooks → Add endpoint:
 *   URL: https://bfc-echo.vercel.app/api/stripe/webhook
 *   Events: customer.subscription.created/updated/deleted,
 *           invoice.payment_succeeded, invoice.payment_failed
 * NEVER put credentials in code. Set STRIPE_WEBHOOK_SECRET in Vercel env vars.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WEBHOOK_SECRET    = process.env.STRIPE_WEBHOOK_SECRET;

async function verifyStripe(body: string, sig: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false;
  const enc   = new TextEncoder();
  const parts = sig.split(",");
  const ts    = parts.find(p => p.startsWith("t="))?.slice(2);
  const v1    = parts.find(p => p.startsWith("v1="))?.slice(3);
  if (!ts || !v1) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2,"0")).join("");
  return hex === v1;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";
  if (!await verifyStripe(body, sig))
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  const event   = JSON.parse(body) as { id: string; type: string; data: { object: Record<string,unknown> } };
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  // Idempotency check
  const { data: seen } = await supabase.from("stripe_webhook_events").select("id").eq("id", event.id).single();
  if (seen) return NextResponse.json({ ok: true, skipped: true });
  await supabase.from("stripe_webhook_events").insert({ id: event.id, event_type: event.type, data: event.data });

  const obj = event.data.object;

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const customerId = obj.customer as string;
    const { data: member } = await supabase.from("members").select("id").eq("stripe_customer_id", customerId).single();
    const items = (obj.items as { data: { price: { nickname?: string; unit_amount?: number; recurring?: { interval: string } } }[] })?.data ?? [];
    const price = items[0]?.price;
    await supabase.from("memberships").upsert({
      source_record_id: obj.id as string,
      billing_provider: "stripe",
      member_id:        member?.id ?? null,
      status:           obj.status === "active" ? "active" : "inactive",
      plan_name:        price?.nickname ?? "Stripe subscription",
      amount:           price?.unit_amount ?? null,
      currency:         ((obj.currency as string) ?? "aud").toUpperCase(),
      billing_interval: price?.recurring?.interval ?? null,
      raw_data:         obj,
      last_synced_at:   new Date().toISOString(),
    }, { onConflict: "source_record_id" });
  }

  if (event.type === "customer.subscription.deleted") {
    await supabase.from("memberships").update({ status: "cancelled", raw_data: obj, last_synced_at: new Date().toISOString() })
      .eq("source_record_id", obj.id as string).eq("billing_provider", "stripe");
  }

  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
    const customerId = obj.customer as string;
    const { data: member } = await supabase.from("members").select("id").eq("stripe_customer_id", customerId).single();
    const isPaid = event.type === "invoice.payment_succeeded";
    await supabase.from("payment_events").insert({
      source_system:    "stripe",
      source_record_id: obj.id as string,
      member_id:        member?.id ?? null,
      event_type:       isPaid ? "payment_paid" : "payment_failed",
      amount:           (isPaid ? obj.amount_paid : obj.amount_due) as number,
      currency:         ((obj.currency as string) ?? "aud").toUpperCase(),
      occurred_at:      new Date().toISOString(),
      description:      `${isPaid ? "Stripe payment" : "Failed payment"} — ${obj.number ?? obj.id}`,
      raw_data:         obj,
    });
  }

  // checkout.session.completed — new member paid, trigger welcome sequence
  if (event.type === "checkout.session.completed") {
    const memberId   = (obj.metadata as Record<string, string>)?.bfc_member_id;
    const plan       = (obj.metadata as Record<string, string>)?.plan;
    const customerId = obj.customer as string;
    const customerEmail = (obj.customer_details as Record<string, unknown> | undefined)?.email as string | undefined;
    if (memberId) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bfc-echo.vercel.app";
        await fetch(`${baseUrl}/api/welcome-sequence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET ?? "",
          },
          body: JSON.stringify({ member_id: memberId, email: customerEmail, plan }),
        });
      } catch {}
      // Update member to active
      await supabase.from("members").update({ status: "active", stripe_customer_id: customerId }).eq("id", memberId);
    }
  }

  return NextResponse.json({ ok: true });
}
