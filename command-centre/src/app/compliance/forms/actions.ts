"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function createFormLink(formData: FormData) {
  const profile = await requireRole(["owner_director", "child_safety_lead"]);
  const supabase = await createClient();

  const memberEmail = String(formData.get("member_email") ?? "").trim();
  const formType = String(formData.get("form_type") ?? "medical_participation");
  if (!memberEmail) return;
  if (!["medical_participation", "youth_onboarding"].includes(formType)) return;

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name")
    .ilike("primary_email", memberEmail)
    .limit(1)
    .maybeSingle();

  if (!member) throw new Error(`No member found with email ${memberEmail}`);

  const expiryDays = Number(formData.get("expiry_days") ?? 14) || 14;

  const { data, error } = await supabase
    .from("form_links")
    .insert({
      member_id: member.id,
      form_type: formType,
      created_by: profile.id,
      expires_at: new Date(Date.now() + expiryDays * 86400000).toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Create link failed: ${error.message}`);
  await logAudit("form_link.create", "form_links", data.id, {
    member_id: member.id,
    form_type: formType,
    expiry_days: expiryDays,
  });
  revalidatePath("/compliance/forms");
}

export async function expireFormLink(formData: FormData) {
  await requireRole(["owner_director", "child_safety_lead"]);
  const supabase = await createClient();
  const id = String(formData.get("id"));

  const { error } = await supabase
    .from("form_links")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Expire link failed: ${error.message}`);
  await logAudit("form_link.expire", "form_links", id);
  revalidatePath("/compliance/forms");
}
