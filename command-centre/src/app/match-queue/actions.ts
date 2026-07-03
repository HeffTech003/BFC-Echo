"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

// All four actions are additionally guarded inside the SQL functions
// (security definer + role check), so the database enforces authorisation
// even if these gates were bypassed.

export async function runMatcher() {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("run_member_matcher");
  if (error) throw new Error(`Matcher failed: ${error.message}`);
  revalidatePath("/match-queue");
}

export async function approveMatch(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_match", {
    p_source_record_id: String(formData.get("source_record_id")),
    p_member_id: String(formData.get("member_id")),
  });
  if (error) throw new Error(`Approve failed: ${error.message}`);
  revalidatePath("/match-queue");
}

export async function rejectMatch(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_match", {
    p_source_record_id: String(formData.get("source_record_id")),
  });
  if (error) throw new Error(`Reject failed: ${error.message}`);
  revalidatePath("/match-queue");
}

export async function createMemberFromSource(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_member_from_source", {
    p_source_record_id: String(formData.get("source_record_id")),
  });
  if (error) throw new Error(`Create member failed: ${error.message}`);
  revalidatePath("/match-queue");
}
