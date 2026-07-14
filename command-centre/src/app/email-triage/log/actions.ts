"use server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function markEmailActioned(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const log_id   = formData.get("log_id") as string;
  await supabase.from("email_triage_log").update({
    actioned_at: new Date().toISOString(),
    actioned_by: profile.id,
  }).eq("id", log_id);
  revalidatePath("/email-triage/log");
}
