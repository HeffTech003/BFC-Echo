"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const CLASS_TYPES = ["group", "private", "semi_private", "kids", "competition", "other"] as const;

export async function upsertClassTemplate(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const id             = String(formData.get("id") ?? "").trim() || null;
  const name           = String(formData.get("name") ?? "").trim();
  const class_type     = String(formData.get("class_type") ?? "group");
  const coach_id       = String(formData.get("coach_id") ?? "").trim() || null;
  const day_of_week    = parseInt(String(formData.get("day_of_week") ?? "1"), 10);
  const start_time     = String(formData.get("start_time") ?? "").trim();
  const duration_minutes = parseInt(String(formData.get("duration_minutes") ?? "60"), 10);
  const location       = String(formData.get("location") ?? "").trim() || null;
  const max_capacity   = parseInt(String(formData.get("max_capacity") ?? ""), 10) || null;
  const description    = String(formData.get("description") ?? "").trim() || null;
  const is_active      = formData.get("is_active") !== "false";

  if (!name || !start_time || isNaN(day_of_week)) return;
  if (!CLASS_TYPES.includes(class_type as typeof CLASS_TYPES[number])) return;

  const record = { name, class_type, coach_id, day_of_week, start_time, duration_minutes, location, max_capacity, description, is_active, updated_at: new Date().toISOString() };

  if (id) {
    const { error } = await supabase.from("class_templates").update(record).eq("id", id);
    if (error) throw new Error("Update class failed: " + error.message);
    await logAudit("timetable.update", "class_templates", id, { name });
  } else {
    const { data, error } = await supabase.from("class_templates").insert(record).select("id").single();
    if (error) throw new Error("Create class failed: " + error.message);
    await logAudit("timetable.create", "class_templates", data.id, { name });
  }

  revalidatePath("/timetable");
}

export async function toggleClassActive(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const id        = String(formData.get("id") ?? "").trim();
  const is_active = formData.get("is_active") === "true";
  if (!id) return;
  const { error } = await supabase.from("class_templates").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("Toggle class failed: " + error.message);
  await logAudit("timetable.toggle", "class_templates", id, { is_active });
  revalidatePath("/timetable");
}
