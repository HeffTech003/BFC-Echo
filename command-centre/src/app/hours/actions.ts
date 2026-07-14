"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const CLASS_TYPES = ["group", "private", "semi_private", "admin", "other"] as const;

export async function logClassSession(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin", "coach"]);
  const supabase = await createClient();

  const coach_id         = String(formData.get("coach_id") ?? "").trim();
  const class_name       = String(formData.get("class_name") ?? "").trim();
  const class_type       = String(formData.get("class_type") ?? "group");
  const session_date     = String(formData.get("session_date") ?? "").trim();
  const start_time       = String(formData.get("start_time") ?? "").trim() || null;
  const duration_minutes = parseInt(String(formData.get("duration_minutes") ?? "60"), 10);
  const attendee_count   = parseInt(String(formData.get("attendee_count") ?? ""), 10) || null;
  const notes            = String(formData.get("notes") ?? "").trim() || null;

  if (!coach_id || !class_name || !session_date) return;
  if (!CLASS_TYPES.includes(class_type as typeof CLASS_TYPES[number])) return;
  if (isNaN(duration_minutes) || duration_minutes <= 0) return;

  const { data, error } = await supabase
    .from("class_sessions")
    .insert({
      coach_id,
      class_name,
      class_type,
      session_date,
      start_time,
      duration_minutes,
      attendee_count,
      notes,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error("Log session failed: " + error.message);
  await logAudit("class_session.create", "class_sessions", data.id, { coach_id, class_name, session_date });
  revalidatePath("/hours");
}

export async function deleteClassSession(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const { error } = await supabase.from("class_sessions").delete().eq("id", id);
  if (error) throw new Error("Delete session failed: " + error.message);
  await logAudit("class_session.delete", "class_sessions", id);
  revalidatePath("/hours");
}
