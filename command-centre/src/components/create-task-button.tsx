// components/create-task-button.tsx
// Quick task creation inline on the member profile page.
// Submits directly to Supabase via a server action.
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createMemberTask } from "@/app/actions/tasks";

type Props = {
  memberId: string;
  memberName?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  label?: string;
};

type PanelState = "closed" | "open" | "saving" | "saved" | "error";

const PRIORITIES = ["low", "normal", "high", "critical"] as const;

export function CreateTaskButton({
  memberId,
  memberName,
  variant = "outline",
  size = "sm",
  label = "Create task",
}: Props) {
  const [state, setState]     = useState<PanelState>("closed");
  const [title, setTitle]     = useState("");
  const [notes, setNotes]     = useState("");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>("normal");
  const [dueDate, setDueDate] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [, startTransition]   = useTransition();

  function handleSave() {
    if (!title.trim()) return;
    setState("saving");

    startTransition(async () => {
      const result = await createMemberTask({
        member_id: memberId,
        title:     title.trim(),
        notes:     notes.trim() || undefined,
        priority,
        due_date:  dueDate || undefined,
        status:    "open",
      });

      if (result.success) {
        setState("saved");
        setTitle(""); setNotes(""); setPriority("normal"); setDueDate("");
        setTimeout(() => setState("closed"), 1500);
      } else {
        setErrorMsg(result.error ?? "Failed to create task.");
        setState("error");
      }
    });
  }

  if (state === "closed") {
    return (
      <Button variant={variant} size={size} onClick={() => setState("open")}>
        {label}
      </Button>
    );
  }

  if (state === "saved") {
    return <span className="text-xs text-success-foreground font-medium px-2">✓ Task created</span>;
  }

  return (
    <div className="rounded-md border bg-card p-4 shadow-md w-72 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          New task{memberName ? ` — ${memberName}` : ""}
        </span>
        <button
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
          onClick={() => setState("closed")}
        >×</button>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Title *</label>
        <input
          autoFocus
          className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Task title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && title.trim()) handleSave(); }}
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Notes</label>
        <textarea
          className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          rows={2}
          placeholder="Optional details"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* Priority + due date */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Priority</label>
          <select
            className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={priority}
            onChange={e => setPriority(e.target.value as typeof priority)}
          >
            {PRIORITIES.map(p => (
              <option key={p} value={p} className="capitalize">{p}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Due date</label>
          <input
            type="date"
            className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>
      </div>

      {state === "error" && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1"
          disabled={state === "saving" || !title.trim()}
          onClick={handleSave}
        >
          {state === "saving" ? "Saving…" : "Create task"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState("closed")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
