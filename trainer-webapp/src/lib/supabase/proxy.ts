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

  // getUser() fragt Supabase Auth und ist deshalb die belastbare serverseitige
  // Prüfung. getSession() allein würde nur den Cookie-Inhalt lesen.
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  const isPublicAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth/callback") ||
    request.nextUrl.pathname.startsWith("/einladung");
  const isRecoveryRoute = request.nextUrl.pathname.startsWith(
    "/konto-wiederherstellen",
  );

  if (!user && !isPublicAuthRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    // Nur diese Tabelle bleibt fuer deaktivierte Nutzer lesbar. So kann der
    // Proxy jeden anderen App-Bereich bis zur bewussten Wiederherstellung sperren.
    const { data: deletion } = await supabase
      .from("account_deletion_requests")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    const deletionIsScheduled = deletion?.status === "scheduled";

    if (
      deletionIsScheduled &&
      !isRecoveryRoute &&
      !request.nextUrl.pathname.startsWith("/auth/callback")
    ) {
      const recoveryUrl = request.nextUrl.clone();
      recoveryUrl.pathname = "/konto-wiederherstellen";
      recoveryUrl.search = "";
      return NextResponse.redirect(recoveryUrl);
    }

    if (!deletionIsScheduled && isRecoveryRoute) {
      const profileUrl = request.nextUrl.clone();
      profileUrl.pathname = "/profil";
      profileUrl.search = "";
      return NextResponse.redirect(profileUrl);
    }
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = request.nextUrl.searchParams.get("next") || "/";
    targetUrl.search = "";
    return NextResponse.redirect(targetUrl);
  }

  return response;
}
