"use server";

import { revalidatePath } from "next/cache";
import { familyErrorCode, type FamilyResult } from "@/domain/family";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/** Jede Aktion authentifiziert erneut; die Datenbank prüft die Beziehung atomar. */
async function command(name: string, args: Record<string, unknown>): Promise<FamilyResult> {
  try {
    const db = await createClient();
    if (!await getAuthenticatedUserId(db)) return { ok: false, code: "forbidden" };
    const { data, error } = await db.rpc(name, args);
    if (error) return { ok: false, code: familyErrorCode(error.message) };
    revalidatePath("/familie");
    revalidatePath("/kalender");
    revalidatePath("/");
    return { ok: true, code: "saved", ...(name === "family_invite_guardian" ? { invitationToken: data as string } : {}) };
  } catch {
    // Keine Tokens, Namen oder E-Mail-Adressen in Serverlogs schreiben.
    return { ok: false, code: "failed" };
  }
}

export async function createFamilyChild(id: string, name: string, declaration: boolean) {
  return command("family_create_child", { child_id: id, child_name: name, declaration });
}
export async function inviteFamilyGuardian(athleteId: string, email: string) {
  return command("family_invite_guardian", { target: athleteId, recipient_email: email });
}
export async function acceptFamilyInvitation(token: string, declaration: boolean) {
  return command("family_accept_invitation", { token, declaration });
}

/** Eine veraltete Ansicht darf die Antwort des anderen Elternteils nicht überschreiben. */
export async function respondFamilyEvent(athleteId: string, eventId: string,
  response: "confirmed" | "declined" | null, revision: number,
  responseAt: string | null, acknowledge = false) {
  return command("family_respond_event", {
    target: athleteId, event: eventId, response, expected_revision: revision,
    expected_response_at: responseAt, acknowledge,
  });
}
