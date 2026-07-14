"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// ── Resolve segment → recipient list ─────────────────────────────────────────

async function resolveSegment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  segment: string,
  segmentTag?: string | null
) {
  let query = supabase.from("members").select("id, full_name, email, phone, status, joined_at");

  if (segment === "all_active") {
    query = query.eq("status", "active");
  } else if (segment === "lapsed") {
    query = query.in("status", ["churned", "cancelled", "inactive"]);
  } else if (segment === "trial") {
    query = query.eq("status", "trial");
  } else if (segment === "no_booking_7d") {
    // Active members who have no booking in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data: recentBookers } = await supabase
      .from("class_bookings")
      .select("member_id")
      .gte("booked_at", sevenDaysAgo);
    const bookerIds = (recentBookers ?? []).map((b) => b.member_id);
    query = query.eq("status", "active");
    if (bookerIds.length > 0) {
      query = query.not("id", "in", `(${bookerIds.join(",")})`);
    }
  } else if (segment === "tag" && segmentTag) {
    query = query.contains("tags", [segmentTag]);
  }

  const { data } = await query.limit(2000);
  return data ?? [];
}

// ── Create campaign ───────────────────────────────────────────────────────────

export async function createCampaign(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const channels: string[] = [];
  if (formData.get("channel_email") === "on") channels.push("email");
  if (formData.get("channel_sms") === "on") channels.push("sms");
  if (!channels.length) throw new Error("Select at least one channel");

  const segment     = formData.get("segment") as string;
  const segmentTag  = (formData.get("segment_tag") as string) || null;

  // Preview recipient count
  const recipients = await resolveSegment(supabase, segment, segmentTag);

  const { data, error } = await supabase.from("campaigns").insert({
    name:            formData.get("name") as string,
    subject:         (formData.get("subject") as string) || null,
    body_email:      (formData.get("body_email") as string) || null,
    body_sms:        (formData.get("body_sms") as string) || null,
    channels,
    segment,
    segment_tag:     segmentTag,
    status:          "draft",
    recipient_count: recipients.length,
    created_by:      profile.id,
  }).select("id").single();

  if (error || !data) throw new Error("Failed to create campaign");
  revalidatePath("/campaigns");
}

// ── Send campaign ─────────────────────────────────────────────────────────────

export async function sendCampaign(formData: FormData) {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const campaign_id = formData.get("campaign_id") as string;

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaign_id)
    .single();

  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "draft") throw new Error("Campaign already sent or in progress");

  // Resolve recipients
  const recipients = await resolveSegment(supabase, campaign.segment, campaign.segment_tag);
  if (!recipients.length) throw new Error("No recipients matched this segment");

  // Mark as sending
  await supabase.from("campaigns").update({ status: "sending", recipient_count: recipients.length }).eq("id", campaign_id);

  // Create send records
  await supabase.from("campaign_sends").insert(
    recipients.map((r) => ({
      campaign_id,
      member_id: r.id,
      email:     r.email ?? null,
      phone:     r.phone ?? null,
      status:    "pending",
    }))
  );

  // Trigger via n8n webhook if configured
  const webhookUrl = process.env.N8N_CAMPAIGN_WEBHOOK_URL;
  let sentCount = 0;

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id,
          name:       campaign.name,
          subject:    campaign.subject,
          body_email: campaign.body_email,
          body_sms:   campaign.body_sms,
          channels:   campaign.channels,
          recipients: recipients.map((r) => ({
            id: r.id, name: r.full_name, email: r.email, phone: r.phone,
          })),
        }),
      });
      if (res.ok) sentCount = recipients.length;
    } catch {}
  } else {
    // No webhook — mark as queued for manual/future processing
    await supabase.from("campaigns").update({
      status:     "queued",
      sent_at:    new Date().toISOString(),
      sent_count: 0,
    }).eq("id", campaign_id);
    await logAudit("campaign.queued", "campaigns", campaign_id, { recipients: recipients.length });
    revalidatePath("/campaigns");
    return;
  }

  await supabase.from("campaigns").update({
    status:     "sent",
    sent_at:    new Date().toISOString(),
    sent_count: sentCount,
  }).eq("id", campaign_id);

  await supabase.from("campaign_sends").update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("campaign_id", campaign_id);

  await logAudit("campaign.sent", "campaigns", campaign_id, { recipients: recipients.length });
  revalidatePath("/campaigns");
}

export async function deleteCampaign(formData: FormData) {
  await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();
  const id = formData.get("campaign_id") as string;
  await supabase.from("campaigns").delete().eq("id", id).eq("status", "draft");
  revalidatePath("/campaigns");
}
