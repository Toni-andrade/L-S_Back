import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * /api is exempt from the redirect-to-login: every API route enforces its own
 * auth (intake verifies the HMAC signature, the cron route checks CRON_SECRET,
 * export/download routes check the session and return 401/403 JSON). A
 * redirect here would break the public webhook and Vercel Cron, which send no
 * session cookie.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/api"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Without Supabase configuration there is no session to refresh. Pass the
  // request through instead of throwing (which would 500 every route as
  // MIDDLEWARE_INVOCATION_FAILED). Set these env vars in the deployment.
  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const { pathname } = request.nextUrl;

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      if (isPublic(pathname)) return response;
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // Allowlisted-but-not-yet-activated users are parked on /pending.
    const { data: profile } = await supabase
      .from("users")
      .select("active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.active) {
      if (pathname === "/pending" || pathname.startsWith("/auth")) return response;
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      return NextResponse.redirect(url);
    }

    if (pathname === "/login" || pathname === "/pending") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    return response;
  } catch {
    // Never hard-fail the edge (avoids MIDDLEWARE_INVOCATION_FAILED). Page-level
    // route guards (requireUser) still protect every authenticated route.
    return response;
  }
}
