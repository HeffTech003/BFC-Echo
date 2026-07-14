"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePortalProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const primary_phone = String(formData.get("primary_phone") ?? "").trim() || null;

  // Only allow member to update their own record (matched by email — RLS enforced)
  const { error } = await supabase
    .from("members")
    .update({ primary_phone })
    .eq("primary_email", user.email);

  if (error) throw new Error("Update failed: " + error.message);
  redirect("/portal?updated=1");
}
