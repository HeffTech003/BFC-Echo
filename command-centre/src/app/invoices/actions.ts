"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Bookkeeping only: "paid" records that a human paid the invoice via the
// bank/Xero. The app never executes payments (guardrail).
export async function updateInvoice(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["pending_review", "reviewed", "paid", "disputed", "not_an_invoice"].includes(status))
    return;

  const update: Record<string, unknown> = {
    status,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  };
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes) update.notes = notes;

  const { error } = await supabase.from("supplier_invoices").update(update).eq("id", id);
  if (error) throw new Error(`Update failed: ${error.message}`);

  await logAudit("supplier_invoice.status", "supplier_invoices", id, { status });
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}
