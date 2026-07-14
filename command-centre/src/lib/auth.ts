import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/roles";

/**
 * Returns the signed-in user's profile, or redirects to /login.
 * Deactivated accounts are signed out of the app immediately.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, member_id")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) {
    // Clear the stale session so the browser stops presenting a cookie for a
    // user with no usable profile (the proxy guard is the reliable loop-break;
    // this is best-effort cleanup, since cookie writes during render are
    // swallowed in Server Components).
    await supabase.auth.signOut();
    redirect("/login?deactivated=1");
  }

  return profile as Profile;
}

/**
 * Server-side role gate for a page or action. RLS is the real enforcement;
 * this keeps users off screens their role can never use.
 */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard?denied=1");
  return profile;
}
