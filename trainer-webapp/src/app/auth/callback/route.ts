import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Tauscht den einmaligen Code aus der Bestätigungs-E-Mail gegen eine Sitzung.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedPath = request.nextUrl.searchParams.get("next") || "/";
  const nextPath = requestedPath.startsWith("/") ? requestedPath : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "message",
    "Der Bestätigungslink ist ungültig oder abgelaufen.",
  );
  return NextResponse.redirect(loginUrl);
}
