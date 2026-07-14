import type {
  TrainingLeaderboardEntry,
  TrainingPlan,
  TrickProgressStatus,
} from "@/domain/models";
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
    const progress = progressByShare.get(row.id);
    const direction = row.recipient_user_id === currentUserId
      ? "empfangen"
      : "versendet";
    const progressAthleteIds = Array.from(
      new Set(Array.from(progress?.values() || []).map((entry) => entry.athlete_id)),
    );

    return [{
      ...row.plan_snapshot,
      id: `shared-${row.id}`,
      sourcePlanId: row.plan_snapshot.id,
      author: `${row.plan_snapshot.author} · ${direction}`,
      assignedAthletes: progressAthleteIds.length > 0
        ? progressAthleteIds
        : row.plan_snapshot.assignedAthletes,
      tricks: row.plan_snapshot.tricks.map((trick) => ({
        ...trick,
        athleteId: progress?.get(trick.id)?.athlete_id || trick.athleteId,
        status: progress?.get(trick.id)?.status || trick.status,
      })),
    }];
  });
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
