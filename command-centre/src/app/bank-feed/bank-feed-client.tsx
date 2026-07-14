"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function BankFeedClient({ syncButton }: { syncButton?: boolean }) {
  const [syncing,  setSyncing]  = useState(false);
  const [message,  setMessage]  = useState("");
  const [isError,  setIsError]  = useState(false);

  async function sync() {
    setSyncing(true);
    setMessage("");
    setIsError(false);
    try {
      const res = await fetch("/api/bank-feed/sync", { method: "POST" });
      const data = await res.json() as { synced?: number; from?: string; error?: string };
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Sync failed");
      } else {
        setMessage(`✓ Synced ${data.synced} transactions from ${data.from}`);
        // Reload to show new data
        setTimeout(() => window.location.reload(), 800);
      }
    } catch {
      setIsError(true);
      setMessage("Network error");
    } finally {
      setSyncing(false);
    }
  }

  if (!syncButton) return null;

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-sm ${isError ? "text-red-500" : "text-green-600"}`}>
          {message}
        </span>
      )}
      <Button onClick={sync} disabled={syncing} variant="outline">
        {syncing ? "Syncing…" : "Sync from Xero"}
      </Button>
    </div>
  );
}
