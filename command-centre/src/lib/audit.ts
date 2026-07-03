import { createClient } from "@/lib/supabase/server";

/**
 * Audit log framework: call from server components/actions whenever a
 * sensitive record is viewed, written, or exported.
 *
 * Examples:
 *   await logAudit("member.view", "members", memberId);
 *   await logAudit("medical_form.export", "medical_forms", formId, { format: "pdf" });
 *
 * Writes go through the log_audit() SECURITY DEFINER function — the
 * audit_logs table itself accepts no direct inserts and is readable only
 * by the Owner/Director role.
 */
export async function logAudit(
  action: string,
  resourceType: string,
  resourceId?: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_audit", {
    p_action: action,
    p_resource_type: resourceType,
    p_resource_id: resourceId ?? null,
    p_details: details,
  });
  if (error) {
    // Never let audit failures break the user's request, but surface them.
    console.error("audit log failed", { action, resourceType, resourceId, error });
  }
}
