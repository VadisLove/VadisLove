import "server-only";
import { createClient } from "@supabase/supabase-js";

export const trainingVideoBucket = "training-evidence-videos";

/**
 * Löscht abgelaufene Trick-Videos (älter als 14 Tage bzw. nie gemeldete
 * Uploads älter als 1 Tag) über die Storage-API und markiert die Nachweise.
 * Direktes Löschen in storage.objects würde die Datei nicht entfernen.
 */
export async function runTrainingVideoCleanupWorker() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("TRAINING_VIDEO_CLEANUP_NOT_CONFIGURED");

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let removed = 0;
  let failed = 0;
  // Höchstens 5 Runden à 200 Dateien pro Aufruf, damit die Route im Zeitlimit bleibt.
  for (let round = 0; round < 5; round += 1) {
    const { data, error } = await client.rpc("training_expired_video_objects", { max_items: 200 });
    if (error) throw new Error("TRAINING_VIDEO_CLEANUP_LIST_FAILED");
    const paths = ((data || []) as { name: string }[]).map((row) => row.name);
    if (!paths.length) break;

    const { data: deleted, error: removeError } = await client.storage.from(trainingVideoBucket).remove(paths);
    if (removeError) {
      failed += paths.length;
      break;
    }
    const deletedPaths = (deleted || []).map((object) => object.name);
    if (deletedPaths.length) {
      const { error: markError } = await client.rpc("training_mark_videos_removed", { paths: deletedPaths });
      if (markError) throw new Error("TRAINING_VIDEO_CLEANUP_MARK_FAILED");
    }
    removed += deletedPaths.length;
    failed += paths.length - deletedPaths.length;
    if (paths.length < 200) break;
  }

  return { removed, failed };
}
