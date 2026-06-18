import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Erstellt pro Server-Anfrage einen Supabase-Client mit Cookie-Sitzung.
 *
 * Das Schreiben kann in reinen Server Components fehlschlagen. Der Proxy
 * übernimmt dort die Aktualisierung der Sitzung und setzt die Cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components dürfen keine Cookies schreiben. Der Proxy
          // aktualisiert die Sitzung vor dem Rendern der geschützten Seite.
        }
      },
    },
  });
}
