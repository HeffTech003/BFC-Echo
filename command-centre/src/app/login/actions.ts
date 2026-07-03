"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) redirect("/login?error=missing");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirect("/login?error=invalid");

  await logAudit("auth.sign_in", "auth");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await logAudit("auth.sign_out", "auth");
  await supabase.auth.signOut();
  redirect("/login");
}
