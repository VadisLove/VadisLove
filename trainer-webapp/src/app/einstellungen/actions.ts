"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface SettingsActionState {
  status: "idle" | "success" | "error";
  message: string;
}

/** Speichert alle Benachrichtigungsschalter atomar per Upsert. */
export async function saveNotificationPreferences(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const enabled = (field: string) => formData.get(field) === "on";
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: currentUserId,
      relationship_requests: enabled("relationshipRequests"),
      request_updates: enabled("requestUpdates"),
      group_activity: enabled("groupActivity"),
      new_events: enabled("newEvents"),
      training_plans: enabled("trainingPlans"),
      guardian_activity: enabled("guardianActivity"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return {
      status: "error",
      message: "Die Benachrichtigungseinstellungen konnten nicht gespeichert werden.",
    };
  }

  revalidatePath("/einstellungen");
  revalidatePath("/", "layout");
  return { status: "success", message: "Einstellungen wurden gespeichert." };
}
