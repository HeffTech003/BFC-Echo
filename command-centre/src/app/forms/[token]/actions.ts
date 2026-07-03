"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Public (anon) submission. All validation — token validity, expiry,
// single use — happens inside the security-definer RPC.
export async function submitForm(formData: FormData) {
  const supabase = await createClient();
  const token = String(formData.get("token") ?? "");

  const data = {
    medical_conditions: String(formData.get("medical_conditions") ?? "").trim(),
    medications: String(formData.get("medications") ?? "").trim(),
    accessibility_needs: String(formData.get("accessibility_needs") ?? "").trim(),
    injury_history: String(formData.get("injury_history") ?? "").trim(),
    emergency_contact_name: String(formData.get("emergency_contact_name") ?? "").trim(),
    emergency_contact_phone: String(formData.get("emergency_contact_phone") ?? "").trim(),
    emergency_contact_relationship: String(
      formData.get("emergency_contact_relationship") ?? ""
    ).trim(),
  };

  const guardianName = String(formData.get("guardian_name") ?? "").trim();

  const { data: result, error } = await supabase.rpc("submit_member_form", {
    p_token: token,
    p_data: data,
    p_signed_name: String(formData.get("signed_name") ?? "").trim(),
    p_guardian_name: guardianName || null,
  });

  if (error) redirect(`/forms/${token}?error=${encodeURIComponent(error.message)}`);
  if (!result?.success)
    redirect(`/forms/${token}?error=${encodeURIComponent(result?.error ?? "Submission failed")}`);

  redirect(`/forms/${token}?done=1`);
}
