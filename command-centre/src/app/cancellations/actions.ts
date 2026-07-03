"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Status bookkeeping only. The actual cancellation/pause is performed by a
// human in Clubworx/Ezidebit/GoCardless — never by the app (guardrail).
export async function updateCancellation(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["new", "in_progress", "processed", "retained", "withdrawn"].includes(status)) return;

  const update: Record<string, unknown> = { status };
  const notes = String(formData.get("outcome_notes") ?? "").trim();
  if (notes) update.outcome_notes = notes;
  if (["processed", "retained", "withdrawn"].includes(status)) {
    update.processed_by = profile.id;
    update.processed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("cancellation_requests").update(update).eq("id", id);
  if (error) throw new Error(`Update failed: ${error.message}`);

  await logAudit("cancellation.status", "cancellation_requests", id, { status });
  revalidatePath("/cancellations");
  revalidatePath("/dashboard");
}
