"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/action-types";

export async function requestAction(formData: FormData) {
  await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const actionType = String(formData.get("action_type") ?? "");
  const def = ACTION_TYPES[actionType];
  if (!def) return;

  const summary = String(formData.get("summary") ?? "").trim();
  if (!summary) return;

  let payload: Record<string, unknown> = {};
  const rawPayload = String(formData.get("payload") ?? "").trim();
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      throw new Error("Payload must be valid JSON (or left empty).");
    }
  }

  const memberEmail = String(formData.get("member_email") ?? "").trim();
  let memberId: string | null = null;
  if (memberEmail) {
    const { data: member } = await supabase
      .from("members")
      .select("id")
      .ilike("primary_email", memberEmail)
      .limit(1)
      .maybeSingle();
    memberId = member?.id ?? null;
  }

  const { error } = await supabase.rpc("request_action", {
    p_action_type: actionType,
    p_target_system: def.targetSystem,
    p_summary: summary,
    p_payload: payload,
    p_target_record_id: String(formData.get("target_record_id") ?? "").trim() || null,
    p_member_id: memberId,
    p_reason: String(formData.get("reason") ?? "").trim() || null,
  });

  if (error) throw new Error(`Request failed: ${error.message}`);
  revalidatePath("/actions-queue");
  revalidatePath("/dashboard");
}

export async function decideAction(formData: FormData) {
  await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const decision = String(formData.get("decision"));
  if (!["approved", "rejected", "cancelled"].includes(decision)) return;

  // High-risk approval requires an explicit confirmation tick in the UI;
  // the database separately enforces Owner/Director-only approval.
  if (decision === "approved" && formData.get("high_risk") === "1") {
    if (formData.get("confirm") !== "on") {
      throw new Error("High-risk actions require the explicit confirmation checkbox.");
    }
  }

  const { error } = await supabase.rpc("decide_action", {
    p_id: String(formData.get("id")),
    p_decision: decision,
    p_note: String(formData.get("note") ?? "").trim() || null,
  });

  if (error) throw new Error(`Decision failed: ${error.message}`);
  revalidatePath("/actions-queue");
  revalidatePath("/dashboard");
}

export async function retryAction(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const { error } = await supabase.rpc("retry_action", {
    p_id: String(formData.get("id")),
  });

  if (error) throw new Error(`Retry failed: ${error.message}`);
  revalidatePath("/actions-queue");
}
