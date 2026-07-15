"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Handles magic link and OAuth callbacks that land on /login with a hash fragment.
 * Supabase implicit flow: /login#access_token=...&type=magiclink
 * The browser client auto-extracts the session from the hash; we just redirect.
 */
export function LoginAuthHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!window.location.hash.includes("access_token")) return;

    const supabase = createClient();

    // Give Supabase a moment to parse the hash and set the session cookie
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        listener.subscription.unsubscribe();
        router.replace("/dashboard");
      }
    });

    // Also check immediately in case the event already fired
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        listener.subscription.unsubscribe();
        router.replace("/dashboard");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  return null;
}
