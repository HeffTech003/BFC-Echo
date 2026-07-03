"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Approving means: n8n may apply the suggested action in Gmail — labelling or
// creating a DRAFT reply only. The app never sends email, and the database
// trigger blocks approving an archive on protected categories even if this
// code were bypassed.
export async function decideEmail(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")); // approved | rejected | skipped
  if (!["approved", "rejected", "skipped"].includes(decision)) return;

  const { error } = await supabase
    .from("email_review_queue")
    .update({ status: decision, decided_by: profile.id })
    .eq("id", id)
    .eq("status", "pending");

  if (error) throw new Error(`Decision failed: ${error.message}`);

  await logAudit(`email_review.${decision}`, "email_review_queue", id);
  revalidatePath("/email-review");
  revalidatePath("/dashboard");
}
