import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { OFFICIAL_SOURCES, type OfficialState } from "@/domain/geodata";
import { loadOfficialGround } from "@/lib/official-geodata";

// Kachelabruf und Rasterung können bei großen Ausschnitten einige Sekunden dauern.
export const maxDuration = 60;

const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/**
 * Schritt 7b: holt Höhenraster und Luftbild aus amtlichen Open Data (Bayern, Sachsen),
 * legt beide Dateien im eigenen Speicherordner ab und liefert die Einträge für den
 * Parkinhalt zurück. Übernommen werden sie erst mit dem Speichern einer Parkversion.
 */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ message: "Ungültiger Ursprung." }, { status: 403 });
  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) return NextResponse.json({ message: "Bitte erneut anmelden." }, { status: 401 });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ message: "Ungültige Eingabe." }, { status: 400 });
  }
  const state = input.state as OfficialState;
  if (
    !(state in OFFICIAL_SOURCES) ||
    !num(input.lat, 47, 56) ||
    !num(input.lon, 5, 16) ||
    !num(input.width, 10, 200) ||
    !num(input.length, 10, 200) ||
    !num(input.offsetX, -500, 500) ||
    !num(input.offsetZ, -500, 500)
  )
    return NextResponse.json({ message: "Ungültige Eingabe." }, { status: 400 });

  try {
    const ground = await loadOfficialGround({
      state,
      lat: input.lat as number,
      lon: input.lon as number,
      width: input.width as number,
      length: input.length as number,
      offsetX: input.offsetX as number,
      offsetZ: input.offsetZ as number,
    });
    const source = OFFICIAL_SOURCES[state];
    const heightPath = `${userId}/${crypto.randomUUID()}.bin`;
    const aerialPath = `${userId}/${crypto.randomUUID()}.jpg`;
    const [heightUpload, aerialUpload] = await Promise.all([
      supabase.storage.from("skatepark-models").upload(heightPath, Buffer.from(ground.heights.buffer), {
        contentType: "application/octet-stream",
        upsert: false,
      }),
      supabase.storage.from("skatepark-aerials").upload(aerialPath, Buffer.from(ground.aerial), {
        contentType: "image/jpeg",
        upsert: false,
      }),
    ]);
    if (heightUpload.error || aerialUpload.error) throw new Error("GEODATA_STORE");

    const win = ground.window;
    const width = Math.round((win.maxX - win.minX) * 100) / 100;
    const length = Math.round((win.maxY - win.minY) * 100) / 100;
    const [aerialUrl, heightUrl] = await Promise.all([
      supabase.storage.from("skatepark-aerials").createSignedUrl(aerialPath, 3600),
      supabase.storage.from("skatepark-models").createSignedUrl(heightPath, 3600),
    ]);
    return NextResponse.json({
      size: { width, length },
      ground: {
        kind: "terrain",
        path: heightPath,
        cols: win.cols,
        rows: win.rows,
        width,
        length,
        minHeight: ground.minHeight,
        maxHeight: ground.maxHeight,
        attribution: source.attribution,
        stand: ground.stand,
      },
      aerial: {
        path: aerialPath,
        width,
        aspect: Math.round((length / width) * 10000) / 10000,
        rotation: 0,
        offsetX: 0,
        offsetZ: 0,
        opacity: 1,
        // Amtliche Open Data: Nutzung durch die Lizenz gedeckt, Quellenangabe wird angezeigt.
        rightsConfirmed: true,
        attribution: source.attribution,
      },
      geo: {
        state,
        lat: input.lat,
        lon: input.lon,
        x: Math.round(ground.center.x * 100) / 100,
        y: Math.round(ground.center.y * 100) / 100,
      },
      urls: { [aerialPath]: aerialUrl.data?.signedUrl, [heightPath]: heightUrl.data?.signedUrl },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        message:
          code === "GEODATA_NO_TILE"
            ? "Für diesen Ort liefert das Land keine Höhendaten."
            : "Amtliche Daten konnten nicht geladen werden. Bitte später erneut versuchen.",
      },
      { status: 502 },
    );
  }
}
