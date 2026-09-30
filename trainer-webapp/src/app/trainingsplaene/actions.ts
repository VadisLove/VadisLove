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
  provider: "youtube" | "upload" | "note";
  video_id: string | null;
  storage_path: string | null;
  video_duration_seconds: number | null;
  video_removed_at: string | null;
  athlete_comment: string;
  attempt_count: number | null;
  self_rating: 1 | 2 | 3 | 4 | 5 | null;
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
    storagePath: row.storage_path || undefined,
    durationSeconds: row.video_duration_seconds || undefined,
    videoRemovedAt: row.video_removed_at || undefined,
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

const evidenceSelect = "id, snapshot_share_id, trick_id, athlete_id, provider, video_id, storage_path, video_duration_seconds, video_removed_at, athlete_comment, attempt_count, self_rating, submitted_at, review_status, trainer_feedback, reviewed_by, reviewed_at";

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

const uploadPathPattern =
  /^[0-9a-f-]{36}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|mov)$/;

/**
 * Meldung aus dem neuen Planbereich: entweder mit einem bereits in den privaten
 * Bucket hochgeladenen Video (max. 60 Sekunden) oder nur mit einer Notiz.
 * Datenbank-Policy und Constraints prüfen Besitz, Pfad und Dauer erneut.
 */
export async function submitTrainingReport({
  planId,
  trickId,
  note,
  video,
}: {
  planId: string;
  trickId: string;
  note: string;
  video: { storagePath: string; durationSeconds: number } | null;
}): Promise<TrainingEvidenceActionResult> {
  const normalizedNote = note.trim();
  if (!planId.startsWith(sharedPlanPrefix) || !trickId.trim()) {
    return { status: "error", message: "Die zugewiesene Übung wurde nicht gefunden." };
  }
  if (normalizedNote.length > 2_000) {
    return { status: "error", message: "Die Notiz darf höchstens 2.000 Zeichen lang sein." };
  }
  if (!video && !normalizedNote) {
    return { status: "error", message: "Bitte ein Video hinzufügen oder eine Notiz schreiben." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const duration = video ? Math.round(video.durationSeconds) : null;
  if (
    video &&
    (!uploadPathPattern.test(video.storagePath) ||
      !video.storagePath.startsWith(`${currentUserId}/`) ||
      !duration ||
      duration < 1 ||
      duration > 60)
  ) {
    return { status: "error", message: "Das Video ist ungültig oder länger als 60 Sekunden." };
  }

  const { data, error } = await supabase
    .from("training_video_evidence")
    .insert({
      snapshot_share_id: planId.slice(sharedPlanPrefix.length),
      trick_id: trickId,
      athlete_id: currentUserId,
      provider: video ? "upload" : "note",
      video_id: null,
      storage_path: video?.storagePath ?? null,
      video_duration_seconds: duration,
      athlete_comment: normalizedNote,
      attempt_count: null,
      self_rating: null,
    })
    .select(evidenceSelect)
    .single();

  if (error) {
    console.error("Meldung konnte nicht gespeichert werden.", { code: error.code, message: error.message });
    return {
      status: "error",
      message: error.code === "23505"
        ? "Für diesen Trick wartet bereits eine Meldung auf Prüfung."
        : error.code === "42501"
          ? "Du kannst nur eigene, geübte Tricks mit deinem eigenen Video melden."
          : "Die Meldung konnte nicht gespeichert werden. Bitte erneut versuchen.",
    };
  }

  revalidatePath("/trainingsplaene");
  const evidence = mapEvidenceRow(data as TrainingVideoEvidenceActionRow);
  if (evidence.storagePath) {
    const { data: signed } = await supabase.storage
      .from("training-evidence-videos")
      .createSignedUrl(evidence.storagePath, 60 * 60);
    evidence.videoUrl = signed?.signedUrl;
  }
  return { status: "success", message: "Gemeldet.", evidence };
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

/* ------------------------------------------------------------------ */
/* Rechte, Zuweisung, Vorlagen und Anrede (Planbereich, Handoff v3)      */
/* ------------------------------------------------------------------ */

export interface PlanHubActionResult {
  status: "success" | "error";
  message: string;
  count?: number;
}

const forbiddenMessage = "Dafür fehlen dir die Berechtigungen.";

/**
 * Setzt das Erstellrecht einer Athletin/eines Athleten. Nur Trainer*innen mit
 * aktiver Verbindung und der Vorstand des Vereins dürfen das (Prüfung in der DB).
 */
export async function setAthletePlanPermission({
  athleteId,
  allowed,
}: {
  athleteId: string;
  allowed: boolean;
}): Promise<PlanHubActionResult> {
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase))) return { status: "error", message: "Bitte erneut anmelden." };
  const { error } = await supabase.rpc("training_set_plan_permission", {
    p_athlete: athleteId,
    p_allowed: allowed,
  });
  if (error) {
    console.error("Erstellrecht konnte nicht gespeichert werden.", { code: error.code, message: error.message });
    return { status: "error", message: error.code === "42501" ? forbiddenMessage : "Nicht gespeichert. Bitte erneut versuchen." };
  }
  revalidatePath("/trainingsplaene");
  return { status: "success", message: "Gespeichert." };
}

/**
 * Weist einen eigenen Plan einzelnen Athlet*innen, Gruppen oder (Vorstand)
 * allen Gruppen im Verein zu. Gruppen- und Vereinszuweisungen werden
 * gespeichert, damit neue Mitglieder den Plan automatisch erhalten.
 */
export async function assignTrainingPlan({
  plan,
  athleteIds,
  groupIds,
  club,
}: {
  plan: TrainingPlan;
  athleteIds: string[];
  groupIds: string[];
  club: boolean;
}): Promise<PlanHubActionResult> {
  const normalizedPlan = normalizeTrainingPlan(plan);
  if (JSON.stringify(normalizedPlan).length > 240_000) {
    return { status: "error", message: "Der Trainingsplan ist zu groß zum Zuweisen." };
  }
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase))) return { status: "error", message: "Bitte erneut anmelden." };
  const { data, error } = await supabase.rpc("training_assign_plan", {
    p_plan: normalizedPlan,
    p_athletes: Array.from(new Set(athleteIds)).slice(0, 200),
    p_groups: Array.from(new Set(groupIds)).slice(0, 50),
    p_club: club,
  });
  if (error) {
    console.error("Plan konnte nicht zugewiesen werden.", { code: error.code, message: error.message });
    return {
      status: "error",
      message: error.code === "42501"
        ? "Der Plan kann nur verbundenen Athleten, eigenen Gruppen oder dem eigenen Verein zugewiesen werden."
        : "Der Plan konnte nicht zugewiesen werden. Bitte erneut versuchen.",
    };
  }
  revalidatePath("/trainingsplaene");
  revalidatePath("/", "layout");
  return { status: "success", message: "Zugewiesen.", count: Number((data as { shared?: number } | null)?.shared ?? 0) };
}

/** Skater*innen: eigenen Plan mit den eigenen Trainer*innen teilen. */
export async function shareOwnPlanWithTrainer(plan: TrainingPlan): Promise<PlanHubActionResult> {
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase))) return { status: "error", message: "Bitte erneut anmelden." };
  const { error } = await supabase.rpc("training_share_own_plan", { p_plan: normalizeTrainingPlan(plan) });
  if (error) {
    console.error("Plan konnte nicht geteilt werden.", { code: error.code, message: error.message });
    return { status: "error", message: error.code === "42501" ? forbiddenMessage : "Der Plan konnte nicht geteilt werden." };
  }
  revalidatePath("/trainingsplaene");
  return { status: "success", message: "Geteilt." };
}

/** Vorstand: eigenen Plan als Vereinsvorlage freigeben oder zurücknehmen. */
export async function setClubTemplate({
  planId,
  enabled,
}: {
  planId: string;
  enabled: boolean;
}): Promise<PlanHubActionResult> {
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase))) return { status: "error", message: "Bitte erneut anmelden." };
  const { error } = await supabase.rpc("training_set_club_template", { p_plan: planId, p_enabled: enabled });
  if (error) {
    console.error("Vereinsvorlage konnte nicht gespeichert werden.", { code: error.code, message: error.message });
    return { status: "error", message: error.code === "42501" ? forbiddenMessage : "Die Vereinsvorlage konnte nicht gespeichert werden." };
  }
  revalidatePath("/trainingsplaene");
  return { status: "success", message: "Gespeichert." };
}

/** Anrede (m/w/d) des eigenen Profils; steuert nur Texte in der App. */
export async function saveSalutation(salutation: "m" | "w" | "d"): Promise<PlanHubActionResult> {
  if (salutation !== "m" && salutation !== "w" && salutation !== "d") {
    return { status: "error", message: "Bitte eine gültige Anrede wählen." };
  }
  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) return { status: "error", message: "Bitte erneut anmelden." };
  const { error } = await supabase.from("profiles").update({ salutation }).eq("id", userId);
  if (error) {
    console.error("Anrede konnte nicht gespeichert werden.", { code: error.code, message: error.message });
    return { status: "error", message: "Die Anrede konnte nicht gespeichert werden." };
  }
  revalidatePath("/trainingsplaene");
  revalidatePath("/profil");
  return { status: "success", message: "Gespeichert." };
}

/**
 * Trainer*innen bestätigen einen offenen oder geübten Trick direkt aus dem
 * Session-Rückblick. Die DB prüft Beziehung, Status und Quote ≥ 80 % erneut.
 */
export async function confirmTrickFromRecap({
  planId,
  trickId,
  since,
}: {
  planId: string;
  trickId: string;
  since: string;
}): Promise<PlanHubActionResult> {
  if (!planId.startsWith(sharedPlanPrefix) || !trickId.trim() || Number.isNaN(Date.parse(since))) {
    return { status: "error", message: "Der Trick wurde nicht gefunden." };
  }
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase))) return { status: "error", message: "Bitte erneut anmelden." };
  const { error } = await supabase.rpc("training_confirm_from_recap", {
    p_snapshot_share_id: planId.slice(sharedPlanPrefix.length),
    p_trick_id: trickId,
    p_since: since,
  });
  if (error) {
    console.error("Direkte Bestätigung fehlgeschlagen.", { code: error.code, message: error.message });
    return {
      status: "error",
      message: error.code === "42501"
        ? "Nur zugeordnete Trainer dürfen direkt bestätigen."
        : error.message.includes("TRAINING_QUOTE_TOO_LOW")
          ? "Die Landequote liegt unter 80 %."
          : error.message.includes("TRAINING_STATUS")
            ? "Der Trick ist bereits gemeldet oder bestätigt."
            : "Nicht bestätigt. Bitte erneut versuchen.",
    };
  }
  revalidatePath("/trainingsplaene");
  revalidatePath("/", "layout");
  return { status: "success", message: "Bestätigt." };
}

/* ------------------------------------------------------------------ */
/* Archiv & Papierkorb (Migration 20260930100000_plan_archive_trash)     */
/* ------------------------------------------------------------------ */

/** Verweis auf einen verwaltbaren Plan: Plan-ID und Ersteller (Vorstand ≠ Ersteller). */
export interface PlanLifecycleTarget {
  planKey: string;
  ownerId: string;
}

/** Fehlertexte der Lebenszyklus-RPCs (Rechte, Konflikte, gesperrte Pläne). */
function lifecycleError(error: { code?: string; message?: string }, fallback: string): PlanHubActionResult {
  console.error(fallback, { code: error.code, message: error.message });
  const message =
    error.code === "42501"
      ? forbiddenMessage
      : error.code === "40001"
        ? "Der Plan wurde inzwischen geändert. Bitte neu laden."
        : error.code === "55000"
          ? "Der Plan ist archiviert. Reaktiviere ihn zuerst."
          : `${fallback} Bitte erneut versuchen.`;
  return { status: "error", message };
}

async function runLifecycle(
  rpc: "training_plan_archive" | "training_plan_delete" | "training_plan_restore" | "training_plan_reactivate",
  args: Record<string, unknown>,
  fallback: string,
): Promise<{ result: PlanHubActionResult; data?: Record<string, number> }> {
  const supabase = await createClient();
  if (!(await getAuthenticatedUserId(supabase))) return { result: { status: "error", message: "Bitte erneut anmelden." } };
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) return { result: lifecycleError(error, fallback) };
  revalidatePath("/trainingsplaene");
  revalidatePath("/", "layout");
  return { result: { status: "success", message: "Gespeichert." }, data: (data ?? {}) as Record<string, number> };
}

/** „Als erledigt markieren“: Plan und alle aktiven Kopien kommen ins Archiv. */
export async function archiveTrainingPlan({ planKey, ownerId }: PlanLifecycleTarget): Promise<PlanHubActionResult> {
  const { result } = await runLifecycle(
    "training_plan_archive",
    { p_plan: planKey, p_owner: ownerId },
    "Der Plan konnte nicht archiviert werden.",
  );
  return result;
}

/**
 * Reaktivieren mit neuer Auswahl. Gewählte bisherige Athlet*innen behalten
 * ihren Fortschritt, neue erhalten den aktuellen Planstand; ohne Auswahl wird
 * der Plan zum Entwurf.
 */
export async function reactivateTrainingPlan({
  planKey,
  ownerId,
  athleteIds,
  groupIds,
  club,
}: PlanLifecycleTarget & { athleteIds: string[]; groupIds: string[]; club: boolean }): Promise<PlanHubActionResult> {
  const { result, data } = await runLifecycle(
    "training_plan_reactivate",
    {
      p_plan: planKey,
      p_owner: ownerId,
      p_athletes: Array.from(new Set(athleteIds)).slice(0, 200),
      p_groups: Array.from(new Set(groupIds)).slice(0, 50),
      p_club: club,
    },
    "Der Plan konnte nicht reaktiviert werden.",
  );
  if (result.status === "success") result.count = Number(data?.restored ?? 0) + Number(data?.shared ?? 0);
  return result;
}

/** In den Papierkorb (30 Tage wiederherstellbar). */
export async function deleteTrainingPlan({ planKey, ownerId }: PlanLifecycleTarget): Promise<PlanHubActionResult> {
  const { result } = await runLifecycle(
    "training_plan_delete",
    { p_plan: planKey, p_owner: ownerId },
    "Der Plan konnte nicht gelöscht werden.",
  );
  return result;
}

/** Aus dem Papierkorb dorthin zurück, wo der Plan vorher war. */
export async function restoreTrainingPlan({ planKey, ownerId }: PlanLifecycleTarget): Promise<PlanHubActionResult> {
  const { result } = await runLifecycle(
    "training_plan_restore",
    { p_plan: planKey, p_owner: ownerId },
    "Der Plan konnte nicht wiederhergestellt werden.",
  );
  return result;
}
