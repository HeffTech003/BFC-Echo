"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function createPolicyVersion(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const policyName = String(formData.get("policy_name") ?? "").trim();
  const version = String(formData.get("version") ?? "").trim();
  if (!policyName || !version) return;

  const audience = ["members", "youth_guardians", "staff", "coaches"].filter(
    (a) => formData.get(`audience_${a}`) === "on"
  );

  const makeCurrent = formData.get("is_current") === "on";
  if (makeCurrent) {
    await supabase
      .from("policy_versions")
      .update({ is_current: false })
      .eq("policy_name", policyName)
      .eq("is_current", true);
  }

  const { data, error } = await supabase
    .from("policy_versions")
    .insert({
      policy_name: policyName,
      version,
      effective_date: String(formData.get("effective_date") ?? "") || null,
      review_date: String(formData.get("review_date") ?? "") || null,
      required_audience: audience,
      document_url: String(formData.get("document_url") ?? "").trim() || null,
      is_current: makeCurrent,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Create policy failed: ${error.message}`);
  await logAudit("policy.create_version", "policy_versions", data.id, {
    policy_name: policyName,
    version,
  });
  revalidatePath("/compliance/policies");
}

export async function editPolicyVersion(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const id = String(formData.get("id"));
  const policyName = String(formData.get("policy_name") ?? "").trim();

  const audience = ["members", "youth_guardians", "staff", "coaches"].filter(
    (a) => formData.get(`audience_${a}`) === "on"
  );

  const makeCurrent = formData.get("is_current") === "on";
  if (makeCurrent && policyName) {
    // Retire any other current version of the same policy first.
    await supabase
      .from("policy_versions")
      .update({ is_current: false })
      .eq("policy_name", policyName)
      .eq("is_current", true)
      .neq("id", id);
  }

  const { error } = await supabase
    .from("policy_versions")
    .update({
      effective_date: String(formData.get("effective_date") ?? "") || null,
      review_date: String(formData.get("review_date") ?? "") || null,
      required_audience: audience,
      document_url: String(formData.get("document_url") ?? "").trim() || null,
      is_current: makeCurrent,
    })
    .eq("id", id);

  if (error) throw new Error(`Edit policy failed: ${error.message}`);
  await logAudit("policy.edit_version", "policy_versions", id);
  void profile;
  revalidatePath("/compliance/policies");
}

export async function recordAcknowledgement(formData: FormData) {
  await requireRole(["owner_director", "operations_admin", "child_safety_lead"]);
  const supabase = await createClient();

  const policyVersionId = String(formData.get("policy_version_id"));
  const memberEmail = String(formData.get("member_email") ?? "").trim();
  const signedName = String(formData.get("signed_name") ?? "").trim();
  if (!policyVersionId || !signedName) return;

  let memberId: string | null = null;
  if (memberEmail) {
    const { data: member } = await supabase
      .from("members")
      .select("id")
      .ilike("primary_email", memberEmail)
      .limit(1)
      .maybeSingle();
    memberId = member?.id ?? null;
  }

  const { data, error } = await supabase
    .from("policy_acknowledgements")
    .insert({
      policy_version_id: policyVersionId,
      member_id: memberId,
      acknowledged_by_name: signedName,
      guardian_name: String(formData.get("guardian_name") ?? "").trim() || null,
      signature_method: "in_app",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Record acknowledgement failed: ${error.message}`);
  await logAudit("policy.acknowledge", "policy_acknowledgements", data.id, {
    policy_version_id: policyVersionId,
    matched_member: memberId != null,
  });
  revalidatePath("/compliance/policies");
}
