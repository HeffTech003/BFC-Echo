#!/usr/bin/env node
/**
 * backfill-gocardless-member-links.mjs
 *
 * One-time script: resolves the GoCardless mandate→customer→member chain
 * for the 17 unlinked GoCardless subscriptions in the memberships table.
 *
 * Problem: memberships synced from GoCardless have source_record_id = SB...
 * (subscription ID) and raw_data.links.mandate = MD... (mandate ID), but the
 * member_source_records table stores customers by CU... ID. There's no direct
 * SB→CU link in the DB, so we resolve it via the GoCardless API:
 *   subscription → mandate_id → GET /mandates/{id} → customer_id → MSR → member
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   GOCARDLESS_ACCESS_TOKEN=live_... \
 *   node command-centre/scripts/backfill-gocardless-member-links.mjs
 *
 * Safe to re-run — skips already-linked rows and rows where no MSR is found.
 * Never put credentials in this file. Use env vars only.
 */

import { createClient } from "@supabase/supabase-js";

// ── Env var validation ────────────────────────────────────────────────────────

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GC_TOKEN       = process.env.GOCARDLESS_ACCESS_TOKEN;
const GC_ENV         = process.env.GOCARDLESS_ENV ?? "live";

if (!SUPABASE_URL || !SUPABASE_KEY || !GC_TOKEN) {
  console.error(
    "Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOCARDLESS_ACCESS_TOKEN"
  );
  process.exit(1);
}

const GC_BASE =
  GC_ENV === "sandbox"
    ? "https://api-sandbox.gocardless.com"
    : "https://api.gocardless.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── GoCardless API helper ─────────────────────────────────────────────────────

async function gcGet(path) {
  const res = await fetch(`${GC_BASE}${path}`, {
    headers: {
      Authorization:        `Bearer ${GC_TOKEN}`,
      "GoCardless-Version": "2015-07-06",
      Accept:               "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GoCardless GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== GoCardless Member Link Backfill ===\n");

  // 1. Fetch all unlinked GoCardless active subscriptions
  const { data: unlinked, error: fetchErr } = await supabase
    .from("memberships")
    .select("id, source_record_id, raw_data")
    .eq("billing_provider", "gocardless")
    .eq("status", "active")
    .is("member_id", null);

  if (fetchErr) {
    console.error("Failed to fetch unlinked memberships:", fetchErr.message);
    process.exit(1);
  }

  console.log(`Found ${unlinked.length} unlinked active GoCardless memberships.\n`);

  if (unlinked.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let linked = 0;
  let notFound = 0;
  let errors = 0;

  for (const membership of unlinked) {
    const subscriptionId = membership.source_record_id;
    const mandateId = membership.raw_data?.links?.mandate;

    if (!mandateId) {
      console.warn(`  [SKIP] ${subscriptionId} — no mandate ID in raw_data.links.mandate`);
      notFound++;
      continue;
    }

    try {
      // 2. Call GoCardless API: GET /mandates/{mandate_id} → customer_id
      const mandateData = await gcGet(`/mandates/${mandateId}`);
      const customerId = mandateData?.mandates?.links?.customer;

      if (!customerId) {
        console.warn(`  [SKIP] ${subscriptionId} → mandate ${mandateId} — no customer_id in response`);
        notFound++;
        continue;
      }

      // 3. Look up MSR by GoCardless customer ID → get member_id
      const { data: msrs, error: msrErr } = await supabase
        .from("member_source_records")
        .select("member_id, display_name")
        .eq("source_system", "gocardless")
        .eq("source_record_id", customerId)
        .not("member_id", "is", null)
        .limit(1);

      if (msrErr || !msrs?.length) {
        console.warn(
          `  [SKIP] ${subscriptionId} → mandate ${mandateId} → customer ${customerId} — no matching MSR found`
        );
        notFound++;
        continue;
      }

      const { member_id, display_name } = msrs[0];

      // 4. Update memberships.member_id
      const { error: updateErr } = await supabase
        .from("memberships")
        .update({ member_id })
        .eq("id", membership.id);

      if (updateErr) {
        console.error(`  [ERROR] ${subscriptionId} — update failed: ${updateErr.message}`);
        errors++;
        continue;
      }

      console.log(
        `  [OK] ${subscriptionId} → mandate ${mandateId} → customer ${customerId} → member "${display_name}" (${member_id})`
      );
      linked++;

      // Small delay to stay well within GoCardless rate limits (500 req/min)
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.error(`  [ERROR] ${subscriptionId} → ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Linked:    ${linked}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Errors:    ${errors}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
