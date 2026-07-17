"use server";
/**
 * Join form submission:
 * 1. Create member record in Supabase
 * 2. Create Stripe customer
 * 3. Create Stripe Checkout session for the chosen plan
 * 4. Redirect to Stripe Checkout
 *
 * NEVER put Stripe keys in code. Use STRIPE_SECRET_KEY env var.
 */
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STRIPE_SECRET    = process.env.STRIPE_SECRET_KEY;

/**
 * Stripe price IDs — create matching products in Stripe Dashboard first.
 * Add each price ID as an env var in Vercel (Settings → Environment Variables):
 *   STRIPE_PRICE_ADULT_WEEKLY   → recurring weekly  $44.99  (6-month lock-in enforced via contract)
 *   STRIPE_PRICE_ADULT_MONTHLY  → recurring monthly $229.99 (no lock-in)
 *   STRIPE_PRICE_YOUTH_WEEKLY   → recurring weekly  $39.99  (6-month lock-in)
 *   STRIPE_PRICE_YOUTH_MONTHLY  → recurring monthly $199.99 (no lock-in)
 *   STRIPE_PRICE_CASUAL         → one-time          $25.00
 */
const PLAN_PRICE_IDS: Record<string, string> = {
  adult_weekly:   process.env.STRIPE_PRICE_ADULT_WEEKLY   ?? "",
  adult_monthly:  process.env.STRIPE_PRICE_ADULT_MONTHLY  ?? "",
  youth_weekly:   process.env.STRIPE_PRICE_YOUTH_WEEKLY   ?? "",
  youth_monthly:  process.env.STRIPE_PRICE_YOUTH_MONTHLY  ?? "",
  casual:         process.env.STRIPE_PRICE_CASUAL          ?? "",
};

// Casual is a one-time payment; all others are subscriptions
const CASUAL_PLANS = new Set(["casual"]);

export async function submitJoinForm(formData: FormData) {
  const first_name     = String(formData.get("first_name") ?? "").trim();
  const last_name      = String(formData.get("last_name") ?? "").trim();
  const email          = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone          = String(formData.get("phone") ?? "").trim() || null;
  const date_of_birth  = String(formData.get("date_of_birth") ?? "").trim() || null;
  const source         = String(formData.get("source") ?? "other");
  const plan           = String(formData.get("plan") ?? "adult_weekly");
  const signed_name    = String(formData.get("signed_name") ?? "").trim();
  const waiver_accepted = formData.get("waiver_accepted") === "on";

  if (!first_name || !last_name || !email || !signed_name || !waiver_accepted) {
    redirect("/join?error=Please+fill+in+all+required+fields+and+accept+the+waiver.");
  }

  if (!STRIPE_SECRET) {
    redirect("/join?error=Payment+not+configured+yet.+Please+call+us+at+the+gym.");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  // 1. Check for duplicate email
  const { data: existing } = await supabase
    .from("members")
    .select("id")
    .eq("primary_email", email)
    .single();

  let memberId: string;

  if (existing) {
    memberId = existing.id;
  } else {
    // 2. Create member record
    const { data: newMember, error: memberErr } = await supabase
      .from("members")
      .insert({
        full_name:      `${first_name} ${last_name}`,
        primary_email:  email,
        primary_phone:  phone,
        date_of_birth:  date_of_birth,
        member_type:    "gym_member",
        member_status:  "pending",
        notes:          `Self sign-up via /join (${source}). Waiver signed by: ${signed_name}.`,
      })
      .select("id")
      .single();
    if (memberErr) redirect(`/join?error=${encodeURIComponent(memberErr.message)}`);
    memberId = newMember!.id;

    // Also create a lead for CRM tracking
    await supabase.from("leads").insert({
      full_name: `${first_name} ${last_name}`,
      email, phone,
      source: source as string,
      stage: "joined",
      notes: `Self sign-up via /join. Plan: ${plan}.`,
    }).throwOnError();
  }

  // 3. Create or retrieve Stripe customer
  let stripeCustomerId: string;
  const { data: memberWithStripe } = await supabase
    .from("members").select("stripe_customer_id").eq("id", memberId).single();

  if (memberWithStripe?.stripe_customer_id) {
    stripeCustomerId = memberWithStripe.stripe_customer_id;
  } else {
    const custRes = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ email, name: `${first_name} ${last_name}`, metadata: JSON.stringify({ bfc_member_id: memberId }) }).toString(),
    });
    const cust = await custRes.json() as { id: string };
    stripeCustomerId = cust.id;
    await supabase.from("members").update({ stripe_customer_id: stripeCustomerId }).eq("id", memberId);
  }

  // 4. Create Stripe Checkout session
  const priceId = PLAN_PRICE_IDS[plan];
  if (!priceId) redirect("/join?error=Selected+plan+not+yet+available+online.+Please+call+us.");

  const isCasual = CASUAL_PLANS.has(plan);
  const checkoutBody = new URLSearchParams({
    customer: stripeCustomerId,
    mode: isCasual ? "payment" : "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bfc-echo.vercel.app"}/join/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bfc-echo.vercel.app"}/join`,
    "metadata[bfc_member_id]": memberId,
    "metadata[plan]": plan,
  });

  const sessRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_SECRET}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: checkoutBody.toString(),
  });
  const sess = await sessRes.json() as { url?: string; error?: { message: string } };
  if (!sess.url) redirect(`/join?error=${encodeURIComponent(sess.error?.message ?? "Checkout failed")}`);

  redirect(sess.url);
}
