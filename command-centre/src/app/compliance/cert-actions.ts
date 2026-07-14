"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const CERT_TYPES = ["wwcc", "first_aid", "police_check", "other"] as const;
const STATUSES   = ["pending", "current", "expired", "not_required"] as const;

export async function upsertCertification(formData: FormData) {
  await requireRole(["owner_director", "operations_admin", "child_safety_lead"]);
  const supabase = await createClient();

  const member_id   = String(formData.get("member_id") ?? "").trim();
  const cert_type   = String(formData.get("cert_type") ?? "").trim();
  const cert_number = String(formData.get("cert_number") ?? "").trim() || null;
  const issued_at   = String(formData.get("issued_at") ?? "").trim() || null;
  const expires_at  = String(formData.get("expires_at") ?? "").trim() || null;
  const status      = String(formData.get("status") ?? "current").trim();
  const notes       = String(formData.get("notes") ?? "").trim() || null;
  const existing_id = String(formData.get("id") ?? "").trim() || null;

  if (!member_id || !CERT_TYPES.includes(cert_type as typeof CERT_TYPES[number])) return;
  if (!STATUSES.includes(status as typeof STATUSES[number])) return;

  const record = { member_id, cert_type, cert_number, issued_at, expires_at, status, notes, updated_at: new Date().toISOString() };

  if (existing_id) {
    const { error } = await supabase
      .from("coach_certifications")
      .update(record)
      .eq("id", existing_id);
    if (error) throw new Error("Update cert failed: " + error.message);
    await logAudit("cert.update", "coach_certifications", existing_id, { cert_type, status });
  } else {
    const { data, error } = await supabase
      .from("coach_certifications")
      .insert(record)
      .select("id")
      .single();
    if (error) throw new Error("Create cert failed: " + error.message);
    await logAudit("cert.create", "coach_certifications", data.id, { cert_type, status });
  }

  revalidatePath("/compliance");
}

export async function deleteCertification(formData: FormData) {
  await requireRole(["owner_director", "operations_admin", "child_safety_lead"]);
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const { error } = await supabase.from("coach_certifications").delete().eq("id", id);
  if (error) throw new Error("Delete cert failed: " + error.message);
  await logAudit("cert.delete", "coach_certifications", id);
  revalidatePath("/compliance");
}
