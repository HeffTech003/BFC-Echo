// app/actions/tasks.ts
"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

type CreateTaskInput = {
  member_id: string;
  title: string;
  notes?: string;
  priority?: string;
  due_date?: string;
  status?: string;
};

export async function createMemberTask(input: CreateTaskInput) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      member_id:  input.member_id,
      title:      input.title,
      notes:      input.notes ?? null,
      priority:   input.priority ?? "normal",
      due_date:   input.due_date ?? null,
      status:     input.status ?? "open",
      created_by: profile.id,
      source:     "manual",
    })
    .select("id")
    .single();

  if (error) {
    console.error("createMemberTask error:", error);
    return { success: false, error: error.message };
  }

  await logAudit("tasks.create", "tasks", {
    task_id:   data?.id,
    member_id: input.member_id,
    title:     input.title,
  });

  revalidatePath(`/members/${input.member_id}`);
  revalidatePath("/tasks");

  return { success: true, taskId: data?.id };
}

export async function updateTaskStatus(taskId: string, status: string, memberId?: string) {
  await requireRole(["owner_director", "operations_admin", "coach"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { success: false, error: error.message };

  if (memberId) revalidatePath(`/members/${memberId}`);
  revalidatePath("/tasks");

  return { success: true };
}
