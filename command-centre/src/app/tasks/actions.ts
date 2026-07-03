"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function createTask(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const assignedTo = String(formData.get("assigned_to") ?? "");
  const dueDate = String(formData.get("due_date") ?? "");

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      priority: String(formData.get("priority") ?? "normal"),
      due_date: dueDate || null,
      assigned_to: assignedTo || profile.id,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Create task failed: ${error.message}`);
  await logAudit("task.create", "tasks", data.id);
  revalidatePath("/tasks");
}

export async function updateTaskStatus(formData: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["open", "in_progress", "done", "cancelled"].includes(status)) return;

  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw new Error(`Update task failed: ${error.message}`);
  await logAudit("task.status", "tasks", id, { status });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
