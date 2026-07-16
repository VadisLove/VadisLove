"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Flag,
  LayoutGrid,
  ListChecks,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type {
  GoalCadence,
  Person,
  TrainingExerciseDemoVideo,
  TrainingLeaderboardEntry,
  TrainingPlan,
  TrainingTargetType,
  TrainingTrick,
  TrainingVideoEvidence,
  TrickProgressStatus,
} from "@/domain/models";
import { useCurrentUser } from "@/components/auth/current-user-context";
import { PageHeader } from "@/components/ui/page-header";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./plans-view.module.css";
import {
  reviewTrainingVideoEvidence,
  shareTrainingPlanSnapshot,
  submitTrainingExerciseDemoVideo,
  submitTrainingVideoEvidence,
  updateSharedTrickProgress,
} from "@/app/trainingsplaene/actions";
import {
  buildYoutubeVideoUrl,
  parseYoutubeVideoUrl,
} from "@/lib/youtube-video";

type PlanFilter = "all" | "active" | "templates" | "public";
type WorkspaceMode = "athletes" | "plans";

const groups = ["U14 München", "U18 Augsburg", "Kader Bayern", "Open Session Nürnberg"];

const cadenceLabels: Record<GoalCadence, string> = {
  daily: "Täglich",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
  yearly: "Jährlich",
};

const statusLabels: Record<TrainingPlan["status"], string> = {
  draft: "Entwurf",
  active: "Aktiv",
  completed: "Abgeschlossen",
  archived: "Archiviert",
};

const trickStatusLabels: Record<TrickProgressStatus, string> = {
  not_started: "Noch nicht begonnen",
  in_progress: "In Arbeit",
  awaiting_confirmation: "Wartet auf Bestätigung",
  confirmed: "Bestätigt",
};

const targetTypeLabels: Record<TrainingTargetType, string> = {
  attempts: "Versuche",
  repetitions: "Wiederholungen",
  duration: "Dauer",
  free: "Freie Vorgabe",
};

const evidenceStatusLabels: Record<TrainingVideoEvidence["reviewStatus"], string> = {
  pending: "Zur Prüfung",
  approved: "Bestätigt",
  changes_requested: "Änderung angefordert",
};

function getPlanProgress(plan: TrainingPlan) {
  const completedGoals = plan.goals.filter((goal) => goal.completed).length;
  const confirmedTricks = plan.tricks.filter((trick) => trick.status === "confirmed").length;
  const total = plan.goals.length + plan.tricks.length;
  return total === 0 ? 0 : Math.round(((completedGoals + confirmedTricks) / total) * 100);
}

function planIncludesAthlete(plan: TrainingPlan, athleteId: string) {
  return plan.assignedAthletes.includes(athleteId)
    || plan.tricks.some((trick) => trick.athleteId === athleteId);
}

/** Berechnet den Fortschritt nur aus den einem Athleten zugewiesenen Uebungen. */
function getAthletePlanProgress(plan: TrainingPlan, athleteId: string) {
  const athleteTricks = plan.tricks.filter((trick) => trick.athleteId === athleteId);
  if (athleteTricks.length === 0) return 0;
  const confirmed = athleteTricks.filter((trick) => trick.status === "confirmed").length;
  return Math.round((confirmed / athleteTricks.length) * 100);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Spielt eine kurze, bewusst zurückhaltende Erfolgsfolge.
 *
 * Die Web-Audio-API wird erst nach der Nutzeraktion erzeugt. Dadurch bleibt
 * die Seite ohne Autoplay-Berechtigung funktionsfähig und Sound abschaltbar.
 */
function playSuccessSound() {
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  [523, 659, 784].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.08, context.currentTime + index * 0.09);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + index * 0.09 + 0.18,
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime + index * 0.09);
    oscillator.stop(context.currentTime + index * 0.09 + 0.2);
  });
}

/**
 * Interaktiver Trainingsplan-Arbeitsbereich des MVP.
 *
 * Geteilte Trick-Fortschritte werden ueber eine authentifizierte Server Action
 * gespeichert. Rein lokale Entwuerfe bleiben im React-Zustand, bis sie geteilt
 * und damit einem konkreten Athleten zugeordnet werden.
 */
export function PlansView({
  initialPlans,
  people,
  initialLeaderboard,
  initialSelectedPlanId,
  initialDialog,
  initialVideoEvidence = [],
  initialDemoVideos = [],
}: {
  initialPlans: TrainingPlan[];
  people: Person[];
  initialLeaderboard: TrainingLeaderboardEntry[] | null;
  initialSelectedPlanId?: string;
  initialDialog?: "share" | null;
  initialVideoEvidence?: TrainingVideoEvidence[];
  initialDemoVideos?: TrainingExerciseDemoVideo[];
}) {
  const { t } = useI18n();
  const currentUser = useCurrentUser();

  /**
   * Das globale Personenverzeichnis enthält aus Datenschutzgründen nicht das
   * eigene Profil. Für XP und eigene Trick-Zuordnungen ergänzen wir es deshalb
   * ausschließlich in dieser Ansicht um den angemeldeten Athleten.
   */
  const athletes = useMemo(() => {
    const directoryAthletes = people.filter((person) => person.role === "Athlet");
    if (!currentUser || currentUser.accountType !== "athlete") {
      return directoryAthletes;
    }

    if (directoryAthletes.some((athlete) => athlete.id === currentUser.id)) {
      return directoryAthletes;
    }

    const currentAthlete: Person = {
      id: currentUser.id,
      name: currentUser.displayName,
      email: "",
      accountType: currentUser.accountType,
      role: "Athlet",
      region: "Eigenes Profil",
      initials: currentUser.initials,
      activeRelationships: [],
    };

    return [currentAthlete, ...directoryAthletes];
  }, [currentUser, people]);
  const trainers = useMemo(() => people.filter((person) => person.role === "Trainer"), [people]);
  const assignedTrainerIds = useMemo(
    () => new Set(
      trainers
        .filter((trainer) => trainer.activeRelationships?.includes("trainer_athlete"))
        .map((trainer) => trainer.id),
    ),
    [trainers],
  );
  const assignedAthleteIds = useMemo(
    () => new Set(
      athletes
        .filter((athlete) => athlete.activeRelationships?.includes("trainer_athlete"))
        .map((athlete) => athlete.id),
    ),
    [athletes],
  );
  const assignableAthletes = useMemo(
    () => athletes.filter(
      (athlete) => athlete.activeRelationships?.includes("trainer_athlete"),
    ),
    [athletes],
  );
  const assignableTrainers = useMemo(
    () => trainers.filter(
      (trainer) => (trainer.activeRelationships?.length || 0) > 0,
    ),
    [trainers],
  );
  const shareableContacts = useMemo(
    () => people.filter((person) => (person.activeRelationships?.length || 0) > 0),
    [people],
  );
  const requestedPlanId = initialSelectedPlanId
    && initialPlans.some((plan) => plan.id === initialSelectedPlanId)
    ? initialSelectedPlanId
    : initialPlans[0]?.id ?? "";
  const requestedPlan = initialPlans.find((plan) => plan.id === requestedPlanId);
  const requestedAthleteId = [
    ...(requestedPlan?.assignedAthletes || []),
    ...(requestedPlan?.tricks.map((trick) => trick.athleteId) || []),
  ].find((athleteId) => assignableAthletes.some((athlete) => athlete.id === athleteId));
  const [plans, setPlans] = useState(initialPlans);
  const [videoEvidence, setVideoEvidence] = useState(initialVideoEvidence);
  const [demoVideos, setDemoVideos] = useState(initialDemoVideos);
  const [persistedLeaderboard, setPersistedLeaderboard] = useState(initialLeaderboard);
  const [selectedPlanId, setSelectedPlanId] = useState(requestedPlanId);
  const [selectedAthleteId, setSelectedAthleteId] = useState(
    requestedAthleteId ?? assignableAthletes[0]?.id ?? "",
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    currentUser?.accountType === "trainer" ? "athletes" : "plans",
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PlanFilter>("all");
  // Ein Dashboard-Teilen-Link darf den vorhandenen, persistenten Dialog direkt öffnen.
  const [dialog, setDialog] = useState<"create" | "share" | null>(() =>
    initialDialog === "share" && requestedPlanId === initialSelectedPlanId
      ? "share"
      : null,
  );
  const [notice, setNotice] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [celebration, setCelebration] = useState("");
  const [sharing, startSharing] = useTransition();
  const [submittingTrickId, setSubmittingTrickId] = useState("");
  const [reviewingEvidenceId, setReviewingEvidenceId] = useState("");
  const [openEvidenceTrickId, setOpenEvidenceTrickId] = useState("");
  const [openDemoTrickId, setOpenDemoTrickId] = useState("");
  const [submittingDemoTrickId, setSubmittingDemoTrickId] = useState("");
  const [expandedTrickIds, setExpandedTrickIds] = useState<Set<string>>(() => new Set());
  const [feedbackByEvidence, setFeedbackByEvidence] = useState<Record<string, string>>({});

  const isTrainerView = currentUser?.accountType === "trainer";
  const isAthleteView = currentUser?.accountType === "athlete";
  const isTrainerAthleteMode = isTrainerView && workspaceMode === "athletes";
  const focusAthleteId = isTrainerAthleteMode
    ? selectedAthleteId
    : isAthleteView
      ? currentUser.id
      : "";
  const focusAthlete = athletes.find((athlete) => athlete.id === focusAthleteId);
  const filteredAthletes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assignableAthletes.filter((athlete) =>
      `${athlete.name} ${athlete.region}`.toLowerCase().includes(normalizedQuery),
    );
  }, [assignableAthletes, query]);
  const plansInScope = useMemo(
    () => focusAthleteId
      ? plans.filter((plan) => planIncludesAthlete(plan, focusAthleteId))
      : plans,
    [focusAthleteId, plans],
  );

  const filteredPlans = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return plansInScope.filter((plan) => {
      const matchesQuery = `${plan.title} ${plan.category} ${plan.author}`
        .toLowerCase()
        .includes(isTrainerAthleteMode ? "" : normalizedQuery);
      const matchesFilter =
        filter === "all"
        || (filter === "active" && plan.status === "active")
        || (filter === "templates" && plan.isTemplate)
        || (filter === "public" && plan.visibility === "public");
      return matchesQuery && matchesFilter;
    });
  }, [filter, isTrainerAthleteMode, plansInScope, query]);

  const selectedPlan = filteredPlans.find((plan) => plan.id === selectedPlanId)
    ?? filteredPlans[0];
  const displayedTricks = selectedPlan
    ? focusAthleteId
      ? selectedPlan.tricks.filter((trick) =>
          trick.athleteId === focusAthleteId
          || (!trick.athleteId && selectedPlan.assignedAthletes.includes(focusAthleteId)),
        )
      : selectedPlan.tricks
    : [];
  const scopedTricks = plansInScope.flatMap((plan) =>
    focusAthleteId
      ? plan.tricks.filter((trick) =>
          trick.athleteId === focusAthleteId
          || (!trick.athleteId && plan.assignedAthletes.includes(focusAthleteId)),
        )
      : plan.tricks,
  );
  const videoEvidenceItems = videoEvidence.filter(
    (evidence) => evidence.provider === "youtube"
      && (!focusAthleteId || evidence.athleteId === focusAthleteId)
      && buildYoutubeVideoUrl(evidence.videoId) !== null,
  );
  const selectedVideoEvidence = videoEvidenceItems.filter(
    (evidence) => evidence.planId === selectedPlan?.id
      && displayedTricks.some((trick) => trick.id === evidence.trickId),
  );
  const selectedSourcePlanId = selectedPlan?.sourcePlanId ?? selectedPlan?.id;
  // Ein bereits verteilter Snapshot dient auch in der Planbibliothek als
  // verifizierbarer Anker fuer Trainer-Demos des logischen Ursprungsplans.
  const demoAnchorPlan = selectedPlan
    ? selectedPlan.id.startsWith("shared-")
      ? selectedPlan
      : plans.find((plan) =>
          plan.id.startsWith("shared-") && plan.sourcePlanId === selectedSourcePlanId,
        )
    : undefined;
  const selectedDemoVideos = demoVideos.filter(
    (demo) => demo.provider === "youtube"
      && demo.sourcePlanId === selectedSourcePlanId
      && displayedTricks.some((trick) => trick.id === demo.trickId)
      && buildYoutubeVideoUrl(demo.videoId) !== null,
  );

  const pendingConfirmations = scopedTricks.filter(
    (trick) => trick.status === "awaiting_confirmation",
  ).length;
  const activeExercises = scopedTricks.filter(
    (trick) => trick.status === "in_progress",
  ).length;
  const confirmedExercises = scopedTricks.filter(
    (trick) => trick.status === "confirmed",
  ).length;
  const focusProgress = scopedTricks.length === 0
    ? 0
    : Math.round((confirmedExercises / scopedTricks.length) * 100);

  const leaderboard = useMemo(() => {
    const entries = persistedLeaderboard === null
      ? athletes.map((athlete) => ({
          athlete: {
            id: athlete.id,
            name: athlete.name,
            initials: athlete.initials,
          },
          points: plans.reduce(
            (sum, plan) => sum + plan.tricks.filter(
              (trick) => trick.athleteId === athlete.id && trick.status === "confirmed",
            ).length * 100,
            0,
          ),
        }))
      : persistedLeaderboard.map((entry) => ({
          athlete: {
            id: entry.userId,
            name: entry.displayName,
            initials: entry.initials,
          },
          points: entry.xpTotal,
        }));

    const rankedAthletes = entries
      .sort((a, b) => b.points - a.points || a.athlete.name.localeCompare(b.athlete.name, "de"))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    const podium = rankedAthletes.slice(0, 3);

    // Der eigene XP-Stand bleibt auch sichtbar, wenn er nicht unter den Top 3 liegt.
    if (currentUser?.accountType === "athlete") {
      const currentEntry = rankedAthletes.find(
        (entry) => entry.athlete.id === currentUser.id,
      );
      if (currentEntry && !podium.some((entry) => entry.athlete.id === currentUser.id)) {
        podium.push(currentEntry);
      }
    }

    return podium;
  }, [athletes, currentUser, persistedLeaderboard, plans]);

  /**
   * Ermittelt die erlaubten Aktionen aus dem eingeloggten Konto und einer
   * beidseitig bestätigten Trainer-Athlet-Beziehung.
   */
  function getTrickPermissions(trick: TrainingTrick) {
    const isOwnTrick = currentUser?.accountType === "athlete"
      && trick.athleteId === currentUser.id;
    const hasAssignedTrainer = assignedTrainerIds.size > 0;
    const isAssignedTrainer = currentUser?.accountType === "trainer"
      && assignedAthleteIds.has(trick.athleteId);

    return {
      canReportProgress: isOwnTrick,
      canConfirm: isAssignedTrainer || (isOwnTrick && !hasAssignedTrainer),
      confirmationHint: isOwnTrick && hasAssignedTrainer
        ? "Wartet auf deinen Trainer"
        : "Nur zugeordnete Trainer",
    };
  }

  function updateSelectedPlan(updater: (plan: TrainingPlan) => TrainingPlan) {
    const targetPlanId = selectedPlan?.id ?? selectedPlanId;
    setPlans((current) =>
      current.map((plan) => (plan.id === targetPlanId ? updater(plan) : plan)),
    );
  }

  /** Oeffnet einen Athleten und springt direkt zu seinem ersten Plan. */
  function selectAthlete(athleteId: string) {
    setSelectedAthleteId(athleteId);
    const firstPlan = plans.find((plan) => planIncludesAthlete(plan, athleteId));
    setSelectedPlanId(firstPlan?.id ?? "");
  }

  function switchWorkspaceMode(mode: WorkspaceMode) {
    setWorkspaceMode(mode);
    setQuery("");
    setFilter("all");

    if (mode === "plans") {
      setSelectedPlanId(plans[0]?.id ?? "");
    } else if (selectedAthleteId) {
      const firstPlan = plans.find((plan) => planIncludesAthlete(plan, selectedAthleteId));
      setSelectedPlanId(firstPlan?.id ?? "");
    }
  }

  function handleCreatePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title")).trim();
    const athleteIds = assignableAthletes
      .filter((athlete) => data.get(`athlete-${athlete.id}`))
      .map((athlete) => athlete.id);
    const trainerIds = assignableTrainers
      .filter((trainer) => data.get(`trainer-${trainer.id}`))
      .map((trainer) => trainer.id);
    const selectedGroups = groups.filter((group) => data.get(`group-${group}`));
    // Gleichnamige Formularfelder erlauben eine beliebig lange Uebungsliste.
    // Im bestehenden Datenmodell bleiben sie als "tricks" gespeichert, damit
    // bereits geteilte Plaene und Fortschrittsdaten kompatibel bleiben.
    const exerciseNames = data.getAll("exerciseName");
    const exerciseGroups = data.getAll("exerciseGroup");
    const exerciseLevels = data.getAll("exerciseLevel");
    const exerciseTargetTypes = data.getAll("exerciseTargetType");
    const exerciseTargetValues = data.getAll("exerciseTargetValue");
    const exerciseTrainerNotes = data.getAll("exerciseTrainerNote");
    const exerciseEquipment = data.getAll("exerciseEquipment");
    const exercises = exerciseNames.flatMap((rawName, index) => {
      const name = String(rawName).trim();
      if (!name) return [];
      const targetType = String(exerciseTargetTypes[index]) as TrainingTargetType;

      return [{
        id: crypto.randomUUID(),
        name,
        group: String(exerciseGroups[index]).trim() || "Allgemein",
        level: Math.min(5, Math.max(1, Number(exerciseLevels[index]) || 1)),
        targetType: targetTypeLabels[targetType] ? targetType : "free" as const,
        targetValue: String(exerciseTargetValues[index]).trim() || "Nach Trainerabsprache",
        trainerNote: String(exerciseTrainerNotes[index]).trim()
          || "Auf eine sichere und kontrollierte Ausführung achten.",
        sortOrder: index,
        equipment: String(exerciseEquipment[index]).trim() || undefined,
        // Leere Zuordnung bedeutet: Jede persoenliche Freigabe erhaelt alle Uebungen.
        athleteId: "",
        status: "not_started" as const,
      }];
    });

    const createdPlan: TrainingPlan = {
      id: crypto.randomUUID(),
      title,
      category: String(data.get("category")),
      version: "1.0",
      author: "Eigener Plan",
      ownerLevel: "state",
      sharedWith: trainerIds.length > 0 ? ["club"] : [],
      updatedAt: new Intl.DateTimeFormat("de-DE").format(new Date()),
      description: String(data.get("description")),
      status: "active",
      visibility: data.get("visibility") === "public" ? "public" : "private",
      isTemplate: data.get("isTemplate") === "on",
      deadline: String(data.get("deadline")) || undefined,
      assignedGroups: selectedGroups,
      assignedAthletes: athleteIds,
      sharedTrainers: trainerIds,
      goals: (["daily", "weekly", "monthly", "yearly"] as GoalCadence[])
        .map((cadence) => ({
          id: crypto.randomUUID(),
          title: String(data.get(`goal-${cadence}`)).trim(),
          cadence,
          completed: false,
        }))
        .filter((goal) => goal.title),
      tricks: exercises,
    };

    setDialog(null);

    const recipientUserIds = Array.from(new Set([...athleteIds, ...trainerIds]));
    if (recipientUserIds.length === 0) {
      setPlans((current) => [createdPlan, ...current]);
      setSelectedPlanId(createdPlan.id);
      setNotice(`„${createdPlan.title}“ wurde als eigener Plan erstellt.`);
      return;
    }

    // Die Auswahl beim Erstellen ist eine echte Freigabe und nicht nur Metadaten.
    startSharing(async () => {
      const result = await shareTrainingPlanSnapshot({
        plan: createdPlan,
        recipientUserIds,
      });

      setPlans((current) => [createdPlan, ...current]);
      setSelectedPlanId(createdPlan.id);
      setNotice(
        result.status === "success"
          ? `„${createdPlan.title}“ wurde erstellt und ${recipientUserIds.length} Kontakt${recipientUserIds.length === 1 ? "" : "en"} zugestellt.`
          : `„${createdPlan.title}“ wurde erstellt. ${result.message}`,
      );
    });
  }

  function duplicateSelectedPlan() {
    if (!selectedPlan) return;
    const copy: TrainingPlan = {
      ...selectedPlan,
      id: crypto.randomUUID(),
      title: `${selectedPlan.title} – eigene Version`,
      version: "1.0",
      author: "Eigene Vorlage",
      sourcePlanId: selectedPlan.id,
      status: "draft",
      visibility: "private",
      assignedGroups: [],
      assignedAthletes: [],
      sharedTrainers: [],
      goals: selectedPlan.goals.map((goal) => ({
        ...goal,
        id: crypto.randomUUID(),
        completed: false,
      })),
      tricks: selectedPlan.tricks.map((trick) => ({
        ...trick,
        id: crypto.randomUUID(),
        athleteId: "",
        status: "not_started",
      })),
    };
    setPlans((current) => [copy, ...current]);
    setSelectedPlanId(copy.id);
    setNotice("Eine unabhängige Kopie wurde als Entwurf angelegt.");
  }

  function handleSharePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectedContactIds = shareableContacts
      .filter((person) => data.get(`share-${person.id}`))
      .map((person) => person.id);

    if (!selectedPlan || selectedContactIds.length === 0) {
      setNotice("Bitte mindestens einen bestätigten Kontakt auswählen.");
      return;
    }

    startSharing(async () => {
      const result = await shareTrainingPlanSnapshot({
        plan: selectedPlan,
        recipientUserIds: selectedContactIds,
      });
      setNotice(result.message);

      if (result.status === "success") {
        updateSelectedPlan((plan) => ({
          ...plan,
          sharedTrainers: Array.from(new Set([...plan.sharedTrainers, ...selectedContactIds])),
        }));
        setDialog(null);
      }
    });
  }

  function applyTrickUpdate(
    trick: TrainingTrick,
    status: TrickProgressStatus,
  ) {
    updateSelectedPlan((plan) => ({
      ...plan,
      tricks: plan.tricks.map((entry) =>
        entry.id === trick.id ? { ...entry, status } : entry,
      ),
    }));

    if (status === "confirmed") {
      setCelebration(trick.name);
      if (soundEnabled) playSuccessSound();
      window.setTimeout(() => setCelebration(""), 2400);
    }
  }

  async function updateTrick(trickId: string, status: TrickProgressStatus) {
    const trick = selectedPlan?.tricks.find((entry) => entry.id === trickId);
    if (!trick) return;

    const permissions = getTrickPermissions(trick);
    const actionAllowed = status === "confirmed"
      ? permissions.canConfirm
      : permissions.canReportProgress;

    // Auch der Handler prüft die Berechtigung, damit nicht nur der Button schützt.
    if (!actionAllowed) {
      setNotice("Diese Trick-Aktion ist nur für den zugeordneten Athleten oder Trainer möglich.");
      return;
    }

    if (selectedPlan.id.startsWith("shared-")) {
      const result = await updateSharedTrickProgress({
        planId: selectedPlan.id,
        trickId,
        status,
      });
      setNotice(result.message);

      if (result.status === "error") return;

      if (result.athleteUserId && typeof result.xpTotal === "number") {
        setPersistedLeaderboard((current) => {
          if (current === null) return current;
          const knownEntry = current.find(
            (entry) => entry.userId === result.athleteUserId,
          );
          if (knownEntry) {
            return current.map((entry) => entry.userId === result.athleteUserId
              ? { ...entry, xpTotal: result.xpTotal as number }
              : entry);
          }

          const athlete = athletes.find(
            (entry) => entry.id === result.athleteUserId,
          );
          if (!athlete) return current;
          return [...current, {
            userId: athlete.id,
            displayName: athlete.name,
            initials: athlete.initials,
            xpTotal: result.xpTotal as number,
          }];
        });
      }
    }

    applyTrickUpdate(trick, status);
  }

  /**
   * Liefert sofortige Client-Rueckmeldung und laesst dieselbe URL danach
   * nochmals innerhalb der Server Action pruefen.
   */
  async function submitEvidence(
    trick: TrainingTrick,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedPlan?.id.startsWith("shared-")) {
      setNotice("Nachweise können nur für persönlich zugewiesene Pläne eingereicht werden.");
      return;
    }

    const data = new FormData(event.currentTarget);
    const youtubeUrl = String(data.get("youtubeUrl"));
    const parsedUrl = parseYoutubeVideoUrl(youtubeUrl);
    if (!parsedUrl.ok) {
      setNotice(parsedUrl.error);
      return;
    }
    if (videoEvidence.some((evidence) =>
      evidence.planId === selectedPlan.id
      && evidence.trickId === trick.id
      && evidence.reviewStatus === "pending"
    )) {
      setNotice("Für diese Übung wartet bereits ein Nachweis auf Prüfung.");
      return;
    }

    setSubmittingTrickId(trick.id);
    const result = await submitTrainingVideoEvidence({
      planId: selectedPlan.id,
      trickId: trick.id,
      youtubeUrl,
      athleteComment: String(data.get("athleteComment")),
      attemptCount: Number(data.get("attemptCount")),
      selfRating: Number(data.get("selfRating")),
    });
    setSubmittingTrickId("");
    setNotice(result.message);

    if (result.status === "success" && result.evidence) {
      setVideoEvidence((current) => [result.evidence as TrainingVideoEvidence, ...current]);
      applyTrickUpdate(trick, "awaiting_confirmation");
      setOpenEvidenceTrickId("");
    }
  }

  /**
   * Prueft die Trainer-URL sofort im Formular und ueberlaesst die verbindliche
   * Rollen- und Planpruefung anschliessend der Server Action und RLS.
   */
  async function submitDemo(
    trick: TrainingTrick,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedPlan || !selectedSourcePlanId || !demoAnchorPlan) {
      setNotice("Trainer-Demos können erst in einem persönlich verteilten Plan hinterlegt werden.");
      return;
    }

    const data = new FormData(event.currentTarget);
    const youtubeUrl = String(data.get("demoYoutubeUrl"));
    const parsedUrl = parseYoutubeVideoUrl(youtubeUrl);
    if (!parsedUrl.ok) {
      setNotice(parsedUrl.error);
      return;
    }

    setSubmittingDemoTrickId(trick.id);
    const result = await submitTrainingExerciseDemoVideo({
      planId: demoAnchorPlan.id,
      sourcePlanId: selectedSourcePlanId,
      trickId: trick.id,
      youtubeUrl,
      title: String(data.get("demoTitle")),
      trainerNote: String(data.get("demoTrainerNote")),
      visibility: String(data.get("demoVisibility")) as "assigned" | "public",
    });
    setSubmittingDemoTrickId("");
    setNotice(result.message);

    if (result.status === "success" && result.demo) {
      setDemoVideos((current) => [result.demo as TrainingExerciseDemoVideo, ...current]);
      setOpenDemoTrickId("");
      form.reset();
    }
  }

  function toggleTrickDetails(trickId: string) {
    setExpandedTrickIds((current) => {
      const next = new Set(current);
      if (next.has(trickId)) next.delete(trickId);
      else next.add(trickId);
      return next;
    });
  }

  function setAllTricksExpanded(expanded: boolean) {
    setExpandedTrickIds(
      expanded ? new Set(displayedTricks.map((trick) => trick.id)) : new Set(),
    );
    if (!expanded) {
      setOpenEvidenceTrickId("");
      setOpenDemoTrickId("");
    }
  }

  async function reviewEvidence(
    evidence: TrainingVideoEvidence,
    decision: "approved" | "changes_requested",
  ) {
    const trainerFeedback = feedbackByEvidence[evidence.id] ?? evidence.trainerFeedback;
    setReviewingEvidenceId(evidence.id);
    const result = await reviewTrainingVideoEvidence({
      evidenceId: evidence.id,
      decision,
      trainerFeedback,
    });
    setReviewingEvidenceId("");
    setNotice(result.message);

    if (result.status !== "success" || !result.evidence) return;
    setVideoEvidence((current) => current.map((entry) =>
      entry.id === evidence.id ? result.evidence as TrainingVideoEvidence : entry,
    ));

    const trick = selectedPlan?.tricks.find((entry) => entry.id === evidence.trickId);
    if (trick) {
      applyTrickUpdate(
        trick,
        decision === "approved" ? "confirmed" : "in_progress",
      );
    }

    if (result.athleteUserId && typeof result.xpTotal === "number") {
      setPersistedLeaderboard((current) => current?.map((entry) =>
        entry.userId === result.athleteUserId
          ? { ...entry, xpTotal: result.xpTotal as number }
          : entry,
      ) ?? current);
    }
  }

  function toggleGoal(goalId: string) {
    updateSelectedPlan((plan) => ({
      ...plan,
      goals: plan.goals.map((goal) =>
        goal.id === goalId ? { ...goal, completed: !goal.completed } : goal,
      ),
    }));
  }

  function personName(id: string) {
    if (!id && focusAthlete) return focusAthlete.name;
    if (currentUser?.id === id) {
      return `${currentUser.displayName} (Du)`;
    }

    return people.find((person) => person.id === id)?.name ?? "Noch nicht zugewiesen";
  }

  return (
    <>
      <PageHeader
        title={t("plans.title")}
        description={isTrainerView
          ? "Athleten einzeln begleiten, Fortschritt prüfen und Trainingspläne verwalten."
          : "Deine aktuellen Übungen, Ziele und Rückmeldungen auf einen Blick."}
        showContext
      />

      {isTrainerView ? (
        <nav className={styles.roleTabs} aria-label="Trainingsplan-Ansicht wechseln">
          <button
            type="button"
            className={workspaceMode === "athletes" ? styles.activeRoleTab : ""}
            onClick={() => switchWorkspaceMode("athletes")}
          >
            <Users size={18} /> Athleten betreuen
          </button>
          <button
            type="button"
            className={workspaceMode === "plans" ? styles.activeRoleTab : ""}
            onClick={() => switchWorkspaceMode("plans")}
          >
            <LayoutGrid size={18} /> Planbibliothek
          </button>
        </nav>
      ) : null}

      <section className={styles.overview}>
        <article>
          <span><FileText size={20} /></span>
          <div>
            <strong>{plansInScope.length}</strong>
            <small>{focusAthleteId ? "zugewiesene Pläne" : "Trainingspläne"}</small>
          </div>
        </article>
        <article>
          <span><ListChecks size={20} /></span>
          <div><strong>{activeExercises}</strong><small>aktuell in Arbeit</small></div>
        </article>
        <article>
          <span><BellRing size={20} /></span>
          <div><strong>{pendingConfirmations}</strong><small>offene Bestätigungen</small></div>
        </article>
        {focusAthleteId ? (
          <article>
            <span><Video size={20} /></span>
            <div><strong>{videoEvidenceItems.length}</strong><small>Videonachweise</small></div>
          </article>
        ) : (
          <article className={styles.soundCard}>
            <span><Sparkles size={20} /></span>
            <div><strong>{athletes.length}</strong><small>aktive Athleten</small></div>
            <button
              type="button"
              aria-label={soundEnabled ? "Belohnungssound ausschalten" : "Belohnungssound einschalten"}
              onClick={() => setSoundEnabled((enabled) => !enabled)}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </article>
        )}
      </section>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isTrainerAthleteMode ? "Athleten suchen ..." : t("plans.searchPlaceholder")}
          />
        </label>
        {!isTrainerAthleteMode ? <div className={styles.filters} aria-label="Trainingspläne filtern">
          {([
            ["all", "Alle"],
            ["active", "Aktiv"],
            ["templates", "Vorlagen"],
            ["public", "Öffentlich"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? styles.activeFilter : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div> : null}
        {!isAthleteView ? (
          <button type="button" className={styles.createButton} onClick={() => setDialog("create")}>
            <Plus size={18} /> {t("plans.create")}
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className={styles.notice}>
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button type="button" aria-label="Meldung schließen" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      ) : null}

      <div className={isTrainerAthleteMode ? styles.trainerWorkspace : undefined}>
        {isTrainerAthleteMode ? (
          <aside className={styles.athleteDirectory} aria-label="Zugeordnete Athleten">
            <header>
              <div>
                <span>Athleten</span>
                <strong>{assignableAthletes.length} zugeordnet</strong>
              </div>
            </header>
            <div className={styles.athleteList}>
              {filteredAthletes.map((athlete) => {
                const athletePlans = plans.filter((plan) => planIncludesAthlete(plan, athlete.id));
                const athleteTricks = athletePlans.flatMap((plan) =>
                  plan.tricks.filter((trick) => trick.athleteId === athlete.id),
                );
                const waiting = athleteTricks.filter(
                  (trick) => trick.status === "awaiting_confirmation",
                ).length;

                return (
                  <button
                    key={athlete.id}
                    type="button"
                    className={athlete.id === selectedAthleteId ? styles.selectedAthlete : ""}
                    onClick={() => selectAthlete(athlete.id)}
                  >
                    <span className={styles.athleteAvatar}>{athlete.initials}</span>
                    <span className={styles.athleteIdentity}>
                      <strong>{athlete.name}</strong>
                      <small>{athlete.region}</small>
                    </span>
                    {waiting > 0 ? <span className={styles.waitingBadge}>{waiting}</span> : null}
                    <span className={styles.athleteSummary}>
                      {athletePlans.length} Pläne · {athleteTricks.length} Übungen
                    </span>
                  </button>
                );
              })}
              {filteredAthletes.length === 0 ? (
                <div className={styles.directoryEmpty}>Keine zugeordneten Athleten gefunden.</div>
              ) : null}
            </div>
          </aside>
        ) : null}

        <div className={styles.focusArea}>
          {focusAthlete ? (
            <section className={styles.athleteFocus} aria-label={`Trainingsübersicht für ${focusAthlete.name}`}>
              <div className={styles.focusIdentity}>
                <span className={styles.focusAvatar}>{focusAthlete.initials}</span>
                <div>
                  <small>{isTrainerView ? "Athletenansicht" : "Mein Training"}</small>
                  <h2>{focusAthlete.name}</h2>
                  <p>{focusAthlete.region}</p>
                </div>
              </div>
              <div className={styles.focusMetrics}>
                <span><strong>{focusProgress}%</strong><small>Fortschritt</small></span>
                <span><strong>{activeExercises}</strong><small>in Arbeit</small></span>
                <span><strong>{pendingConfirmations}</strong><small>zur Prüfung</small></span>
                <span><strong>{confirmedExercises}</strong><small>bestätigt</small></span>
              </div>
            </section>
          ) : isTrainerAthleteMode ? (
            <div className={styles.emptyFocus}>
              Wähle links einen bestätigten Athleten aus, um sein Training zu öffnen.
            </div>
          ) : null}

          <div className={styles.workspace}>
        <section className={styles.planList} aria-label="Trainingspläne">
          {filteredPlans.map((plan) => {
            const progress = focusAthleteId
              ? getAthletePlanProgress(plan, focusAthleteId)
              : getPlanProgress(plan);
            return (
              <button
                key={plan.id}
                type="button"
                className={plan.id === selectedPlan?.id ? styles.selectedPlan : styles.planCard}
                onClick={() => setSelectedPlanId(plan.id)}
              >
                <span className={styles.planIcon}><FileText size={20} /></span>
                <span className={styles.planContent}>
                  <span className={styles.planMeta}>
                    <span className={`${styles.status} ${styles[plan.status]}`}>
                      {statusLabels[plan.status]}
                    </span>
                    {plan.isTemplate ? <span className={styles.template}>Vorlage</span> : null}
                    {plan.visibility === "public" ? <Eye size={14} /> : <EyeOff size={14} />}
                  </span>
                  <strong>{plan.title}</strong>
                  <small>{plan.category} · v{plan.version} · {plan.author}</small>
                  <span className={styles.progressTrack}>
                    <span style={{ width: `${progress}%` }} />
                  </span>
                  <span className={styles.progressLabel}>{progress}% Fortschritt</span>
                </span>
                <ChevronRight size={18} />
              </button>
            );
          })}
          {filteredPlans.length === 0 ? (
            <div className={styles.emptyState}>Keine passenden Trainingspläne gefunden.</div>
          ) : null}

          {!focusAthleteId ? <section className={styles.leaderboard}>
            <div className={styles.sectionHeading}>
              <h2><Trophy size={18} /> Gruppen-Rangliste</h2>
              <small>nur bestätigte Tricks</small>
            </div>
            {leaderboard.map(({ athlete, points, rank }) => (
              <div key={athlete.id}>
                <strong>{rank}</strong>
                <span className={styles.avatar}>{athlete.initials}</span>
                <span>{athlete.name}</span>
                <b>{points} XP</b>
              </div>
            ))}
          </section> : null}
        </section>

        {selectedPlan ? (
          <section className={styles.planDetail}>
            <header className={styles.detailHeader}>
              <div>
                <div className={styles.detailBadges}>
                  <span className={`${styles.status} ${styles[selectedPlan.status]}`}>
                    {statusLabels[selectedPlan.status]}
                  </span>
                  <span>{selectedPlan.visibility === "public" ? "Öffentlich" : "Privat"}</span>
                  {selectedPlan.isTemplate ? <span>Vorlage</span> : null}
                </div>
                <h2>{selectedPlan.title}</h2>
                <p>{selectedPlan.description}</p>
              </div>
              {!isAthleteView ? <div className={styles.detailActions}>
                <button type="button" onClick={duplicateSelectedPlan}>
                  <Copy size={17} /> Als Vorlage nutzen
                </button>
                <button type="button" onClick={() => setDialog("share")}>
                  <Share2 size={17} /> Teilen
                </button>
              </div> : null}
            </header>

            <div className={styles.assignmentGrid}>
              <article>
                <Users size={19} />
                <div>
                  <small>Gruppen</small>
                  <strong>{selectedPlan.assignedGroups.join(", ") || "Noch keine Gruppe"}</strong>
                </div>
              </article>
              <article>
                <UserRound size={19} />
                <div>
                  <small>Individuell zugewiesen</small>
                  <strong>
                    {focusAthlete
                      ? focusAthlete.name
                      : selectedPlan.assignedAthletes.length
                        ? selectedPlan.assignedAthletes.map(personName).join(", ")
                      : "Noch keine Athleten"}
                  </strong>
                </div>
              </article>
              <article>
                <Clock3 size={19} />
                <div>
                  <small>Abgabe</small>
                  <strong>{selectedPlan.deadline || "Keine feste Frist"}</strong>
                </div>
              </article>
            </div>

            <section className={styles.goalSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <h2><Flag size={18} /> Zielpfad</h2>
                  <p>Tägliche Schritte zahlen auf die langfristigen Ziele ein.</p>
                </div>
              </div>
              <div className={styles.goalGrid}>
                {(["daily", "weekly", "monthly", "yearly"] as GoalCadence[]).map((cadence) => {
                  const cadenceGoals = selectedPlan.goals.filter((goal) => goal.cadence === cadence);
                  return (
                    <article key={cadence}>
                      <span>{cadenceLabels[cadence]}</span>
                      {cadenceGoals.length ? cadenceGoals.map((goal) => (
                        <button
                          key={goal.id}
                          type="button"
                          className={goal.completed ? styles.completedGoal : ""}
                          onClick={() => toggleGoal(goal.id)}
                        >
                          <span>{goal.completed ? <Check size={15} /> : null}</span>
                          {goal.title}
                        </button>
                      )) : <small>Noch kein Ziel</small>}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={styles.trickSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <h2><Sparkles size={18} /> Übungen & Tricks</h2>
                  <p>Details und Aktionen lassen sich je Übung platzsparend öffnen.</p>
                </div>
                <div className={styles.trickSectionControls}>
                  <span>{displayedTricks.filter((trick) => trick.status === "confirmed").length} / {displayedTricks.length} bestätigt</span>
                  {displayedTricks.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAllTricksExpanded(
                        !displayedTricks.every((trick) => expandedTrickIds.has(trick.id)),
                      )}
                    >
                      {displayedTricks.every((trick) => expandedTrickIds.has(trick.id))
                        ? "Alle schließen"
                        : "Alle öffnen"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className={styles.exerciseCardList}>
                {displayedTricks.map((trick) => (
                  <TrickRow
                    key={trick.id}
                    trick={trick}
                    athleteName={personName(trick.athleteId)}
                    permissions={getTrickPermissions(trick)}
                    onUpdate={updateTrick}
                    expanded={expandedTrickIds.has(trick.id)}
                    onToggleExpanded={() => toggleTrickDetails(trick.id)}
                    evidenceHistory={selectedVideoEvidence.filter(
                      (evidence) => evidence.trickId === trick.id,
                    )}
                    demoVideos={selectedDemoVideos.filter(
                      (demo) => demo.trickId === trick.id,
                    )}
                    evidenceFormOpen={openEvidenceTrickId === trick.id}
                    demoFormOpen={openDemoTrickId === trick.id}
                    isSubmitting={submittingTrickId === trick.id}
                    isSubmittingDemo={submittingDemoTrickId === trick.id}
                    canAddDemo={isTrainerView && Boolean(demoAnchorPlan)}
                    onToggleEvidenceForm={() => {
                      setExpandedTrickIds((current) => new Set(current).add(trick.id));
                      setOpenEvidenceTrickId((current) => current === trick.id ? "" : trick.id);
                    }}
                    onToggleDemoForm={() => {
                      setExpandedTrickIds((current) => new Set(current).add(trick.id));
                      setOpenDemoTrickId((current) => current === trick.id ? "" : trick.id);
                    }}
                    onSubmitEvidence={(event) => submitEvidence(trick, event)}
                    onSubmitDemo={(event) => submitDemo(trick, event)}
                  />
                ))}
                {displayedTricks.length === 0 ? (
                  <div className={styles.emptyTricks}>Für diesen Athleten sind in diesem Plan noch keine Übungen eingetragen.</div>
                ) : null}
              </div>
            </section>

            {focusAthleteId ? (
              <section className={styles.evidenceSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h2><Video size={18} /> Eingereichte Videonachweise</h2>
                    <p>Externe Videos werden erst nach einem bewussten Klick geöffnet.</p>
                  </div>
                </div>
                <div className={styles.evidenceList}>
                  {selectedVideoEvidence.map((evidence) => {
                    const trick = displayedTricks.find(
                      (entry) => entry.id === evidence.trickId,
                    );
                    const youtubeUrl = buildYoutubeVideoUrl(evidence.videoId);
                    return (
                      <article className={styles.evidenceCard} key={evidence.id}>
                        <header>
                          <span><Video size={18} /></span>
                          <div>
                            <strong>{trick?.name || "Videonachweis"}</strong>
                            <small>
                              Eingereicht am {new Intl.DateTimeFormat("de-DE", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(evidence.submittedAt))}
                            </small>
                          </div>
                          <span className={`${styles.evidenceStatus} ${styles[evidence.reviewStatus]}`}>
                            {evidenceStatusLabels[evidence.reviewStatus]}
                          </span>
                        </header>
                        <div className={styles.evidenceMeta}>
                          <span><strong>{evidence.attemptCount}</strong> Versuche</span>
                          <span><strong>{evidence.selfRating}/5</strong> Selbsteinschätzung</span>
                        </div>
                        {evidence.athleteComment ? (
                          <blockquote>„{evidence.athleteComment}“</blockquote>
                        ) : null}
                        <div className={styles.evidenceActions}>
                          {youtubeUrl ? (
                            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink size={15} /> Bei YouTube öffnen
                            </a>
                          ) : null}
                        </div>
                        {isTrainerView && evidence.reviewStatus === "pending" ? (
                          <div className={styles.reviewPanel}>
                            <label htmlFor={`feedback-${evidence.id}`}>Trainerfeedback</label>
                            <textarea
                              id={`feedback-${evidence.id}`}
                              rows={3}
                              maxLength={2000}
                              value={feedbackByEvidence[evidence.id] ?? ""}
                              onChange={(event) => setFeedbackByEvidence((current) => ({
                                ...current,
                                [evidence.id]: event.target.value,
                              }))}
                              placeholder="Konkrete Rückmeldung für den Athleten"
                            />
                            <div>
                              <button
                                type="button"
                                className={styles.requestChangesButton}
                                disabled={reviewingEvidenceId === evidence.id}
                                onClick={() => reviewEvidence(evidence, "changes_requested")}
                              >
                                Änderung anfordern
                              </button>
                              <button
                                type="button"
                                className={styles.approveEvidenceButton}
                                disabled={reviewingEvidenceId === evidence.id}
                                onClick={() => reviewEvidence(evidence, "approved")}
                              >
                                <Check size={15} /> Bestätigen
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {evidence.trainerFeedback ? (
                          <div className={styles.trainerFeedback}>
                            <strong>Trainerfeedback</strong>
                            <p>{evidence.trainerFeedback}</p>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                  {selectedVideoEvidence.length === 0 ? (
                    <div className={styles.emptyEvidence}>
                      <Video size={22} />
                      <div>
                        <strong>Noch keine Videolinks eingereicht</strong>
                        <small>Sichere YouTube-Nachweise und Trainerfeedback erscheinen hier.</small>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
          </div>
        </div>
      </div>

      {dialog === "create" ? (
        <PlanDialog title="Neuen Trainingsplan erstellen" onClose={() => setDialog(null)}>
          <form className={styles.planForm} onSubmit={handleCreatePlan}>
            <div className={styles.formGrid}>
              <label className={styles.fullWidth}>Name des Plans<input name="title" required placeholder="z. B. Street Level 1" /></label>
              <label>Kategorie<select name="category"><option>Street</option><option>Transition</option><option>Contest</option><option>Athletik</option><option>Reha</option></select></label>
              <label>Abgabefrist<input name="deadline" type="date" /></label>
              <label className={styles.fullWidth}>Beschreibung<textarea name="description" rows={3} required placeholder="Was soll mit diesem Plan erreicht werden?" /></label>
              <label>Sichtbarkeit<select name="visibility"><option value="private">Privat</option><option value="public">Öffentlich</option></select></label>
              <label className={styles.checkboxLabel}><input name="isTemplate" type="checkbox" /> Zusätzlich als Vorlage speichern</label>
            </div>

            <fieldset>
              <legend>Zielpfad</legend>
              <div className={styles.formGrid}>
                {(["daily", "weekly", "monthly", "yearly"] as GoalCadence[]).map((cadence) => (
                  <label key={cadence}>{cadenceLabels[cadence]}<input name={`goal-${cadence}`} placeholder={`${cadenceLabels[cadence]}es Ziel`} /></label>
                ))}
              </div>
            </fieldset>

            <ExerciseFields />

            <SelectionFieldset legend="Gruppen auswählen" items={groups} namePrefix="group" />
            <SelectionFieldset
              legend="Individuelle Athleten"
              items={assignableAthletes.map((athlete) => athlete.name)}
              itemIds={assignableAthletes.map((athlete) => athlete.id)}
              namePrefix="athlete"
            />
            <SelectionFieldset
              legend="Mit Trainern teilen"
              items={assignableTrainers.map((trainer) => trainer.name)}
              itemIds={assignableTrainers.map((trainer) => trainer.id)}
              namePrefix="trainer"
            />

            <div className={styles.dialogFooter}>
              <button type="button" onClick={() => setDialog(null)}>Abbrechen</button>
              <button type="submit" disabled={sharing}>
                {sharing ? "Wird erstellt ..." : "Plan erstellen"}
              </button>
            </div>
          </form>
        </PlanDialog>
      ) : null}

      {dialog === "share" && selectedPlan ? (
        <PlanDialog title={`„${selectedPlan.title}“ teilen`} onClose={() => setDialog(null)}>
          <form className={styles.shareForm} onSubmit={handleSharePlan}>
            <p>
              Bestätigte Kontakte erhalten eine dauerhafte Kopie in ihrer Planbibliothek
              und eine Benachrichtigung an der Glocke.
            </p>
            <SelectionFieldset
              legend="Bestätigte Kontakte auswählen"
              items={shareableContacts.map((person) => person.name)}
              itemIds={shareableContacts.map((person) => person.id)}
              namePrefix="share"
              selectedIds={selectedPlan.sharedTrainers}
            />
            <div className={styles.dialogFooter}>
              <button type="button" onClick={() => setDialog(null)}>Abbrechen</button>
              <button type="submit" disabled={sharing || shareableContacts.length === 0}>
                {sharing ? "Wird geteilt ..." : "Plan senden"}
              </button>
            </div>
          </form>
        </PlanDialog>
      ) : null}

      {celebration ? (
        <div className={styles.celebration} role="status" aria-live="polite">
          <div className={styles.burst}>
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
          <span><Trophy size={42} /></span>
          <strong>{celebration} bestätigt!</strong>
          <small>Starker Fortschritt. Der Trick-Pass wurde aktualisiert.</small>
        </div>
      ) : null}
    </>
  );
}

/**
 * Dynamische Uebungsliste fuer den Plan-Editor.
 *
 * Die Zeilen leben bewusst in einer eigenen Komponente: Beim Schliessen des
 * Dialogs wird ihr Zustand automatisch verworfen und ein neuer Plan beginnt
 * wieder mit genau einem leeren Feld.
 */
function ExerciseFields() {
  const [rowIds, setRowIds] = useState(() => [crypto.randomUUID()]);

  function addRow() {
    setRowIds((current) => [...current, crypto.randomUUID()]);
  }

  function removeRow(rowId: string) {
    setRowIds((current) => current.filter((id) => id !== rowId));
  }

  function moveRow(index: number, direction: -1 | 1) {
    setRowIds((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const sorted = [...current];
      [sorted[index], sorted[targetIndex]] = [sorted[targetIndex], sorted[index]];
      return sorted;
    });
  }

  return (
    <fieldset>
      <legend>Übungen & Tricks</legend>
      <p className={styles.fieldHint}>
        Jede Karte hat ein eigenes Ziel, Level und Trainerbriefing. Die Reihenfolge gilt auch im geteilten Plan.
      </p>
      <div className={styles.exerciseList}>
        {rowIds.map((rowId, index) => (
          <article className={styles.exerciseEditorCard} key={rowId}>
            <header className={styles.exerciseEditorHeader}>
              <strong>Übung {index + 1}</strong>
              <div>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveRow(index, -1)}
                  aria-label={`Übung ${index + 1} nach oben verschieben`}
                ><ArrowUp size={15} /></button>
                <button
                  type="button"
                  disabled={index === rowIds.length - 1}
                  onClick={() => moveRow(index, 1)}
                  aria-label={`Übung ${index + 1} nach unten verschieben`}
                ><ArrowDown size={15} /></button>
                {rowIds.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(rowId)}
                    aria-label={`Übung ${index + 1} entfernen`}
                    title="Übung entfernen"
                  ><X size={16} aria-hidden="true" /></button>
                ) : null}
              </div>
            </header>
            <div className={styles.exerciseEditorGrid}>
              <label className={styles.wideField}>Name
                <input name="exerciseName" required placeholder="z. B. Ollie" />
              </label>
              <label>Trickgruppe
                <input name="exerciseGroup" required defaultValue="Flat" />
              </label>
              <label>Level
                <select name="exerciseLevel" defaultValue="1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option value={level} key={level}>Level {level}</option>
                  ))}
                </select>
              </label>
              <label>Zielart
                <select name="exerciseTargetType" defaultValue="attempts">
                  {Object.entries(targetTypeLabels).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>Zielwert
                <input name="exerciseTargetValue" required defaultValue="10" placeholder="z. B. 10 oder 30 Sekunden" />
              </label>
              <label className={styles.wideField}>Trainerhinweis
                <textarea name="exerciseTrainerNote" rows={2} required placeholder="Worauf soll der Athlet achten?" />
              </label>
              <label className={styles.wideField}>Benötigtes Material <small>optional</small>
                <input name="exerciseEquipment" placeholder="z. B. Board, Rail oder Schutzausrüstung" />
              </label>
            </div>
          </article>
        ))}
      </div>
      <button className={styles.addExerciseButton} type="button" onClick={addRow}>
        <Plus size={16} aria-hidden="true" />
        Weitere Übung hinzufügen
      </button>
    </fieldset>
  );
}

function TrickRow({
  trick,
  athleteName,
  permissions,
  onUpdate,
  expanded,
  onToggleExpanded,
  evidenceHistory,
  demoVideos,
  evidenceFormOpen,
  demoFormOpen,
  isSubmitting,
  isSubmittingDemo,
  canAddDemo,
  onToggleEvidenceForm,
  onToggleDemoForm,
  onSubmitEvidence,
  onSubmitDemo,
}: {
  trick: TrainingTrick;
  athleteName: string;
  permissions: {
    canReportProgress: boolean;
    canConfirm: boolean;
    confirmationHint: string;
  };
  onUpdate: (trickId: string, status: TrickProgressStatus) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  evidenceHistory: TrainingVideoEvidence[];
  demoVideos: TrainingExerciseDemoVideo[];
  evidenceFormOpen: boolean;
  demoFormOpen: boolean;
  isSubmitting: boolean;
  isSubmittingDemo: boolean;
  canAddDemo: boolean;
  onToggleEvidenceForm: () => void;
  onToggleDemoForm: () => void;
  onSubmitEvidence: (event: React.FormEvent<HTMLFormElement>) => void;
  onSubmitDemo: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const targetType = trick.targetType ?? "free";
  const latestEvidence = evidenceHistory[0];
  const hasPendingEvidence = evidenceHistory.some(
    (evidence) => evidence.reviewStatus === "pending",
  );
  const detailsId = `trick-details-${trick.id}`;

  return (
    <article className={styles.exerciseCard}>
      <header className={styles.exerciseCardHeader}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onToggleExpanded}
        >
          <span className={styles.level}>LVL {trick.level}</span>
          <span className={styles.exerciseTitle}>
            <strong>{trick.name}</strong>
            <small>{trick.group} · Position {(trick.sortOrder ?? 0) + 1}</small>
          </span>
          <span className={`${styles.trickStatus} ${styles[trick.status]}`}>
            {trickStatusLabels[trick.status]}
          </span>
          <ChevronDown className={expanded ? styles.chevronExpanded : ""} size={19} aria-hidden="true" />
        </button>
      </header>
      {expanded ? (
        <div className={styles.exerciseCardBody} id={detailsId}>
          <div className={styles.exerciseDetails}>
            <div><small>Zielart</small><strong>{targetTypeLabels[targetType]}</strong></div>
            <div><small>Zielwert</small><strong>{trick.targetValue || "Nach Trainerabsprache"}</strong></div>
            <div><small>Athlet</small><strong>{athleteName}</strong></div>
            <div><small>Material</small><strong>{trick.equipment || "Kein Zusatzmaterial"}</strong></div>
          </div>
          <div className={styles.trainerNote}>
            <small>Trainerhinweis</small>
            <p>{trick.trainerNote || "Auf eine sichere und kontrollierte Ausführung achten."}</p>
          </div>

          <section className={styles.demoSection} aria-label={`Trainer-Demos für ${trick.name}`}>
            <div className={styles.demoSectionHeading}>
              <div>
                <strong><Video size={16} /> Trainer-Demos</strong>
                <small>Videos werden ausschließlich nach einem bewussten Klick bei YouTube geöffnet.</small>
              </div>
              {canAddDemo ? (
                <button type="button" onClick={onToggleDemoForm}>
                  <Plus size={15} /> {demoFormOpen ? "Formular schließen" : "Demo hinzufügen"}
                </button>
              ) : null}
            </div>

            {demoVideos.length > 0 ? (
              <div className={styles.demoList}>
                {demoVideos.map((demo) => {
                  const youtubeUrl = buildYoutubeVideoUrl(demo.videoId);
                  return (
                    <article key={demo.id}>
                      <span className={styles.demoIcon}><Video size={17} /></span>
                      <div>
                        <strong>{demo.title}</strong>
                        {demo.trainerNote ? <p>{demo.trainerNote}</p> : null}
                        <small>
                          {demo.visibility === "public" ? <Eye size={13} /> : <Users size={13} />}
                          {demo.visibility === "public"
                            ? "Alle angemeldeten Nutzer"
                            : "Nur zugewiesene Athleten"}
                        </small>
                      </div>
                      {youtubeUrl ? (
                        <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={15} /> Bei YouTube öffnen
                        </a>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className={styles.emptyDemo}>Noch kein Trainer-Demo für diese Übung.</p>
            )}

            {demoFormOpen && canAddDemo ? (
              <form className={`${styles.evidenceForm} ${styles.demoForm}`} onSubmit={onSubmitDemo}>
                <div>
                  <label>YouTube-Link
                    <input
                      name="demoYoutubeUrl"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      required
                      placeholder="https://youtu.be/…"
                    />
                  </label>
                  <label>Titel
                    <input name="demoTitle" required maxLength={160} placeholder="Was wird im Video gezeigt?" />
                  </label>
                  <label>Sichtbarkeit
                    <select name="demoVisibility" defaultValue="assigned" required>
                      <option value="assigned">Nur zugewiesene Athleten</option>
                      <option value="public">Alle angemeldeten Nutzer</option>
                    </select>
                  </label>
                  <label className={styles.evidenceComment}>Hinweis zum Demo <small>optional</small>
                    <textarea name="demoTrainerNote" rows={3} maxLength={2000} placeholder="Worauf sollen Athleten achten?" />
                  </label>
                </div>
                <p>
                  Es wird ausschließlich die geprüfte YouTube-ID gespeichert. Nicht gelistete
                  Videos können von jeder Person mit dem Link weitergegeben werden.
                </p>
                <button type="submit" disabled={isSubmittingDemo}>
                  <Send size={15} /> {isSubmittingDemo ? "Wird veröffentlicht …" : "Demo veröffentlichen"}
                </button>
              </form>
            ) : null}
          </section>

          {latestEvidence?.trainerFeedback ? (
            <div className={styles.inlineFeedback}>
              <strong>Letztes Trainerfeedback</strong>
              <p>{latestEvidence.trainerFeedback}</p>
            </div>
          ) : null}
          <div className={styles.trickActions}>
            {trick.status === "not_started" && permissions.canReportProgress ? (
              <button type="button" onClick={() => onUpdate(trick.id, "in_progress")}>Starten</button>
            ) : null}
            {trick.status === "in_progress" && permissions.canReportProgress ? (
              <>
                <button type="button" onClick={() => onUpdate(trick.id, "awaiting_confirmation")}>Ohne Video zur Prüfung</button>
                <button
                  type="button"
                  className={styles.videoEvidenceButton}
                  disabled={hasPendingEvidence}
                  onClick={onToggleEvidenceForm}
                ><Video size={15} /> YouTube-Nachweis</button>
              </>
            ) : null}
            {trick.status === "awaiting_confirmation" && permissions.canConfirm ? (
              <button type="button" className={styles.confirmButton} onClick={() => onUpdate(trick.id, "confirmed")}>
                <Check size={15} /> Bestätigen
              </button>
            ) : null}
            {trick.status === "awaiting_confirmation" && !permissions.canConfirm ? (
              <small className={styles.permissionHint}>{permissions.confirmationHint}</small>
            ) : null}
            {trick.status === "confirmed" ? <CheckCircle2 size={20} className={styles.confirmedIcon} /> : null}
          </div>
          {evidenceFormOpen && trick.status === "in_progress" && permissions.canReportProgress ? (
            <form className={styles.evidenceForm} onSubmit={onSubmitEvidence}>
              <div>
                <label>YouTube-Link
                  <input
                    name="youtubeUrl"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    required
                    placeholder="https://youtu.be/…"
                  />
                </label>
                <label>Anzahl Versuche
                  <input name="attemptCount" type="number" min="1" max="100000" required />
                </label>
                <label>Selbsteinschätzung
                  <select name="selfRating" required defaultValue="3">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <option value={rating} key={rating}>{rating} von 5</option>
                    ))}
                  </select>
                </label>
                <label className={styles.evidenceComment}>Kommentar
                  <textarea name="athleteComment" rows={3} maxLength={2000} placeholder="Was lief gut, wobei brauchst du Feedback?" />
                </label>
              </div>
              <p>
                Es werden nur sichere HTTPS-Links von YouTube akzeptiert. Nicht gelistete Videos
                können von jeder Person mit dem Link weitergegeben werden. Das Video wird hier
                nicht automatisch geladen.
              </p>
              <button type="submit" disabled={isSubmitting}>
                <Send size={15} /> {isSubmitting ? "Wird eingereicht …" : "Zur Prüfung absenden"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function PlanDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      "button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])",
    );
    focusable?.[0]?.focus();

    // Escape und Fokusumlauf halten Tastaturnutzer sicher innerhalb des Dialogs.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title">
        <header>
          <h2 id="plan-dialog-title">{title}</h2>
          <button type="button" aria-label="Dialog schließen" onClick={onClose}><X size={21} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

function SelectionFieldset({
  legend,
  items,
  itemIds,
  namePrefix,
  selectedIds = [],
}: {
  legend: string;
  items: string[];
  itemIds?: string[];
  namePrefix: string;
  selectedIds?: string[];
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className={styles.selectionGrid}>
        {items.map((item, index) => {
          const id = itemIds?.[index] ?? item;
          return (
            <label key={id}>
              <input
                name={`${namePrefix}-${id}`}
                type="checkbox"
                defaultChecked={selectedIds.includes(id)}
              />
              <span>{getInitials(item)}</span>
              {item}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
