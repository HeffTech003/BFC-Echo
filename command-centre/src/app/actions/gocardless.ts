// app/actions/gocardless.ts
// Server actions for GoCardless mandate write-back.
// Never put the access token in code — it must live in GOCARDLESS_ACCESS_TOKEN env var.
"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// ── GoCardless API client ─────────────────────────────────────────────────────

const GC_BASE =
  process.env.GOCARDLESS_ENV === "sandbox"
    ? "https://api-sandbox.gocardless.com"
    : "https://api.gocardless.com";

const GC_VERSION = "2015-07-06";

async function gcRequest(
  path: string,
  method: "POST" | "GET" = "POST",
  body?: Record<string, unknown>
) {
  const token = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) throw new Error("GOCARDLESS_ACCESS_TOKEN env var is not set.");

  const res = await fetch(`${GC_BASE}${path}`, {
    method,
    headers: {
      Authorization:     `Bearer ${token}`,
      "GoCardless-Version": GC_VERSION,
      "Content-Type":    "application/json",
      Accept:            "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GoCardless ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ── Helper: update mandate status in Supabase ─────────────────────────────────

async function syncMandateStatus(gcMandateId: string, newStatus: string) {
  const supabase = await createClient();
  await supabase
    .from("gocardless_mandates")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("gc_mandate_id", gcMandateId);
}

// ── Cancel mandate ────────────────────────────────────────────────────────────

export async function cancelMandate(gcMandateId: string, memberId: string) {
  const profile = await requireRole(["owner_director", "operations_admin"]);

  try {
    await gcRequest(`/mandates/${gcMandateId}/actions/cancel`, "POST", {
      data: {}
    });

    await syncMandateStatus(gcMandateId, "cancelled");

    await logAudit("mandate.cancel", "gocardless_mandates", {
      gc_mandate_id: gcMandateId,
      member_id:     memberId,
      actor:         profile.id,
    });

    revalidatePath(`/members/${memberId}`);
    return { success: true };
  } catch (err) {
    console.error("cancelMandate error:", err);
    return { success: false, error: String(err) };
  }
}

// ── Pause mandate (not all schemes support this — GC will error if not) ───────

export async function pauseMandate(gcMandateId: string, memberId: string) {
  const profile = await requireRole(["owner_director", "operations_admin"]);

  try {
    await gcRequest(`/mandates/${gcMandateId}/actions/pause`, "POST", {
      data: {}
    });

    await syncMandateStatus(gcMandateId, "paused");

    await logAudit("mandate.pause", "gocardless_mandates", {
      gc_mandate_id: gcMandateId,
      member_id:     memberId,
      actor:         profile.id,
    });

    revalidatePath(`/members/${memberId}`);
    return { success: true };
  } catch (err) {
    console.error("pauseMandate error:", err);
    return { success: false, error: String(err) };
  }
}

// ── Reinstate (unpause) mandate ────────────────────────────────────────────────

export async function reinstateMandate(gcMandateId: string, memberId: string) {
  const profile = await requireRole(["owner_director", "operations_admin"]);

  try {
    await gcRequest(`/mandates/${gcMandateId}/actions/reinstate`, "POST", {
      data: {}
    });

    await syncMandateStatus(gcMandateId, "active");

    await logAudit("mandate.reinstate", "gocardless_mandates", {
      gc_mandate_id: gcMandateId,
      member_id:     memberId,
      actor:         profile.id,
    });

    revalidatePath(`/members/${memberId}`);
    return { success: true };
  } catch (err) {
    console.error("reinstateMandate error:", err);
    return { success: false, error: String(err) };
  }
}
