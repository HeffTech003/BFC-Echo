"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const STAGES = ["new_enquiry","trial_booked","trial_attended","follow_up_required","joined","did_not_convert"];
const SOURCES = ["website_chatbot","web_form","walk_in","phone","referral","social_media","other"];

export async function updateLead(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const stage = String(formData.get("stage"));
  if (!STAGES.includes(stage)) return;
  const update: Record<string, unknown> = { stage };
  const assignedTo = String(formData.get("assigned_to") ?? "");
  update.assigned_to = assignedTo || null;
  const lostReason = String(formData.get("lost_reason") ?? "").trim();
  if (stage === "did_not_convert" && lostReason) update.lost_reason = lostReason;
  const trialDate = String(formData.get("trial_date") ?? "").trim();
  if (trialDate) update.trial_date = trialDate;
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes) update.notes = notes;
  const { error } = await supabase.from("leads").update(update).eq("id", id);
  if (error) throw new Error("Update lead failed: " + error.message);
  await logAudit("lead.update", "leads", id, { stage });
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function moveLeadStage(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const stage = String(formData.get("stage"));
  if (!STAGES.includes(stage)) return;
  const update: Record<string, unknown> = { stage };
  const trialDate = String(formData.get("trial_date") ?? "").trim();
  if (trialDate) update.trial_date = trialDate;
  const lostReason = String(formData.get("lost_reason") ?? "").trim();
  if (stage === "did_not_convert" && lostReason) update.lost_reason = lostReason;
  const { error } = await supabase.from("leads").update(update).eq("id", id);
  if (error) throw new Error("Move lead stage failed: " + error.message);
  await logAudit("lead.stage_move", "leads", id, { stage });
  revalidatePath("/leads");
}

export async function createLead(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "walk_in");
  const interested_class = String(formData.get("interested_class") ?? "").trim() || null;
  const trial_date = String(formData.get("trial_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const stage = String(formData.get("stage") ?? "new_enquiry");
  if (!full_name || !SOURCES.includes(source) || !STAGES.includes(stage)) return;
  const { data: lead, error } = await supabase.from("leads")
    .insert({ full_name, email, phone, source, interested_class, trial_date, notes, stage, assigned_to: profile.id })
    .select("id").single();
  if (error) throw new Error("Create lead failed: " + error.message);
  await logAudit("lead.create", "leads", lead.id, { source, stage });
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function deleteLead(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw new Error("Delete lead failed: " + error.message);
  await logAudit("lead.delete", "leads", id);
  revalidatePath("/leads");
}

export async function triggerLeadFollowup(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const lead_id  = formData.get("lead_id") as string;
  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://bfc-echo.vercel.app";
  await fetch(`${baseUrl}/api/lead-followup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET ?? "",
    },
    body: JSON.stringify({ lead_id, mode: "new_lead" }),
  });
  revalidatePath("/leads");
}
