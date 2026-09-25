"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";

/** Die Datenbank prüft Beziehungen, Session-Abschluss und Korrekturverweis erneut. */
export async function addReview(_previous: { message: string }, form: FormData) {
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase))) return { message: "Bitte erneut anmelden." };
  try {
    const { error } = await supabase.rpc("training_recap_add_review", {
      request_id: form.get("request_id"), participant: form.get("participant"),
      exercise: form.get("exercise") || null, review_kind: form.get("kind"),
      review_body: form.get("body"), replaces: form.get("replaces") || null,
    });
    if (error) return { message: error.message.includes("REVIEW_REQUEST_REQUIRED")
      ? "Bitte zuerst eine Bestätigung für diese Übung anfragen."
      : error.code === "42501" ? "Die aktuellen Berechtigungen erlauben diese Ergänzung nicht."
      : "Nicht gespeichert. Prüfe Übung, Eintragsart und Korrekturverweis; lade gegebenenfalls den aktuellen Stand." };
    revalidatePath("/trainingsplaene");
    return { message: "Ergänzung gespeichert." };
  } catch {
    // Dieselbe Request-ID bleibt im Formular für eine sichere Wiederholung erhalten.
    return { message: "Speicherung nicht bestätigt. Bitte unverändert erneut versuchen." };
  }
}
