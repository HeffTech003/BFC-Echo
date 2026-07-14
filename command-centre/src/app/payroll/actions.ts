"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function createPayRun(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const period_start = String(formData.get("period_start") ?? "").trim();
  const period_end   = String(formData.get("period_end") ?? "").trim();
  const notes        = String(formData.get("notes") ?? "").trim() || null;
  if (!period_start || !period_end) return;

  // 1. Fetch all class sessions in the period
  const { data: sessions } = await supabase
    .from("class_sessions")
    .select("coach_id, class_type, duration_minutes")
    .gte("session_date", period_start)
    .lte("session_date", period_end);

  if (!sessions?.length) {
    throw new Error("No sessions found in this period — log sessions first.");
  }

  // 2. Fetch pay rates (most recent effective rate per coach per class_type)
  const { data: rates } = await supabase
    .from("coach_pay_rates")
    .select("member_id, class_type, rate_per_hour, effective_from")
    .lte("effective_from", period_end)
    .or("effective_to.is.null,effective_to.gte." + period_start)
    .order("effective_from", { ascending: false });

  // Build rate lookup: member_id + class_type → rate_per_hour (first = most recent)
  const rateMap = new Map<string, number>();
  for (const r of rates ?? []) {
    const key = `${r.member_id}::${r.class_type}`;
    if (!rateMap.has(key)) rateMap.set(key, Number(r.rate_per_hour));
  }

  // 3. Aggregate by coach
  const byCoach = new Map<string, { minutes: number; sessions: number; gross: number }>();
  for (const s of sessions) {
    const rate = rateMap.get(`${s.coach_id}::${s.class_type}`) ?? rateMap.get(`${s.coach_id}::group`) ?? 0;
    const hours = (s.duration_minutes ?? 0) / 60;
    const existing = byCoach.get(s.coach_id) ?? { minutes: 0, sessions: 0, gross: 0 };
    existing.minutes  += s.duration_minutes ?? 0;
    existing.sessions += 1;
    existing.gross    += hours * rate;
    byCoach.set(s.coach_id, existing);
  }

  // 4. Create pay_run
  const { data: run, error: runErr } = await supabase
    .from("pay_runs")
    .insert({ period_start, period_end, status: "draft", notes, created_by: profile.id })
    .select("id").single();
  if (runErr) throw new Error("Create pay run failed: " + runErr.message);

  // 5. Insert line items
  const items = [...byCoach.entries()].map(([member_id, { minutes, sessions: sessionCount, gross }]) => ({
    pay_run_id:     run.id,
    member_id,
    total_minutes:  minutes,
    total_sessions: sessionCount,
    gross_amount:   Math.round(gross * 100) / 100,
  }));
  const { error: itemErr } = await supabase.from("pay_run_items").insert(items);
  if (itemErr) throw new Error("Insert pay run items failed: " + itemErr.message);

  await logAudit("pay_run.create", "pay_runs", run.id, { period_start, period_end, coaches: byCoach.size });
  revalidatePath("/payroll");
}

export async function updatePayRunStatus(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const id     = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !["under_review", "approved", "cancelled"].includes(status)) return;

  const update: Record<string, unknown> = { status };
  if (status === "approved") {
    update.approved_by = profile.id;
    update.approved_at = new Date().toISOString();
  }

  const { error } = await supabase.from("pay_runs").update(update).eq("id", id);
  if (error) throw new Error("Update pay run failed: " + error.message);
  await logAudit("pay_run.status_change", "pay_runs", id, { status });
  revalidatePath("/payroll");
}
