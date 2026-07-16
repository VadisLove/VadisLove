"use server";

import { revalidatePath } from "next/cache";
import type {
  TrainingExerciseDemoVideo,
  TrainingPlan,
  TrainingVideoEvidence,
  TrickProgressStatus,
} from "@/domain/models";
import { normalizeTrainingPlan } from "@/domain/training-plan-normalization";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { parseYoutubeVideoUrl } from "@/lib/youtube-video";

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

export interface TrainingEvidenceActionResult {
  status: "success" | "error";
  message: string;
  evidence?: TrainingVideoEvidence;
  athleteUserId?: string;
  xpTotal?: number;
}

export interface TrainingDemoActionResult {
  status: "success" | "error";
  message: string;
  demo?: TrainingExerciseDemoVideo;
}

const sharedPlanPrefix = "shared-";

interface TrainingVideoEvidenceActionRow {
  id: string;
  snapshot_share_id: string;
  trick_id: string;
  athlete_id: string;
  provider: "youtube";
  video_id: string;
  athlete_comment: string;
  attempt_count: number;
  self_rating: 1 | 2 | 3 | 4 | 5;
  submitted_at: string;
  review_status: "pending" | "approved" | "changes_requested";
  trainer_feedback: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

function mapEvidenceRow(row: TrainingVideoEvidenceActionRow): TrainingVideoEvidence {
  return {
    id: row.id,
    planId: `${sharedPlanPrefix}${row.snapshot_share_id}`,
    trickId: row.trick_id,
    athleteId: row.athlete_id,
    provider: row.provider,
    videoId: row.video_id,
    athleteComment: row.athlete_comment,
    attemptCount: row.attempt_count,
    selfRating: row.self_rating,
    submittedAt: row.submitted_at,
    reviewStatus: row.review_status,
    trainerFeedback: row.trainer_feedback,
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
  };
}

const evidenceSelect = "id, snapshot_share_id, trick_id, athlete_id, provider, video_id, athlete_comment, attempt_count, self_rating, submitted_at, review_status, trainer_feedback, reviewed_by, reviewed_at";

interface TrainingExerciseDemoVideoActionRow {
  id: string;
  source_plan_id: string;
  trick_id: string;
  created_by: string;
  provider: "youtube";
  video_id: string;
  title: string;
  trainer_note: string;
  visibility: "assigned" | "public";
  created_at: string;
}

const demoSelect = "id, source_plan_id, trick_id, created_by, provider, video_id, title, trainer_note, visibility, created_at";

function mapDemoRow(row: TrainingExerciseDemoVideoActionRow): TrainingExerciseDemoVideo {
  return {
    id: row.id,
    sourcePlanId: row.source_plan_id,
    trickId: row.trick_id,
    createdBy: row.created_by,
    provider: row.provider,
    videoId: row.video_id,
    title: row.title,
    trainerNote: row.trainer_note,
    visibility: row.visibility,
    createdAt: row.created_at,
  };
}

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
    console.error("Trick-Fortschritt konnte nicht aktualisiert werden.", {
      code: error.code,
      message: error.message,
      requestedStatus: status,
    });
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
 * Prueft die rohe URL erneut innerhalb der Vercel Server Action. An Supabase
 * werden nur der feste Provider und die extrahierte Video-ID uebergeben.
 */
export async function submitTrainingVideoEvidence({
  planId,
  trickId,
  youtubeUrl,
  athleteComment,
  attemptCount,
  selfRating,
}: {
  planId: string;
  trickId: string;
  youtubeUrl: string;
  athleteComment: string;
  attemptCount: number;
  selfRating: number;
}): Promise<TrainingEvidenceActionResult> {
  const parsedUrl = parseYoutubeVideoUrl(youtubeUrl);
  const normalizedComment = athleteComment.trim();
  if (!planId.startsWith(sharedPlanPrefix) || !trickId.trim()) {
    return { status: "error", message: "Die zugewiesene Übung wurde nicht gefunden." };
  }
  if (!parsedUrl.ok) {
    return { status: "error", message: parsedUrl.error };
  }
  if (!Number.isInteger(attemptCount) || attemptCount < 1 || attemptCount > 100_000) {
    return { status: "error", message: "Bitte eine gültige Anzahl von Versuchen eingeben." };
  }
  if (!Number.isInteger(selfRating) || selfRating < 1 || selfRating > 5) {
    return { status: "error", message: "Bitte eine Selbsteinschätzung von 1 bis 5 wählen." };
  }
  if (normalizedComment.length > 2_000) {
    return { status: "error", message: "Der Kommentar darf höchstens 2.000 Zeichen lang sein." };
  }

  const snapshotShareId = planId.slice(sharedPlanPrefix.length);
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const { data, error } = await supabase
    .from("training_video_evidence")
    .insert({
      snapshot_share_id: snapshotShareId,
      trick_id: trickId,
      athlete_id: currentUserId,
      provider: parsedUrl.provider,
      video_id: parsedUrl.videoId,
      athlete_comment: normalizedComment,
      attempt_count: attemptCount,
      self_rating: selfRating,
    })
    .select(evidenceSelect)
    .single();

  if (error) {
    // Die rohe URL wird absichtlich weder protokolliert noch an Supabase uebergeben.
    console.error("Videonachweis konnte nicht eingereicht werden.", {
      code: error.code,
      message: error.message,
    });
    return {
      status: "error",
      message: error.code === "23505"
        ? "Für diese Übung wartet bereits ein Nachweis auf Prüfung."
        : error.code === "42501"
          ? "Du kannst nur eigene, laufende Übungen zur Prüfung einreichen."
          : "Der Nachweis konnte nicht gespeichert werden. Bitte erneut versuchen.",
    };
  }

  revalidatePath("/trainingsplaene");
  return {
    status: "success",
    message: "Dein YouTube-Nachweis wurde sicher zur Prüfung eingereicht.",
    evidence: mapEvidenceRow(data as TrainingVideoEvidenceActionRow),
  };
}

/** Prueft einen Nachweis; der Datenbank-Trigger aktualisiert Status und XP atomar. */
export async function reviewTrainingVideoEvidence({
  evidenceId,
  decision,
  trainerFeedback,
}: {
  evidenceId: string;
  decision: "approved" | "changes_requested";
  trainerFeedback: string;
}): Promise<TrainingEvidenceActionResult> {
  const normalizedFeedback = trainerFeedback.trim();
  if (!evidenceId.trim()) {
    return { status: "error", message: "Der Nachweis wurde nicht gefunden." };
  }
  if (decision === "changes_requested" && !normalizedFeedback) {
    return { status: "error", message: "Bitte beschreibe die gewünschte Änderung." };
  }
  if (normalizedFeedback.length > 2_000) {
    return { status: "error", message: "Das Feedback darf höchstens 2.000 Zeichen lang sein." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const { data, error } = await supabase
    .from("training_video_evidence")
    .update({
      review_status: decision,
      trainer_feedback: normalizedFeedback,
      reviewed_by: currentUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", evidenceId)
    .eq("review_status", "pending")
    .select(evidenceSelect)
    .single();

  if (error) {
    console.error("Videonachweis konnte nicht geprüft werden.", {
      code: error.code,
      message: error.message,
      decision,
    });
    return {
      status: "error",
      message: error.code === "42501" || error.code === "PGRST116"
        ? "Nur der zugeordnete Trainer kann einen offenen Nachweis prüfen."
        : "Die Prüfentscheidung konnte nicht gespeichert werden.",
    };
  }

  const evidence = mapEvidenceRow(data as TrainingVideoEvidenceActionRow);
  const { data: leaderboardData } = await supabase.rpc("get_training_xp_leaderboard");
  const xpEntry = Array.isArray(leaderboardData)
    ? leaderboardData.find((entry) => entry.user_id === evidence.athleteId)
    : undefined;

  revalidatePath("/trainingsplaene");
  return {
    status: "success",
    message: decision === "approved"
      ? "Nachweis bestätigt, Übung abgeschlossen und XP aktualisiert."
      : "Änderung angefordert. Die Übung ist wieder in Arbeit.",
    evidence,
    athleteUserId: evidence.athleteId,
    xpTotal: typeof xpEntry?.xp_total === "number" ? xpEntry.xp_total : undefined,
  };
}

/**
 * Speichert ein Trainer-Demo fuer die logische Plan-ID. Die Server Action
 * validiert dieselbe YouTube-URL nochmals und uebergibt nur die Video-ID an
 * Supabase; RLS prueft zusaetzlich Plan, Uebung und erstellenden Trainer.
 */
export async function submitTrainingExerciseDemoVideo({
  planId,
  sourcePlanId,
  trickId,
  youtubeUrl,
  title,
  trainerNote,
  visibility,
}: {
  planId: string;
  sourcePlanId: string;
  trickId: string;
  youtubeUrl: string;
  title: string;
  trainerNote: string;
  visibility: "assigned" | "public";
}): Promise<TrainingDemoActionResult> {
  const parsedUrl = parseYoutubeVideoUrl(youtubeUrl);
  const normalizedTitle = title.trim();
  const normalizedNote = trainerNote.trim();
  if (!planId.startsWith(sharedPlanPrefix) || !sourcePlanId.trim() || !trickId.trim()) {
    return { status: "error", message: "Die geteilte Übung wurde nicht gefunden." };
  }
  if (!parsedUrl.ok) {
    return { status: "error", message: parsedUrl.error };
  }
  if (!normalizedTitle || normalizedTitle.length > 160) {
    return { status: "error", message: "Der Titel muss zwischen 1 und 160 Zeichen lang sein." };
  }
  if (normalizedNote.length > 2_000) {
    return { status: "error", message: "Der Hinweis darf höchstens 2.000 Zeichen lang sein." };
  }
  if (visibility !== "assigned" && visibility !== "public") {
    return { status: "error", message: "Bitte eine gültige Sichtbarkeit wählen." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const { data, error } = await supabase
    .from("training_exercise_demo_videos")
    .insert({
      origin_snapshot_share_id: planId.slice(sharedPlanPrefix.length),
      source_plan_id: sourcePlanId.trim(),
      trick_id: trickId,
      created_by: currentUserId,
      provider: parsedUrl.provider,
      video_id: parsedUrl.videoId,
      title: normalizedTitle,
      trainer_note: normalizedNote,
      visibility,
    })
    .select(demoSelect)
    .single();

  if (error) {
    // Weder rohe URL noch Formulardaten landen in Runtime-Logs.
    console.error("Trainer-Demo konnte nicht gespeichert werden.", {
      code: error.code,
      message: error.message,
    });
    return {
      status: "error",
      message: error.code === "23505"
        ? "Dieses Demo ist für die Übung bereits hinterlegt."
        : error.code === "42501"
          ? "Nur der Trainer der persönlichen Planfreigabe darf ein Demo hinterlegen."
          : "Das Trainer-Demo konnte nicht gespeichert werden. Bitte erneut versuchen.",
    };
  }

  revalidatePath("/trainingsplaene");
  return {
    status: "success",
    message: visibility === "public"
      ? "Trainer-Demo für alle angemeldeten Nutzer veröffentlicht."
      : "Trainer-Demo für zugewiesene Athleten veröffentlicht.",
    demo: mapDemoRow(data as TrainingExerciseDemoVideoActionRow),
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

  const normalizedPlan = normalizeTrainingPlan(plan);
  const serializedPlan = JSON.stringify(normalizedPlan);
  if (serializedPlan.length > 240_000) {
    return { status: "error", message: "Der Trainingsplan ist zu groß zum Teilen." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const { data, error } = await supabase
    .from("training_plan_snapshot_shares")
    .insert(
      uniqueRecipients.map((recipientUserId) => ({
        shared_by: currentUserId,
        target_type: "person",
        recipient_user_id: recipientUserId,
        title: normalizedPlan.title.trim(),
        plan_snapshot: normalizedPlan,
      })),
    )
    .select("id, recipient_user_id");

  if (error) {
    // Der Fehlercode hilft in den Runtime-Logs, ohne Planinhalte preiszugeben.
    console.error("Trainingsplan konnte nicht geteilt werden.", {
      code: error.code,
      message: error.message,
    });
    return {
      status: "error",
      message: error.code === "42501"
        ? "Der Plan kann nur an bestätigte Kontakte oder zugeordnete Athleten gesendet werden."
        : "Der Trainingsplan konnte nicht zugestellt werden. Bitte erneut versuchen.",
    };
  }

  const deliveredRecipients = new Set(
    (data || []).map((share) => share.recipient_user_id),
  );
  if (deliveredRecipients.size !== uniqueRecipients.length) {
    console.error("Trainingsplan-Freigabe wurde nicht vollständig bestätigt.", {
      expectedRecipients: uniqueRecipients.length,
      deliveredRecipients: deliveredRecipients.size,
    });
    return {
      status: "error",
      message: "Der Trainingsplan wurde nicht vollständig zugestellt. Bitte erneut versuchen.",
    };
  }

  revalidatePath("/trainingsplaene");
  revalidatePath("/", "layout");
  return {
    status: "success",
    message: `Der Plan wurde ${uniqueRecipients.length} Kontakt${uniqueRecipients.length === 1 ? "" : "en"} zugestellt.`,
  };
}
