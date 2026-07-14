import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16: proxy.ts replaces middleware.ts.
// Refreshes the Supabase session cookie and redirects unauthenticated
// requests to /login. Full authorisation (roles) is enforced server-side
// per page via requireRole() — this is only the optimistic outer gate.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  // Token-gated public forms (guardian/member medical + onboarding). The
  // token itself is the credential; the RPCs validate expiry and single use.
  const isPublicForm = request.nextUrl.pathname.startsWith("/forms/");
  // Member portal has its own session — bypass admin auth entirely.
  const isPortalRoute = request.nextUrl.pathname.startsWith("/portal");

  if (isPublicForm) return response;
  if (isPortalRoute) return response;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Don't bounce an authenticated user off /login when they were sent there
  // by a deactivated/error case (e.g. a valid session with no profile row).
  // Otherwise requireProfile()'s redirect to /login?deactivated=1 and this
  // redirect to /dashboard loop forever.
  if (
    user &&
    isAuthRoute &&
    !request.nextUrl.searchParams.has("deactivated") &&
    !request.nextUrl.searchParams.has("error")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
