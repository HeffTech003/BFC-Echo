// app/(portal)/portal/login/page.tsx
// Member login via Supabase magic link (no password needed).
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "idle" | "sending" | "sent" | "error";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setStatus("sending");
    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/portal`,
      },
    });

    if (authError) {
      setError(authError.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold">Bendigo Fight Centre</h1>
          <p className="text-sm text-muted-foreground mt-1">Member portal</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            {status === "sent" ? (
              <div className="text-center py-4">
                <p className="text-sm font-medium text-success-foreground mb-1">
                  Check your inbox ✓
                </p>
                <p className="text-xs text-muted-foreground">
                  We sent a sign-in link to <strong>{email}</strong>.
                  Click the link to access your member portal.
                </p>
                <button
                  className="mt-4 text-xs text-primary hover:underline"
                  onClick={() => setStatus("idle")}
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={status === "sending"}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use the email address on your membership.
                  </p>
                </div>

                {status === "error" && (
                  <p className="text-xs text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={status === "sending" || !email}
                >
                  {status === "sending" ? "Sending…" : "Send sign-in link"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Not a member?{" "}
          <a href="https://bendigofightcentre.com.au" className="text-primary hover:underline">
            Learn more →
          </a>
        </p>
      </div>
    </div>
  );
}
