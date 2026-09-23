import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { getTrainingWorkspace } from "@/data/training-repository";

export async function GET() {
  try {
    return NextResponse.json(await getTrainingWorkspace(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        message:
          "Trainings konnten nicht geladen werden. Bitte erneut anmelden oder nochmals versuchen.",
      },
      { status: 503 },
    );
  }
}

/** Cookie-authentisierte Mutationen erfordern zusätzlich dieselbe Origin.
 * Die Datenbank prüft Rechte, Nutzdaten, Revision und Idempotenz unabhängig davon.
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
    if (raw.length > 260000)
      return NextResponse.json(
        { ok: false, message: "Die Eingabe ist zu groß." },
        { status: 413 },
      );
    const input = JSON.parse(raw);
    const { data, error } = await supabase.rpc("training_command", {
      request_id: input.request_id,
      operation: input.operation,
      payload: input.payload,
    });
    if (error) {
      const conflict = error.code === "40001";
      return NextResponse.json(
        {
          ok: false,
          conflict,
          message: conflict
            ? "Anderswo geändert. Lade den aktuellen Stand und prüfe deine Eingabe."
            : error.code === "42501"
              ? "Für diese Aktion fehlen dir die aktuellen Trainingsrechte."
              : error.message.includes("TRAINING_COMPLETED")
                ? "Dieses Training ist bereits abgeschlossen und unveränderlich."
                : "Die Eingabe konnte nicht gespeichert werden. Prüfe den aktuellen Stand und deine Angaben.",
        },
        { status: conflict ? 409 : 400 },
      );
    }
    // Scheitert der folgende Abruf, darf dieselbe Request-ID gefahrlos wiederholt werden.
    return NextResponse.json({
      ok: true,
      result: data,
      workspace: await getTrainingWorkspace(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Speicherung nicht bestätigt. Bitte erneut versuchen.",
      },
      { status: 503 },
    );
  }
}
