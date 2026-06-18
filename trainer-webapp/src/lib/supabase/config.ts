/**
 * Prüft zentral, ob die öffentlichen Supabase-Zugangsdaten vorhanden sind.
 *
 * So bleibt das UI auch während der lokalen Einrichtung verständlich und der
 * Session-Proxy kann ohne Zugangsdaten kontrolliert übersprungen werden.
 */
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase ist noch nicht konfiguriert. Bitte .env.local ausfüllen.",
    );
  }

  return { url, publishableKey };
}
