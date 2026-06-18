import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Validiert und erneuert die Supabase-Sitzung vor geschützten Seitenaufrufen.
 */
export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const { url, publishableKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getClaims validiert das JWT. getSession allein wäre serverseitig nicht
  // ausreichend, weil dessen Cookie-Inhalt manipuliert sein könnte.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const isPublicAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth/callback") ||
    request.nextUrl.pathname.startsWith("/einladung");

  if (!claims && !isPublicAuthRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (claims && request.nextUrl.pathname.startsWith("/login")) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = request.nextUrl.searchParams.get("next") || "/";
    targetUrl.search = "";
    return NextResponse.redirect(targetUrl);
  }

  return response;
}
