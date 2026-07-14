"use server";

/**
 * xero-actions.ts
 *
 * Sends an approved pay run to Xero Payroll (AU).
 *
 * Xero Payroll API is separate from Xero Accounting — it requires the
 * payroll.read + payroll.settings OAuth2 scopes.
 *
 * Pre-requisites:
 *   1. Xero OAuth2 credentials in env vars (XERO_CLIENT_ID, XERO_CLIENT_SECRET)
 *   2. A valid access token stored in supabase xero_tokens table
 *   3. Each coach must have a Xero employee ID in their member record
 *      (add column xero_employee_id to members table — see pending_fixes.sql Step 12)
 *   4. A Xero Payroll calendar and earnings rates must exist in Xero
 *
 * Xero Payroll AU API: https://developer.xero.com/documentation/payroll-api/overview/
 */

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const XERO_PAYROLL_AU_BASE = "https://api.xero.com/payroll/2.0";

async function getXeroToken(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data } = await supabase
    .from("xero_tokens")
    .select("access_token, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data?.access_token) {
    throw new Error(
      "No Xero access token found. Complete Xero OAuth2 flow first (Settings → Integrations → Xero)."
    );
  }
  if (data.expires_at && data.expires_at < new Date().toISOString()) {
    throw new Error(
      "Xero access token is expired. Re-authenticate via n8n or Settings → Integrations → Xero."
    );
  }
  return data.access_token;
}

export async function sendPayRunToXero(formData: FormData) {
  await requireRole(["owner_director"]);
  const supabase = await createClient();

  const pay_run_id = String(formData.get("pay_run_id") ?? "").trim();
  if (!pay_run_id) return;

  // 1. Load the pay run + items
  const { data: run, error: runErr } = await supabase
    .from("pay_runs")
    .select("*, items:pay_run_items(*, member:members(id, full_name, primary_email))")
    .eq("id", pay_run_id)
    .single();
  if (runErr || !run) throw new Error("Pay run not found.");
  if (run.status !== "approved") throw new Error("Only approved pay runs can be sent to Xero.");

  // 2. Load Xero token
  const token = await getXeroToken(supabase);
  const tenantId = process.env.XERO_TENANT_ID;
  if (!tenantId) throw new Error("XERO_TENANT_ID env var not set.");

  // 3. Build Xero Payroll payload
  // Each item → a Xero "timesheetLine" per employee
  // Xero Payroll AU requires earnings rates to be pre-configured in Xero.
  const timesheets = (run.items ?? []).map((item: {
    member_id: string;
    total_minutes: number;
    gross_amount: number;
    member: { id: string; full_name: string } | { id: string; full_name: string }[];
  }) => {
    const member = Array.isArray(item.member) ? item.member[0] : item.member;
    return {
      // EmployeeID must match the Xero employee — store in members.xero_employee_id
      EmployeeID: item.member_id, // placeholder — replace with actual Xero employee ID
      StartDate: `/Date(${new Date(run.period_start).getTime()})/`,
      EndDate:   `/Date(${new Date(run.period_end).getTime()})/`,
      Status: "DRAFT",
      TimesheetLines: [
        {
          EarningsRateID: "REPLACE_WITH_XERO_EARNINGS_RATE_ID", // configure in Xero
          NumberOfUnits: [Math.round((item.total_minutes / 60) * 100) / 100], // hours per day (simplified)
        },
      ],
      _bfc_note: `Coach: ${member?.full_name ?? item.member_id}, Gross: $${item.gross_amount}`,
    };
  });

  // 4. POST to Xero Payroll API
  const res = await fetch(`${XERO_PAYROLL_AU_BASE}/timesheets`, {
    method: "POST",
    headers: {
      Authorization:    `Bearer ${token}`,
      "Xero-Tenant-Id": tenantId,
      "Content-Type":   "application/json",
      Accept:           "application/json",
    },
    body: JSON.stringify({ Timesheets: timesheets }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Xero Payroll POST failed (${res.status}): ${text}`);
  }

  // 5. Mark pay run as paid
  await supabase
    .from("pay_runs")
    .update({ status: "paid" })
    .eq("id", pay_run_id);

  await logAudit("pay_run.sent_to_xero", "pay_runs", pay_run_id, { period_start: run.period_start, period_end: run.period_end });
  revalidatePath("/payroll");
}
