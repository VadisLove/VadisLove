import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/safe-redirect-path";
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
    request.nextUrl.pathname.startsWith("/einladung") ||
    request.nextUrl.pathname.startsWith("/elternfreigabe") ||
    request.nextUrl.pathname.startsWith("/datenschutz") ||
    request.nextUrl.pathname.startsWith("/nutzungsbedingungen") ||
    request.nextUrl.pathname.startsWith("/impressum");
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

    const { data: guardianApproval } = await supabase
      .from("guardian_approval_requests")
      .select("status, guardian_required_until")
      .eq("minor_user_id", user.id)
      .maybeSingle();
    const guardianApprovalRequired = Boolean(
      guardianApproval &&
      guardianApproval.guardian_required_until > new Date().toISOString().slice(0, 10) &&
      guardianApproval.status !== "approved",
    );

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

    if (
      guardianApprovalRequired &&
      !request.nextUrl.pathname.startsWith("/freigabe-ausstehend") &&
      !request.nextUrl.pathname.startsWith("/elternfreigabe") &&
      !request.nextUrl.pathname.startsWith("/datenschutz") &&
      !request.nextUrl.pathname.startsWith("/nutzungsbedingungen") &&
      !request.nextUrl.pathname.startsWith("/impressum")
    ) {
      const approvalUrl = request.nextUrl.clone();
      approvalUrl.pathname = "/freigabe-ausstehend";
      approvalUrl.search = "";
      return NextResponse.redirect(approvalUrl);
    }
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const nextPath = getSafeRedirectPath(
      request.nextUrl.searchParams.get("next"),
    );
    const targetUrl = new URL(nextPath, request.url);
    return NextResponse.redirect(targetUrl);
  }

  return response;
}
