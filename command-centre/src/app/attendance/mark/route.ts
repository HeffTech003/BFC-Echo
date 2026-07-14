import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await requireRole(["owner_director", "operations_admin", "coach"]);
  const supabase = await createClient();
  const form = await req.formData();
  const id     = String(form.get("id") ?? "").trim();
  const status = String(form.get("status") ?? "").trim();
  if (!id || !["attended", "no_show"].includes(status)) {
    return NextResponse.redirect(new URL("/attendance", req.url));
  }
  await supabase.from("class_bookings").update({ status }).eq("id", id);
  return NextResponse.redirect(new URL("/attendance", req.url));
}
