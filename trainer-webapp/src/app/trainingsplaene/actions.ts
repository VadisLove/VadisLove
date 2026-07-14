"use server";

import { revalidatePath } from "next/cache";
import type {
  TrainingPlan,
  TrickProgressStatus,
} from "@/domain/models";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface ShareTrainingPlanInput {
  plan: TrainingPlan;
  recipientUserIds: string[];
}

export interface ShareTrainingPlanResult {
  status: "success" | "error";
  message: string;
}

export interface UpdateTrickProgressResult {
  status: "success" | "error";
  message: string;
  athleteUserId?: string;
  xpTotal?: number;
}

const sharedPlanPrefix = "shared-";

/**
 * Persistiert einen Trickstatus ueber die abgesicherte Datenbankfunktion.
 * Die eigentliche Rollen- und Beziehungspruefung findet bewusst in Postgres
 * statt, damit sie nicht durch einen direkten Browseraufruf umgangen wird.
 */
export async function updateSharedTrickProgress({
  planId,
  trickId,
  status,
}: {
  planId: string;
  trickId: string;
  status: TrickProgressStatus;
}): Promise<UpdateTrickProgressResult> {
  if (!planId.startsWith(sharedPlanPrefix) || !trickId.trim()) {
    return { status: "error", message: "Der geteilte Trick wurde nicht gefunden." };
  }

  const snapshotShareId = planId.slice(sharedPlanPrefix.length);
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) {
    return { status: "error", message: "Bitte erneut anmelden." };
  }

  const { data, error } = await supabase.rpc("update_training_trick_progress", {
    p_snapshot_share_id: snapshotShareId,
    p_trick_id: trickId,
    p_status: status,
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "42501"
        ? "Diese Aktion darf nur der zugeordnete Athlet oder Trainer ausführen."
        : "Der Trick-Fortschritt konnte nicht gespeichert werden.",
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  revalidatePath("/trainingsplaene");

  return {
    status: "success",
    message: status === "confirmed" ? "Trick bestätigt und XP aktualisiert." : "Fortschritt gespeichert.",
    athleteUserId: result?.athlete_user_id,
    xpTotal: result?.xp_total,
  };
}

/**
 * Speichert beim Teilen eine dauerhafte Momentaufnahme des aktuellen Plans.
 * Das ist absichtlich serverseitig und RLS-geschuetzt: Nur bestaetigte Kontakte
 * koennen als Empfaenger eingetragen werden.
 */
export async function shareTrainingPlanSnapshot({
  plan,
  recipientUserIds,
}: ShareTrainingPlanInput): Promise<ShareTrainingPlanResult> {
  const uniqueRecipients = Array.from(new Set(recipientUserIds)).slice(0, 50);
  if (!plan?.title?.trim() || uniqueRecipients.length === 0) {
    return { status: "error", message: "Bitte mindestens einen bestätigten Kontakt auswählen." };
  }

  const serializedPlan = JSON.stringify(plan);
  if (serializedPlan.length > 240_000) {
    return { status: "error", message: "Der Trainingsplan ist zu groß zum Teilen." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const { error } = await supabase.from("training_plan_snapshot_shares").insert(
    uniqueRecipients.map((recipientUserId) => ({
      shared_by: currentUserId,
      target_type: "person",
      recipient_user_id: recipientUserId,
      title: plan.title.trim(),
      plan_snapshot: plan,
    })),
  );

  if (error) {
    return {
      status: "error",
      message: "Der Plan konnte nur mit bestätigten Kontakten geteilt werden.",
    };
  }

  revalidatePath("/trainingsplaene");
  revalidatePath("/", "layout");
  return {
    status: "success",
    message: `Der Plan wurde mit ${uniqueRecipients.length} Kontakt${uniqueRecipients.length === 1 ? "" : "en"} geteilt.`,
  };
}
