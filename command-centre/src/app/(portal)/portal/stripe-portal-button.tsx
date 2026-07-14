"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function StripePortalButton() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function openPortal() {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Failed");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="outline" size="sm" onClick={openPortal} disabled={loading}>
        {loading ? "Opening…" : "Manage Payment Method"}
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
