// components/send-message-button.tsx
// Inline compose popover on the member profile page.
// Lets admins send a templated email/SMS directly from the profile.
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendMessage } from "@/app/actions/send-message";

type Props = {
  memberId: string;
  toEmail?: string;
  toPhone?: string;
  memberName?: string;
};

const TEMPLATES = [
  { value: "payment_failed",            label: "Payment failed notice" },
  { value: "payment_reminder",          label: "Payment reminder" },
  { value: "cancellation_confirmation", label: "Cancellation confirmation" },
  { value: "welcome",                   label: "Welcome message" },
  { value: "custom",                    label: "Custom message" },
] as const;

type TemplateValue = typeof TEMPLATES[number]["value"];

type PanelState = "closed" | "open" | "sending" | "sent" | "error";

export function SendMessageButton({ memberId, toEmail, toPhone, memberName }: Props) {
  const [state, setState] = useState<PanelState>("closed");
  const [template, setTemplate] = useState<TemplateValue>("payment_reminder");
  const [channels, setChannels] = useState<Set<"email" | "sms">>(
    new Set(toEmail ? ["email"] : toPhone ? ["sms"] : [])
  );
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [, startTransition] = useTransition();

  function toggleChannel(ch: "email" | "sms") {
    setChannels(prev => {
      const next = new Set(prev);
      next.has(ch) ? next.delete(ch) : next.add(ch);
      return next;
    });
  }

  function handleSend() {
    if (channels.size === 0) return;
    setState("sending");

    startTransition(async () => {
      const result = await sendMessage({
        memberId,
        to_email:  channels.has("email") ? toEmail : undefined,
        to_phone:  channels.has("sms")   ? toPhone : undefined,
        template,
        channels: Array.from(channels),
        variables: {
          name:    memberName ?? "",
          subject: customSubject,
          html:    customBody,
          sms:     customBody,
        },
      });

      if (result.success) {
        setState("sent");
        setTimeout(() => setState("closed"), 2500);
      } else {
        setErrorMsg(result.error ?? "Failed to send.");
        setState("error");
      }
    });
  }

  if (state === "closed") {
    return (
      <Button variant="outline" size="sm" onClick={() => setState("open")}>
        Send message
      </Button>
    );
  }

  if (state === "sent") {
    return (
      <span className="text-xs text-success-foreground font-medium px-2">✓ Sent</span>
    );
  }

  return (
    <div className="rounded-md border bg-card p-4 shadow-md w-72 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Send message</span>
        <button
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
          onClick={() => setState("closed")}
        >×</button>
      </div>

      {/* Template */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Template</label>
        <select
          className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={template}
          onChange={e => setTemplate(e.target.value as TemplateValue)}
        >
          {TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Custom body */}
      {template === "custom" && (
        <>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Subject</label>
            <input
              className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={customSubject}
              onChange={e => setCustomSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Message</label>
            <textarea
              className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              value={customBody}
              onChange={e => setCustomBody(e.target.value)}
              placeholder="Message body"
            />
          </div>
        </>
      )}

      {/* Channels */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Send via</label>
        <div className="flex gap-2">
          {toEmail && (
            <button
              type="button"
              onClick={() => toggleChannel("email")}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                channels.has("email")
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              Email
            </button>
          )}
          {toPhone && (
            <button
              type="button"
              onClick={() => toggleChannel("sms")}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                channels.has("sms")
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              SMS
            </button>
          )}
        </div>
      </div>

      {state === "error" && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1"
          disabled={state === "sending" || channels.size === 0}
          onClick={handleSend}
        >
          {state === "sending" ? "Sending…" : "Send"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState("closed")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
