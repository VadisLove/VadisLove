import { cache } from "react";
import type { AccountType, CurrentUser } from "@/domain/current-user";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
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
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);

  if (!userId) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, account_type, avatar_path")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const accountType = profile.account_type as AccountType;
  const displayName = profile.display_name.trim() || "Trainer-Hub Nutzer";
  let avatarUrl: string | null = null;
  if (profile.avatar_path) {
    const { data } = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(profile.avatar_path, 60 * 60);
    avatarUrl = data?.signedUrl || null;
  }

  return {
    id: userId,
    displayName,
    initials: createInitials(displayName) || "TH",
    avatarUrl,
    accountType,
  };
});
