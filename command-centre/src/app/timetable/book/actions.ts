"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function bookClass(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const class_template_id = String(formData.get("class_template_id") ?? "").trim();
  const booked_date       = String(formData.get("booked_date") ?? "").trim();
  if (!class_template_id || !booked_date) return;

  // Resolve member_id from profile
  if (!profile.member_id) throw new Error("Your profile is not linked to a member record. Contact the gym.");

  // Check capacity
  const [templateRes, countRes] = await Promise.all([
    supabase.from("class_templates").select("max_capacity, name").eq("id", class_template_id).single(),
    supabase.from("class_bookings").select("id", { count: "exact", head: true })
      .eq("class_template_id", class_template_id)
      .eq("booked_date", booked_date)
      .eq("status", "confirmed"),
  ]);
  if (templateRes.data?.max_capacity && (countRes.count ?? 0) >= templateRes.data.max_capacity) {
    throw new Error(`Sorry, ${templateRes.data.name} on ${booked_date} is fully booked (max ${templateRes.data.max_capacity}).`);
  }

  const { data, error } = await supabase
    .from("class_bookings")
    .insert({
      member_id: profile.member_id,
      class_template_id,
      booked_date,
      status: "confirmed",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("You already have a booking for this class on this date.");
    throw new Error("Booking failed: " + error.message);
  }
  await logAudit("booking.create", "class_bookings", data.id, { class_template_id, booked_date });
  revalidatePath("/timetable");
  revalidatePath("/(portal)/portal");
}

export async function cancelBooking(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  // Only the member themselves or managers can cancel
  const { error } = await supabase
    .from("class_bookings")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("member_id", profile.member_id ?? "");
  if (error) throw new Error("Cancel booking failed: " + error.message);
  await logAudit("booking.cancel", "class_bookings", id);
  revalidatePath("/timetable");
  revalidatePath("/(portal)/portal");
}

export async function markAttendance(formData: FormData) {
  const { requireRole } = await import("@/lib/auth");
  await requireRole(["owner_director", "operations_admin", "coach"]);
  const supabase = await createClient();
  const id     = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "attended");
  if (!id || !["attended", "no_show"].includes(status)) return;
  const { error } = await supabase.from("class_bookings").update({ status }).eq("id", id);
  if (error) throw new Error("Mark attendance failed: " + error.message);
  revalidatePath("/timetable");
}
