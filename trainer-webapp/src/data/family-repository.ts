import "server-only";
import type { FamilyOverview } from "@/domain/family";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";

/** Der RPC liefert nur Kinder des aktuellen Kontos und deren eigene Termindaten. */
export async function getFamilyOverview(): Promise<FamilyOverview> {
  const db = await createClient();
  if (!await getAuthenticatedUserId(db)) throw new Error("FAMILY_FORBIDDEN");
  const { data, error } = await db.rpc("family_overview");
  if (error || !data) throw new Error("FAMILY_LOAD_FAILED");
  return data as FamilyOverview;
}

export async function getFamilyInvitationName(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const db = await createClient();
  if (!await getAuthenticatedUserId(db)) return null;
  const { data, error } = await db.rpc("family_invitation_preview", { token });
  return error || typeof data !== "string" ? null : data;
}

/** Nur eine aktive Elternverknüpfung begründet den Hinweis bei Selbstanmeldung. */
export async function getOwnFamilyNotice(): Promise<boolean> {
  const db = await createClient();
  if (!await getAuthenticatedUserId(db)) return false;
  const { data, error } = await db.rpc("family_self_notice");
  return !error && data === true;
}
