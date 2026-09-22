"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface SettingsActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export interface CalendarFeedActionResult {
  status: "success" | "error";
  message: string;
  feedPath?: string;
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

/** Erzeugt ein neues Geheimnis; gespeichert wird ausschließlich dessen SHA-256-Hash. */
export async function rotateCalendarFeed(): Promise<CalendarFeedActionResult> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.rpc("rotate_calendar_feed_token", {
    new_token_hash: tokenHash,
  });
  if (error) {
    return { status: "error", message: "Der Kalender-Link konnte nicht erstellt werden." };
  }
  revalidatePath("/einstellungen");
  return {
    status: "success",
    message: "Der neue Link ist aktiv. Ein vorheriger Link wurde sofort widerrufen.",
    feedPath: `/api/calendar/${token}`,
  };
}

/** Widerruft den aktiven Link sofort; der Feed liefert danach keine Daten mehr. */
export async function revokeCalendarFeed(): Promise<CalendarFeedActionResult> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };
  const { error } = await supabase.rpc("revoke_calendar_feed_token");
  if (error) return { status: "error", message: "Der Kalender-Link konnte nicht widerrufen werden." };
  revalidatePath("/einstellungen");
  return { status: "success", message: "Der Kalender-Link wurde widerrufen." };
}
