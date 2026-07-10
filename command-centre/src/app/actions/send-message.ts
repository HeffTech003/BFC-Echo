// app/actions/send-message.ts
// Server action that triggers WF21 (Communications webhook in n8n).
// Call from any server or client component — no credentials exposed to browser.
"use server";

import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type MessagePayload = {
  to_email?: string;
  to_phone?: string;
  member_id?: string;
  template: "welcome" | "payment_failed" | "cancellation_confirmation" | "payment_reminder" | "custom";
  variables?: Record<string, string>;
  channels: ("email" | "sms")[];
};

export async function sendMessage(payload: MessagePayload) {
  await requireRole(["owner_director", "operations_admin"]);

  const webhookUrl = process.env.N8N_COMMS_WEBHOOK_URL;
  if (!webhookUrl) {
    return { success: false, error: "N8N_COMMS_WEBHOOK_URL env var not set." };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { success: false, error: `n8n webhook error (${res.status}): ${text}` };
    }

    await logAudit("communications.send", "communications_log", payload.member_id, {
      template:  payload.template,
      channels:  payload.channels,
      to_email:  payload.to_email,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
