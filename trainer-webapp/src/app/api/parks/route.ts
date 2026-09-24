import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { getParkDetail, getParkDirectory } from "@/data/park-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lädt entweder die Parkliste oder mit `?park=<id>` einen einzelnen Park. */
async function load(parkId: string | null) {
  return parkId ? getParkDetail(parkId) : getParkDirectory();
}

export async function GET(request: Request) {
  const parkId = new URL(request.url).searchParams.get("park");
  if (parkId && !UUID.test(parkId))
    return NextResponse.json({ message: "Unbekannter Park." }, { status: 404 });
  try {
    return NextResponse.json(await load(parkId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "Parks konnten nicht geladen werden. Bitte erneut versuchen." },
      { status: 503 },
    );
  }
}

/** Fehlercodes der Datenbank in verständliche Meldungen übersetzen. */
function describe(error: { code?: string; message: string }) {
  if (error.code === "40001")
    return "Anderswo geändert. Lade den aktuellen Stand und prüfe deine Eingabe.";
  if (error.code === "42501") return "Für diese Aktion fehlen dir die Rechte.";
  if (error.message.includes("TRICK_PENDING"))
    return "Dieser Trick wurde bereits vorgeschlagen und wird gerade geprüft.";
  return "Die Eingabe konnte nicht gespeichert werden. Prüfe deine Angaben.";
}

/** Cookie-authentisierte Mutationen erfordern zusätzlich dieselbe Origin.
 * Die Datenbank prüft Rechte, Nutzdaten, Revision und Idempotenz unabhängig davon.
 * Mit `reload` (Park-ID) wird der aktualisierte Stand direkt mitgeliefert.
 */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { ok: false, message: "Ungültiger Ursprung." },
      { status: 403 },
    );
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase)))
    return NextResponse.json(
      { ok: false, message: "Bitte erneut anmelden." },
      { status: 401 },
    );
  try {
    const raw = await request.text();
    if (raw.length > 230000)
      return NextResponse.json(
        { ok: false, message: "Die Eingabe ist zu groß." },
        { status: 413 },
      );
    const input = JSON.parse(raw);
    const { data, error } = await supabase.rpc("park_command", {
      request_id: input.request_id,
      operation: input.operation,
      payload: input.payload,
    });
    if (error) {
      const conflict = error.code === "40001";
      return NextResponse.json(
        { ok: false, conflict, message: describe(error) },
        { status: conflict ? 409 : 400 },
      );
    }
    const reload =
      typeof input.reload === "string" && UUID.test(input.reload)
        ? input.reload
        : null;
    // Scheitert der folgende Abruf, darf dieselbe Request-ID gefahrlos wiederholt werden.
    return NextResponse.json({
      ok: true,
      result: data,
      state: input.reload === undefined ? null : await load(reload),
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Speicherung nicht bestätigt. Bitte erneut versuchen." },
      { status: 503 },
    );
  }
}
