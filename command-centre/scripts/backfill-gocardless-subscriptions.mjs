#!/usr/bin/env node
/**
 * backfill-gocardless-subscriptions.mjs
 *
 * Fetches ALL GoCardless subscriptions from the API and upserts them into
 * the Supabase `memberships` table with billing_provider = 'gocardless'.
 *
 * Run this when the Subscriptions page shows 0 rows even though WF16 is active.
 * WF16 syncs GoCardless customers → member_source_records but may not write
 * subscriptions → memberships. This script fills that gap.
 *
 * After running, existing member links (member_id) are preserved via the
 * on_conflict upsert — so you won't lose any previously linked member records.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://arokqidhsqatlahceajy.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   GOCARDLESS_ACCESS_TOKEN=live_... \
 *   node command-centre/scripts/backfill-gocardless-subscriptions.mjs
 *
 * Never put credentials in this file. Use env vars only.
 */

import { createClient } from "@supabase/supabase-js";

// ── Env var validation ────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GC_TOKEN     = process.env.GOCARDLESS_ACCESS_TOKEN;
const GC_ENV       = process.env.GOCARDLESS_ENV ?? "live";

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

// ── Fetch paginated subscriptions ─────────────────────────────────────────────

async function fetchAllSubscriptions() {
  const all = [];
  let after = null;

  while (true) {
    const qs = after ? `?after=${after}&limit=100` : "?limit=100";
    const data = await gcGet(`/subscriptions${qs}`);
    const subs = data?.subscriptions ?? [];
    all.push(...subs);

    if (subs.length < 100) break;
    after = subs[subs.length - 1].id;

    // Respect rate limits (500 req/min)
    await new Promise((r) => setTimeout(r, 200));
  }

  return all;
}

// ── Map interval ─────────────────────────────────────────────────────────────

function mapInterval(gcInterval, unit) {
  if (!unit) return "monthly";
  if (unit === "weekly") return "weekly";
  if (unit === "monthly") return gcInterval === 1 ? "monthly" : "monthly";
  return "monthly";
}

// ── Map status ────────────────────────────────────────────────────────────────

function mapStatus(gcStatus) {
  const map = {
    active:             "active",
    paused:             "paused",
    finished:           "expired",
    cancelled:          "cancelled",
    pending_customer_approval: "paused",
  };
  return map[gcStatus] ?? "cancelled";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== GoCardless Subscriptions Backfill ===\n");

  // Log run start
  const { data: runRow } = await supabase
    .from("sync_runs")
    .insert({
      source_system: "gocardless",
      run_type:      "backfill",
      status:        "running",
    })
    .select("id")
    .single();
  const runId = runRow?.id;

  let upserted = 0;
  let errors   = 0;

  try {
    console.log("Fetching subscriptions from GoCardless API...");
    const subscriptions = await fetchAllSubscriptions();
    console.log(`Found ${subscriptions.length} subscriptions.\n`);

    if (subscriptions.length === 0) {
      console.log("No subscriptions found — check your GoCardless account.");
      return;
    }

    // Batch upsert in groups of 100
    const BATCH = 100;
    for (let i = 0; i < subscriptions.length; i += BATCH) {
      const batch = subscriptions.slice(i, i + BATCH);

      const rows = batch.map((sub) => ({
        source_system:       "gocardless",
        source_record_id:    sub.id,
        source_customer_id:  sub.links?.mandate ?? null,
        billing_provider:    "gocardless",
        status:              mapStatus(sub.status),
        plan_name:           sub.name ?? null,
        amount:              sub.amount != null ? sub.amount / 100 : null, // GC stores cents
        billing_interval:    mapInterval(sub.interval, sub.interval_unit),
        start_date:          sub.start_date ?? null,
        end_date:            sub.end_date ?? null,
        raw_data:            sub,
        last_synced_at:      new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("memberships")
        .upsert(rows, {
          onConflict:        "source_system,source_record_id",
          ignoreDuplicates:  false, // update existing rows
        });

      if (error) {
        console.error(`Batch ${i / BATCH + 1} error:`, error.message);
        errors += batch.length;
      } else {
        upserted += batch.length;
        console.log(
          `  Batch ${i / BATCH + 1}: upserted ${batch.length} subscriptions (total: ${upserted})`
        );
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    // Update run record
    if (runId) {
      await supabase
        .from("sync_runs")
        .update({
          status:            "success",
          finished_at:       new Date().toISOString(),
          records_processed: subscriptions.length,
          records_created:   upserted,
          records_updated:   0,
        })
        .eq("id", runId);
    }

    console.log(`\n=== Done ===`);
    console.log(`  Upserted: ${upserted}`);
    console.log(`  Errors:   ${errors}`);
    console.log("\nCheck /subscriptions in the platform — rows should now appear.");
    console.log(
      "Run backfill-gocardless-member-links.mjs next to link subscriptions to member records."
    );
  } catch (err) {
    console.error("Fatal error:", err.message);
    if (runId) {
      await supabase
        .from("sync_runs")
        .update({
          status:        "error",
          finished_at:   new Date().toISOString(),
          error_message: err.message,
        })
        .eq("id", runId);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
