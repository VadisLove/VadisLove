import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Liefert die vom Supabase-Auth-Server bestätigte Nutzer-ID.
 *
 * Serverseitige Actions und Repositories dürfen sich nicht allein auf Claims aus
 * Cookies verlassen. `getUser()` fragt Supabase Auth und schützt so zentrale
 * Mutationen vor manipulierten oder abgelaufenen Session-Daten.
 */
export async function getAuthenticatedUserId(
  supabase: SupabaseServerClient,
): Promise<string | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user.id;
}
