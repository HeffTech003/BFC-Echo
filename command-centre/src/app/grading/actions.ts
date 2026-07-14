"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function recordGrading(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin", "coach"]);
  const supabase = await createClient();
  const member_id   = String(formData.get("member_id") ?? "").trim();
  const discipline  = String(formData.get("discipline") ?? "").trim();
  const grade       = String(formData.get("grade") ?? "").trim();
  const graded_at   = String(formData.get("graded_at") ?? "").trim();
  const notes       = String(formData.get("notes") ?? "").trim() || null;
  const graded_by_id = String(formData.get("graded_by") ?? "").trim() || null;
  if (!member_id || !discipline || !grade || !graded_at) return;
  const { data, error } = await supabase
    .from("member_gradings")
    .insert({ member_id, discipline, grade, graded_at, graded_by: graded_by_id, notes })
    .select("id").single();
  if (error) throw new Error("Record grading failed: " + error.message);
  await logAudit("grading.record", "member_gradings", data.id, { member_id, discipline, grade });
  revalidatePath("/grading");
  revalidatePath(`/members/${member_id}`);
}

export async function deleteGrading(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await supabase.from("member_gradings").delete().eq("id", id);
  await logAudit("grading.delete", "member_gradings", id);
  revalidatePath("/grading");
}
