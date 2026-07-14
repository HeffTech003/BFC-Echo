export const ROLES = [
  "owner_director",
  "operations_admin",
  "coach",
  "child_safety_lead",
  "finance",
  "general_staff",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner_director: "Owner / Director",
  operations_admin: "Operations Admin",
  coach: "Coach",
  child_safety_lead: "Child Safety Lead",
  finance: "Finance",
  general_staff: "General Staff",
};

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
  member_id: string | null;
}
