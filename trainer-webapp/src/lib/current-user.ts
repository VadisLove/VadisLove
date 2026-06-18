import type { AccountType, CurrentUser } from "@/domain/current-user";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function createInitials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Lädt das sichtbare Profil des angemeldeten Nutzers serverseitig.
 *
 * Berechtigungen werden weiterhin ausschließlich über Mitgliedschaften und
 * RLS geregelt. Der Kontotyp dient hier nur der verständlichen Darstellung.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, account_type")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const accountType = profile.account_type as AccountType;
  const displayName = profile.display_name.trim() || "Trainer-Hub Nutzer";

  return {
    displayName,
    initials: createInitials(displayName) || "TH",
    accountType,
  };
}
