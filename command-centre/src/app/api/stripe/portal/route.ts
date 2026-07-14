/**
 * POST /api/stripe/portal
 * Creates a Stripe Customer Portal session and returns the URL.
 * Members use this to update payment methods, view invoices, cancel subscriptions.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) {
    return Response.json({ error: "Stripe not configured" }, { status: 503 });
  }

  // Find stripe_customer_id from members table via profile.member_id
  if (!profile.member_id) {
    return Response.json({ error: "No member record linked to this account" }, { status: 404 });
  }

  const { data: member } = await supabase
    .from("members")
    .select("stripe_customer_id")
    .eq("id", profile.member_id)
    .single();

  if (!member?.stripe_customer_id) {
    return Response.json({ error: "No Stripe customer found. Contact BFC to set up online billing." }, { status: 404 });
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bfc-echo.vercel.app"}/portal`;

  const body = new URLSearchParams({
    customer:   member.stripe_customer_id,
    return_url: returnUrl,
  });

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json() as { url?: string; error?: { message: string } };
  if (!res.ok || !data.url) {
    return Response.json({ error: data.error?.message ?? "Failed to create portal session" }, { status: 502 });
  }

  return Response.json({ url: data.url });
}
