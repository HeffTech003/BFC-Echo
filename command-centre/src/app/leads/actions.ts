"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const STAGES = [
  "new_enquiry",
  "trial_booked",
  "trial_attended",
  "follow_up_required",
  "joined",
  "did_not_convert",
];

export async function updateLead(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const id = String(formData.get("id"));
  const stage = String(formData.get("stage"));
  if (!STAGES.includes(stage)) return;

  const update: Record<string, unknown> = { stage };

  const assignedTo = String(formData.get("assigned_to") ?? "");
  if (assignedTo) update.assigned_to = assignedTo;

  const lostReason = String(formData.get("lost_reason") ?? "").trim();
  if (stage === "did_not_convert" && lostReason) update.lost_reason = lostReason;

  const { error } = await supabase.from("leads").update(update).eq("id", id);
  if (error) throw new Error(`Update lead failed: ${error.message}`);

  await logAudit("lead.update", "leads", id, { stage });
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}
