import type {
  TrainingExerciseDemoVideo,
  TrainingLeaderboardEntry,
  TrainingPlan,
  TrainingVideoEvidence,
  TrickProgressStatus,
} from "@/domain/models";
import { normalizeTrainingPlan } from "@/domain/training-plan-normalization";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

interface TrainingLeaderboardRow {
  user_id: string;
  display_name: string;
  xp_total: number;
}

interface TrickProgressRow {
  snapshot_share_id: string;
  trick_id: string;
  athlete_id: string;
  status: TrickProgressStatus;
}

interface TrainingVideoEvidenceRow {
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

interface TrainingExerciseDemoVideoRow {
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

function isTrainingPlan(value: unknown): value is TrainingPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<TrainingPlan>;
  return (
    typeof plan.id === "string" &&
    typeof plan.title === "string" &&
    Array.isArray(plan.goals) &&
    Array.isArray(plan.tricks)
  );
}

function createInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isMissingProgressSchema(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() || "";
  return (
    error.code === "PGRST202"
    || error.code === "PGRST205"
    || error.code === "42P01"
    || message.includes("schema cache")
    || message.includes("does not exist")
    || message.includes("could not find the function")
  );
}

/**
 * Laedt empfangene und selbst versendete Planfreigaben samt synchronisiertem
 * Trick-Fortschritt. So sehen Athlet und Trainer denselben Status.
 */
export async function getSharedTrainingPlanSnapshots(): Promise<TrainingPlan[]> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return [];

  const { data, error } = await supabase
    .from("training_plan_snapshot_shares")
    .select("id, shared_by, recipient_user_id, plan_snapshot, created_at")
    .or(`recipient_user_id.eq.${currentUserId},shared_by.eq.${currentUserId}`)
    .order("created_at", { ascending: false });

  if (error) {
    if (
      error.code === "PGRST205" ||
      error.code === "42P01" ||
      error.message.toLowerCase().includes("schema cache")
    ) {
      return [];
    }
    throw new Error(`Geteilte Trainingspläne konnten nicht geladen werden: ${error.message}`);
  }

  const shares = data || [];
  const shareIds = shares.map((share) => share.id);
  const progressByShare = new Map<
    string,
    Map<string, Pick<TrickProgressRow, "athlete_id" | "status">>
  >();

  if (shareIds.length > 0) {
    const { data: progressData, error: progressError } = await supabase
      .from("training_trick_progress")
      .select("snapshot_share_id, trick_id, athlete_id, status")
      .in("snapshot_share_id", shareIds);

    if (progressError && !isMissingProgressSchema(progressError)) {
      throw new Error(`Trick-Fortschritt konnte nicht geladen werden: ${progressError.message}`);
    }

    for (const progress of (progressData || []) as TrickProgressRow[]) {
      const shareProgress = progressByShare.get(progress.snapshot_share_id) || new Map();
      shareProgress.set(progress.trick_id, {
        athlete_id: progress.athlete_id,
        status: progress.status,
      });
      progressByShare.set(progress.snapshot_share_id, shareProgress);
    }
  }

  return shares.flatMap((row) => {
    if (!isTrainingPlan(row.plan_snapshot)) return [];
    const normalizedPlan = normalizeTrainingPlan(row.plan_snapshot);
    const progress = progressByShare.get(row.id);
    const direction = row.recipient_user_id === currentUserId
      ? "empfangen"
      : "versendet";
    const progressAthleteIds = Array.from(
      new Set(Array.from(progress?.values() || []).map((entry) => entry.athlete_id)),
    );

    return [{
      ...normalizedPlan,
      id: `shared-${row.id}`,
      sourcePlanId: normalizedPlan.id,
      author: `${normalizedPlan.author} · ${direction}`,
      assignedAthletes: progressAthleteIds.length > 0
        ? progressAthleteIds
        : normalizedPlan.assignedAthletes,
      tricks: normalizedPlan.tricks.map((trick) => ({
        ...trick,
        athleteId: progress?.get(trick.id)?.athlete_id || trick.athleteId,
        status: progress?.get(trick.id)?.status || trick.status,
      })),
    }];
  });
}

/** Laedt private Einreichungen getrennt von den unveraenderlichen Plan-Snapshots. */
export async function getTrainingVideoEvidence(): Promise<TrainingVideoEvidence[]> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return [];

  const { data, error } = await supabase
    .from("training_video_evidence")
    .select(
      "id, snapshot_share_id, trick_id, athlete_id, provider, video_id, athlete_comment, attempt_count, self_rating, submitted_at, review_status, trainer_feedback, reviewed_by, reviewed_at",
    )
    .order("submitted_at", { ascending: false });

  if (error) {
    if (isMissingProgressSchema(error)) return [];
    throw new Error(`Videonachweise konnten nicht geladen werden: ${error.message}`);
  }

  return ((data || []) as TrainingVideoEvidenceRow[]).map((evidence) => ({
    id: evidence.id,
    planId: `shared-${evidence.snapshot_share_id}`,
    trickId: evidence.trick_id,
    athleteId: evidence.athlete_id,
    provider: evidence.provider,
    videoId: evidence.video_id,
    athleteComment: evidence.athlete_comment,
    attemptCount: evidence.attempt_count,
    selfRating: evidence.self_rating,
    submittedAt: evidence.submitted_at,
    reviewStatus: evidence.review_status,
    trainerFeedback: evidence.trainer_feedback,
    reviewedBy: evidence.reviewed_by || undefined,
    reviewedAt: evidence.reviewed_at || undefined,
  }));
}

/** Laedt nur die Trainer-Demos, die RLS fuer das aktuelle Konto freigibt. */
export async function getTrainingExerciseDemoVideos(): Promise<TrainingExerciseDemoVideo[]> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return [];

  const { data, error } = await supabase
    .from("training_exercise_demo_videos")
    .select(
      "id, source_plan_id, trick_id, created_by, provider, video_id, title, trainer_note, visibility, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingProgressSchema(error)) return [];
    throw new Error(`Trainer-Demos konnten nicht geladen werden: ${error.message}`);
  }

  return ((data || []) as TrainingExerciseDemoVideoRow[]).map((demo) => ({
    id: demo.id,
    sourcePlanId: demo.source_plan_id,
    trickId: demo.trick_id,
    createdBy: demo.created_by,
    provider: demo.provider,
    videoId: demo.video_id,
    title: demo.title,
    trainerNote: demo.trainer_note,
    visibility: demo.visibility,
    createdAt: demo.created_at,
  }));
}

/** Laedt die serverseitig berechneten XP fuer gemeinsame Gruppen und Zuordnungen. */
export async function getTrainingXpLeaderboard(): Promise<TrainingLeaderboardEntry[] | null> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return [];

  const { data, error } = await supabase.rpc("get_training_xp_leaderboard");
  if (error) {
    if (isMissingProgressSchema(error)) return null;
    throw new Error(`XP-Rangliste konnte nicht geladen werden: ${error.message}`);
  }

  return ((data || []) as TrainingLeaderboardRow[]).map((entry) => ({
    userId: entry.user_id,
    displayName: entry.display_name,
    initials: createInitials(entry.display_name) || "TH",
    xpTotal: entry.xp_total,
  }));
}
