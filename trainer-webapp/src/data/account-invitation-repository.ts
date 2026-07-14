import type { OrganizationRole } from "@/domain/models";
import {
  getAllowedInvitationRoles,
  type InvitationRole,
} from "@/domain/invitation-permissions";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Lädt die Rollen, die der aktuelle Nutzer auf der Personen-Seite anbieten darf.
 *
 * Ohne Supabase-Konfiguration bleibt die MVP-Oberfläche benutzbar und zeigt die
 * sicherste Trainer-Variante: Athleten und Erziehungsberechtigte.
 */
export async function getAvailableInvitationRoles(): Promise<InvitationRole[]> {
  if (!isSupabaseConfigured()) {
    return ["athlete", "guardian"];
  }

  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);

  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `Einladungsrechte konnten nicht geladen werden: ${error.message}`,
    );
  }

  const memberships = (data || []).map(
    (membership) => membership.role as OrganizationRole,
  );

  return getAllowedInvitationRoles(memberships);
}
