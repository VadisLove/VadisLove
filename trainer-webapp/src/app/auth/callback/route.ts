import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/safe-redirect-path";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordPath,
  passwordRecoveryCookieMaxAgeSeconds,
  passwordRecoveryCookieName,
  passwordResetPath,
} from "@/lib/password-recovery";
import { createPasswordRecoveryGrant } from "@/lib/password-recovery-grant";

/**
 * Tauscht den einmaligen Code aus der Bestätigungs-E-Mail gegen eine Sitzung.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = getSafeRedirectPath(
    request.nextUrl.searchParams.get("next"),
  );

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(new URL(nextPath, request.url));

      // Nur ein erfolgreich eingelöster Code mit dem festgelegten Recovery-Ziel
      // öffnet für kurze Zeit die Passwort-Reset-Seite. Normale Sitzungen
      // erhalten diese HttpOnly-Markierung nicht.
      if (nextPath === passwordResetPath && data.user) {
        let recoveryGrant: string;
        try {
          recoveryGrant = createPasswordRecoveryGrant(data.user.id);
        } catch {
          const recoveryUrl = new URL(forgotPasswordPath, request.url);
          recoveryUrl.searchParams.set("status", "unavailable");
          return NextResponse.redirect(recoveryUrl);
        }

        response.cookies.set(passwordRecoveryCookieName, recoveryGrant, {
          httpOnly: true,
          maxAge: passwordRecoveryCookieMaxAgeSeconds,
          path: passwordResetPath,
          sameSite: "strict",
          secure: request.nextUrl.protocol === "https:",
        });
      }

      return response;
    }
  }

  if (nextPath === passwordResetPath) {
    const recoveryUrl = new URL(forgotPasswordPath, request.url);
    recoveryUrl.searchParams.set("status", "expired");
    return NextResponse.redirect(recoveryUrl);
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "message",
    "Der Bestätigungslink ist ungültig oder abgelaufen.",
  );
  return NextResponse.redirect(loginUrl);
}
