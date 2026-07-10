// components/mandate-actions.tsx
// Client component — renders pause/reinstate/cancel buttons for a GoCardless mandate.
// Used inside the member profile page's GoCardless mandate list.
//
// Props:
//   gcMandateId  — the GoCardless mandate ID (e.g. "MD0000XXXXXXXX")
//   memberId     — UUID of the member (for revalidation and audit)
//   status       — current mandate status
//   canWrite     — pass true only for owner_director / operations_admin roles
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelMandate,
  pauseMandate,
  reinstateMandate,
} from "@/app/actions/gocardless";

type Props = {
  gcMandateId: string;
  memberId: string;
  status: string | null;
  canWrite: boolean;
};

type ActionState =
  | { type: "idle" }
  | { type: "confirm"; action: "cancel" | "pause" | "reinstate" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

const ACTION_LABELS = {
  cancel:    { label: "Cancel mandate",    confirm: "This will permanently cancel the direct debit. The member will need to set up a new mandate. Are you sure?", variant: "destructive" as const },
  pause:     { label: "Pause mandate",     confirm: "Payments will be paused. No new payments will be collected until reinstated. Continue?",                       variant: "outline"     as const },
  reinstate: { label: "Reinstate mandate", confirm: "This will reactivate the direct debit mandate. Continue?",                                                    variant: "outline"     as const },
};

export function MandateActions({ gcMandateId, memberId, status, canWrite }: Props) {
  const [state, setState] = useState<ActionState>({ type: "idle" });
  const [isPending, startTransition] = useTransition();

  if (!canWrite) return null;

  // Decide which actions are available given the current status
  const available: ("cancel" | "pause" | "reinstate")[] = [];
  if (status === "active")            available.push("pause", "cancel");
  if (status === "paused")            available.push("reinstate", "cancel");
  if (status === "pending_submission") available.push("cancel");
  if (status === "submitted")          available.push("cancel");

  if (available.length === 0) return null;

  function handleConfirm() {
    if (state.type !== "confirm") return;
    const action = state.action;

    startTransition(async () => {
      let result: { success: boolean; error?: string };

      if (action === "cancel")    result = await cancelMandate(gcMandateId, memberId);
      else if (action === "pause") result = await pauseMandate(gcMandateId, memberId);
      else                         result = await reinstateMandate(gcMandateId, memberId);

      if (result.success) {
        setState({ type: "success", message: `Mandate ${action}d successfully.` });
      } else {
        setState({ type: "error", message: result.error ?? "Unknown error from GoCardless." });
      }
    });
  }

  // ── Confirmation dialog ────────────────────────────────────────────────────

  if (state.type === "confirm") {
    const cfg = ACTION_LABELS[state.action];
    return (
      <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="mb-3">{cfg.confirm}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={cfg.variant}
            disabled={isPending}
            onClick={handleConfirm}
          >
            {isPending ? "Processing…" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setState({ type: "idle" })}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Success / error feedback ───────────────────────────────────────────────

  if (state.type === "success") {
    return (
      <p className="mt-2 text-xs text-success-foreground">✓ {state.message}</p>
    );
  }

  if (state.type === "error") {
    return (
      <div className="mt-2">
        <p className="text-xs text-destructive">✗ {state.message}</p>
        <Button size="sm" variant="ghost" className="mt-1 h-6 text-xs px-2" onClick={() => setState({ type: "idle" })}>
          Dismiss
        </Button>
      </div>
    );
  }

  // ── Normal button row ──────────────────────────────────────────────────────

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {available.map((action) => {
        const cfg = ACTION_LABELS[action];
        return (
          <Button
            key={action}
            size="sm"
            variant={cfg.variant}
            className="h-7 text-xs"
            onClick={() => setState({ type: "confirm", action })}
          >
            {cfg.label}
          </Button>
        );
      })}
    </div>
  );
}
