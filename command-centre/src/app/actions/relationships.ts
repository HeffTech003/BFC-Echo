"use server";

import { requireRole, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type RelationshipType =
  | "parent"
  | "child"
  | "spouse"
  | "partner"
  | "sibling"
  | "emergency_contact";

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  parent:            "Parent / Guardian",
  child:             "Child / Dependent",
  spouse:            "Spouse",
  partner:           "Partner",
  sibling:           "Sibling",
  emergency_contact: "Emergency Contact",
};

// The inverse label shown on the related member's profile
export const RELATIONSHIP_INVERSE: Record<RelationshipType, string> = {
  parent:            "Child / Dependent",
  child:             "Parent / Guardian",
  spouse:            "Spouse",
  partner:           "Partner",
  sibling:           "Sibling",
  emergency_contact: "Emergency Contact For",
};

export async function addRelationship(
  memberId: string,
  relatedMemberId: string,
  relationshipType: RelationshipType,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const { error } = await supabase.from("member_relationships").insert({
    member_id:         memberId,
    related_member_id: relatedMemberId,
    relationship_type: relationshipType,
    notes:             notes ?? null,
    created_by:        profile.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "These two members are already linked." };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/members/${memberId}`);
  revalidatePath(`/members/${relatedMemberId}`);
  return { success: true };
}

export async function removeRelationship(
  relationshipId: string,
  memberId: string,
  relatedMemberId: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("member_relationships")
    .delete()
    .eq("id", relationshipId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/members/${memberId}`);
  revalidatePath(`/members/${relatedMemberId}`);
  return { success: true };
}

export async function searchMembers(
  query: string,
  excludeId: string
): Promise<{ id: string; full_name: string | null; member_type: string | null; member_status: string | null }[]> {
  await requireProfile();
  if (!query || query.trim().length < 2) return [];

  const supabase = await createClient();

  const { data } = await supabase
    .from("members")
    .select("id, full_name, member_type, member_status")
    .neq("id", excludeId)
    .ilike("full_name", `%${query.trim()}%`)
    .order("full_name")
    .limit(10);

  return data ?? [];
}
