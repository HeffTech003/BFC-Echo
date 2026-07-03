"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function createIncident(formData: FormData) {
  const profile = await requireRole(["owner_director", "child_safety_lead"]);
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;

  const { data, error } = await supabase
    .from("incident_reports")
    .insert({
      category: String(formData.get("category") ?? "other"),
      severity: String(formData.get("severity") ?? "low"),
      occurred_at: String(formData.get("occurred_at") ?? "") || null,
      location: String(formData.get("location") ?? "").trim() || null,
      description,
      immediate_actions: String(formData.get("immediate_actions") ?? "").trim() || null,
      review_date: String(formData.get("review_date") ?? "") || null,
      reported_by: profile.id,
      assigned_to: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Create incident failed: ${error.message}`);
  await logAudit("incident.create", "incident_reports", data.id, {
    category: String(formData.get("category") ?? "other"),
    severity: String(formData.get("severity") ?? "low"),
  });
  revalidatePath("/compliance/incidents");
}

export async function updateIncident(formData: FormData) {
  await requireRole(["owner_director", "child_safety_lead"]);
  const supabase = await createClient();

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["open", "under_review", "closed"].includes(status)) return;

  const update: Record<string, unknown> = { status };
  const followUp = String(formData.get("follow_up_actions") ?? "").trim();
  if (followUp) update.follow_up_actions = followUp;
  const reviewDate = String(formData.get("review_date") ?? "");
  if (reviewDate) update.review_date = reviewDate;
  const outcome = String(formData.get("outcome_notes") ?? "").trim();
  if (outcome) update.outcome_notes = outcome;

  // The DB trigger blocks closing without outcome notes; surface it cleanly.
  const { error } = await supabase.from("incident_reports").update(update).eq("id", id);
  if (error) {
    if (error.message.includes("outcome notes")) {
      throw new Error("An incident can only be closed with outcome notes.");
    }
    throw new Error(`Update incident failed: ${error.message}`);
  }

  await logAudit("incident.update", "incident_reports", id, { status });
  revalidatePath("/compliance/incidents");
  revalidatePath("/dashboard");
}
