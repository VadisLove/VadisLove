import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import type { ParkDetail, ParkDirectory, ParkVersion } from "@/domain/parks";

export const AERIAL_BUCKET = "skatepark-aerials";

/** Parkliste, sichtbare Runs und offene Trick-Vorschläge (nur für Prüfer gefüllt). */
export async function getParkDirectory(): Promise<ParkDirectory> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Bitte erneut anmelden.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("park_directory");
  if (error || !data)
    throw new Error("Parks konnten nicht geladen werden. Bitte erneut versuchen.");
  return data as ParkDirectory;
}

/**
 * Parkdetail mit allen benötigten Versionen. Luftbilder liegen in einem privaten
 * Bucket; die Seite erhält nur kurzlebige, signierte URLs.
 * Liefert `null`, wenn der Park nicht existiert.
 */
export async function getParkDetail(parkId: string): Promise<ParkDetail | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Bitte erneut anmelden.");
  const supabase = await createClient();
  const [detail, people] = await Promise.all([
    supabase.rpc("park_detail", { target: parkId }),
    getPeopleDirectory().catch(() => []),
  ]);
  if (detail.error)
    throw new Error("Park konnte nicht geladen werden. Bitte erneut versuchen.");
  if (!detail.data) return null;
  const raw = detail.data as Omit<ParkDetail, "aerialUrls" | "athletes" | "user">;

  const paths = [
    ...new Set(
      raw.versions
        .map((v: ParkVersion) => v.content.aerial?.path)
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  const aerialUrls: Record<string, string> = {};
  if (paths.length) {
    const { data } = await supabase.storage
      .from(AERIAL_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const entry of data ?? [])
      if (entry.path && entry.signedUrl) aerialUrls[entry.path] = entry.signedUrl;
  }

  // Auswahl für neue Runs: man selbst und aktiv zugeordnete Athleten.
  // Die Datenbank prüft die Beziehung beim Speichern erneut.
  const athletes = [
    { id: user.id, name: `${user.displayName} (ich)` },
    ...people
      .filter(
        (p) =>
          p.id !== user.id &&
          p.accountType === "athlete" &&
          p.activeRelationships?.includes("trainer_athlete"),
      )
      .map((p) => ({ id: p.id, name: p.name })),
  ];

  return {
    ...raw,
    aerialUrls,
    athletes,
    user: { id: user.id, displayName: user.displayName },
  };
}
