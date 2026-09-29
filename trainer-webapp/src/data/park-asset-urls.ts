import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

/** Signierte Links gelten 7 Tage und werden 6 Tage lang wiederverwendet. */
const URL_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const URL_REUSE_SECONDS = 6 * 24 * 60 * 60;

/**
 * Parkdateien ändern sich pro Pfad nie (jede Version speichert neue Dateien unter
 * neuer UUID). Ein stabiler signierter Link je Datei lässt Browser und CDN die
 * Datei aus dem Cache liefern und senkt so den Egress aus Supabase.
 * Signiert wird mit der Service-Rolle, aber nur für Pfade, die `park_detail` dem
 * angemeldeten Nutzer bereits geliefert hat; Park-Buckets sind für alle aktiven
 * Nutzer lesbar.
 */
const signCached = unstable_cache(
  async (bucket: string, path: string) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("PARK_ASSET_SIGNING_NOT_CONFIGURED");
    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(path, URL_LIFETIME_SECONDS);
    // Fehler werfen statt `null` zu cachen, damit der nächste Aufruf neu signiert.
    if (error || !data?.signedUrl) throw new Error("PARK_ASSET_SIGNING_FAILED");
    return data.signedUrl;
  },
  ["park-asset-url-v1"],
  { revalidate: URL_REUSE_SECONDS },
);

/** Liefert signierte Links je Pfad; fehlende oder nicht signierbare Dateien fehlen im Ergebnis. */
export async function signParkAssets(bucket: string, paths: string[]) {
  const entries = await Promise.all(
    paths.map(async (path) => {
      try {
        return [path, await signCached(bucket, path)] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}
