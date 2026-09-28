import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { geocode } from "@/lib/official-geodata";

/**
 * Adresssuche für den Park-Untergrund (Schritt 7b). Nur für angemeldete Nutzer,
 * damit der öffentliche Nominatim-Dienst nicht über die App missbraucht wird.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase)))
    return NextResponse.json({ message: "Bitte erneut anmelden." }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3 || q.length > 200)
    return NextResponse.json({ message: "Bitte mindestens drei Zeichen eingeben." }, { status: 400 });
  try {
    return NextResponse.json({ results: await geocode(q) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Adresssuche gerade nicht erreichbar." }, { status: 503 });
  }
}
