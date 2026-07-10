// app/communications/page.tsx
// Manual message compose UI + sent log.
// Only accessible to owner_director and operations_admin.
"use client";

import { useState, useTransition } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendMessage, type MessagePayload } from "@/app/actions/send-message";

// NOTE: This page is "use client" so we can't call requireRole server-side here.
// Add the route to your middleware or wrap the layout in a server component that
// calls requireRole(["owner_director","operations_admin"]) and passes profile down.
// The server action itself is protected regardless.

const TEMPLATES: { value: MessagePayload["template"]; label: string; needsVars: string[] }[] = [
  { value: "welcome",                   label: "Welcome",                    needsVars: ["name", "plan"] },
  { value: "payment_failed",            label: "Payment failed",             needsVars: ["name", "amount", "date"] },
  { value: "cancellation_confirmation", label: "Cancellation confirmation",  needsVars: ["name", "end_date"] },
  { value: "payment_reminder",          label: "Payment reminder",           needsVars: ["name", "amount", "due_date"] },
  { value: "custom",                    label: "Custom message",             needsVars: ["subject", "html", "sms"] },
];

type Status = { type: "idle" } | { type: "sending" } | { type: "success" } | { type: "error"; msg: string };

export default function CommunicationsPage() {
  const [template, setTemplate]   = useState<MessagePayload["template"]>("welcome");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [memberId, setMemberId]   = useState("");
  const [channels, setChannels]   = useState<Set<"email" | "sms">>(new Set(["email"]));
  const [vars, setVars]           = useState<Record<string, string>>({});
  const [status, setStatus]       = useState<Status>({ type: "idle" });
  const [, startTransition]       = useTransition();

  const selectedTpl = TEMPLATES.find(t => t.value === template)!;

  function toggleChannel(ch: "email" | "sms") {
    setChannels(prev => {
      const next = new Set(prev);
      next.has(ch) ? next.delete(ch) : next.add(ch);
      return next;
    });
  }

  function handleSend() {
    if (!email && channels.has("email")) { setStatus({ type: "error", msg: "Email address required." }); return; }
    if (!phone && channels.has("sms"))   { setStatus({ type: "error", msg: "Phone number required for SMS." }); return; }

    setStatus({ type: "sending" });

    startTransition(async () => {
      const result = await sendMessage({
        to_email:  email || undefined,
        to_phone:  phone || undefined,
        member_id: memberId || undefined,
        template,
        variables: vars,
        channels:  Array.from(channels),
      });

      if (result.success) {
        setStatus({ type: "success" });
        setEmail(""); setPhone(""); setMemberId(""); setVars({});
      } else {
        setStatus({ type: "error", msg: result.error ?? "Unknown error." });
      }
    });
  }

  return (
    // In production this page needs AppShell — pass profile from a parent server component
    // <AppShell profile={profile}>
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Communications</h1>
        <span className="text-muted-foreground text-sm">Email + SMS</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compose message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template */}
          <div>
            <label className="block text-sm font-medium mb-1">Template</label>
            <select
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={template}
              onChange={e => { setTemplate(e.target.value as MessagePayload["template"]); setVars({}); }}
            >
              {TEMPLATES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Channels */}
          <div>
            <label className="block text-sm font-medium mb-1">Channels</label>
            <div className="flex gap-3">
              {(["email", "sms"] as const).map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    channels.has(ch)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="uppercase text-[10px] font-semibold">{ch}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recipient */}
          {channels.has("email") && (
            <div>
              <label className="block text-sm font-medium mb-1">Email address</label>
              <input
                type="email"
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="member@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          )}
          {channels.has("sms") && (
            <div>
              <label className="block text-sm font-medium mb-1">Phone number</label>
              <input
                type="tel"
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="+61400000000"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
          )}

          {/* Member ID (optional — for audit linking) */}
          <div>
            <label className="block text-sm font-medium mb-1">Member ID <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="text"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="UUID from members table"
              value={memberId}
              onChange={e => setMemberId(e.target.value)}
            />
          </div>

          {/* Template variables */}
          {selectedTpl.needsVars.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Template variables
                <span className="ml-1 text-xs text-muted-foreground font-normal">(used to personalise the message)</span>
              </label>
              <div className="space-y-2">
                {selectedTpl.needsVars.map(key => (
                  <div key={key} className="flex gap-2 items-center">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground font-mono">{key}</span>
                    <input
                      type={key === "html" ? undefined : "text"}
                      className="flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={key}
                      value={vars[key] ?? ""}
                      onChange={e => setVars(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status messages */}
          {status.type === "error" && (
            <p className="text-sm text-destructive">{status.msg}</p>
          )}
          {status.type === "success" && (
            <p className="text-sm text-success-foreground">✓ Message sent successfully.</p>
          )}

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={status.type === "sending" || channels.size === 0}
            className="w-full"
          >
            {status.type === "sending" ? "Sending…" : "Send message"}
          </Button>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Messages are delivered via SendGrid (email) and Twilio (SMS) through n8n WF21.
        All sends are logged in the communications_log table.
      </p>
    </div>
    // </AppShell>
  );
}
