import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Handles Supabase PKCE auth callbacks (magic links, OAuth).
 * Supabase → redirects here with ?code=...
 * We exchange the code for a session and redirect to /dashboard.
 *
 * To use PKCE flow (recommended over implicit/hash flow):
 * Supabase Dashboard → Authentication → URL Configuration
 *   Site URL: https://bfc-echo.vercel.app
 *   Redirect URLs: https://bfc-echo.vercel.app/auth/callback
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Surface auth errors back to login page
  if (error) {
    const params = new URLSearchParams({ error: errorDescription ?? error });
    return NextResponse.redirect(`${origin}/login?${params}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=invalid`);
  }

  // No code — shouldn't happen, send back to login
  return NextResponse.redirect(`${origin}/login`);
}
