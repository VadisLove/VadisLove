import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Schritt 7c: löscht Parks, die seit 30 Tagen im Papierkorb liegen, und danach alle
 * Dateien in `skatepark-aerials` und `skatepark-models`, die in keiner Parkversion
 * vorkommen und älter als 24 Stunden sind. Dateien werden über die Storage-API
 * entfernt; direktes Löschen in storage.objects würde die Datei nicht entfernen.
 */
export async function runParkStorageCleanupWorker() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("PARK_STORAGE_CLEANUP_NOT_CONFIGURED");

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: purged, error: purgeError } = await client.rpc("park_purge_trash", { max_items: 50 });
  if (purgeError) throw new Error("PARK_TRASH_PURGE_FAILED");

  let removed = 0;
  let failed = 0;
  // Höchstens 5 Runden à 200 Dateien pro Aufruf, damit die Route im Zeitlimit bleibt.
  for (let round = 0; round < 5; round += 1) {
    const { data, error } = await client.rpc("park_orphan_objects", { max_items: 200 });
    if (error) throw new Error("PARK_STORAGE_CLEANUP_LIST_FAILED");
    const rows = (data || []) as { bucket_id: string; name: string }[];
    if (!rows.length) break;

    const byBucket = new Map<string, string[]>();
    for (const row of rows) byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) || []), row.name]);
    let roundRemoved = 0;
    for (const [bucket, paths] of byBucket) {
      const { data: deleted, error: removeError } = await client.storage.from(bucket).remove(paths);
      if (removeError) {
        failed += paths.length;
        continue;
      }
      roundRemoved += (deleted || []).length;
      failed += paths.length - (deleted || []).length;
    }
    removed += roundRemoved;
    // Ohne Fortschritt würde die nächste Runde dieselben Dateien erneut liefern.
    if (!roundRemoved || rows.length < 200) break;
  }

  return { purgedParks: Number(purged) || 0, removed, failed };
}
