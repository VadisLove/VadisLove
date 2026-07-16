"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type {
  GoalCadence,
  Person,
  TrainingLeaderboardEntry,
  TrainingPlan,
  TrainingTrick,
  TrickProgressStatus,
} from "@/domain/models";
import { useCurrentUser } from "@/components/auth/current-user-context";
import { PageHeader } from "@/components/ui/page-header";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./plans-view.module.css";
import {
  shareTrainingPlanSnapshot,
  updateSharedTrickProgress,
} from "@/app/trainingsplaene/actions";

type PlanFilter = "all" | "active" | "templates" | "public";

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

function getPlanProgress(plan: TrainingPlan) {
  const completedGoals = plan.goals.filter((goal) => goal.completed).length;
  const confirmedTricks = plan.tricks.filter((trick) => trick.status === "confirmed").length;
  const total = plan.goals.length + plan.tricks.length;
  return total === 0 ? 0 : Math.round(((completedGoals + confirmedTricks) / total) * 100);
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
}: {
  initialPlans: TrainingPlan[];
  people: Person[];
  initialLeaderboard: TrainingLeaderboardEntry[] | null;
  initialSelectedPlanId?: string;
  initialDialog?: "share" | null;
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
  const [plans, setPlans] = useState(initialPlans);
  const [persistedLeaderboard, setPersistedLeaderboard] = useState(initialLeaderboard);
  const [selectedPlanId, setSelectedPlanId] = useState(requestedPlanId);
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

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];

  const filteredPlans = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return plans.filter((plan) => {
      const matchesQuery = `${plan.title} ${plan.category} ${plan.author}`
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesFilter =
        filter === "all"
        || (filter === "active" && plan.status === "active")
        || (filter === "templates" && plan.isTemplate)
        || (filter === "public" && plan.visibility === "public");
      return matchesQuery && matchesFilter;
    });
  }, [filter, plans, query]);

  const pendingConfirmations = plans.reduce(
    (count, plan) =>
      count + plan.tricks.filter((trick) => trick.status === "awaiting_confirmation").length,
    0,
  );

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
    setPlans((current) =>
      current.map((plan) => (plan.id === selectedPlanId ? updater(plan) : plan)),
    );
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
    const trickNames = [1, 2, 3]
      .map((number) => String(data.get(`trick-${number}`)).trim())
      .filter(Boolean);

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
      tricks: trickNames.map((name, index) => ({
        id: crypto.randomUUID(),
        name,
        group: String(data.get("trickGroup")) || "Flat",
        level: Number(data.get("level")) || 1,
        athleteId: athleteIds[index % Math.max(athleteIds.length, 1)] ?? "",
        status: "not_started",
      })),
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

  function toggleGoal(goalId: string) {
    updateSelectedPlan((plan) => ({
      ...plan,
      goals: plan.goals.map((goal) =>
        goal.id === goalId ? { ...goal, completed: !goal.completed } : goal,
      ),
    }));
  }

  function personName(id: string) {
    if (currentUser?.id === id) {
      return `${currentUser.displayName} (Du)`;
    }

    return people.find((person) => person.id === id)?.name ?? "Noch nicht zugewiesen";
  }

  return (
    <>
      <PageHeader
        title={t("plans.title")}
        description="Individuelle Skateboard-Ziele planen, zuweisen und als Trainer bestätigen."
        showContext
      />

      <section className={styles.overview}>
        <article>
          <span><FileText size={20} /></span>
          <div><strong>{plans.length}</strong><small>Trainingspläne</small></div>
        </article>
        <article>
          <span><BellRing size={20} /></span>
          <div><strong>{pendingConfirmations}</strong><small>offene Bestätigungen</small></div>
        </article>
        <article>
          <span><Users size={20} /></span>
          <div><strong>{athletes.length}</strong><small>aktive Athleten</small></div>
        </article>
        <article className={styles.soundCard}>
          <span><Sparkles size={20} /></span>
          <div><strong>Belohnungen</strong><small>Animation an</small></div>
          <button
            type="button"
            aria-label={soundEnabled ? "Belohnungssound ausschalten" : "Belohnungssound einschalten"}
            onClick={() => setSoundEnabled((enabled) => !enabled)}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </article>
      </section>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("plans.searchPlaceholder")}
          />
        </label>
        <div className={styles.filters} aria-label="Trainingspläne filtern">
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
        </div>
        <button type="button" className={styles.createButton} onClick={() => setDialog("create")}>
          <Plus size={18} /> {t("plans.create")}
        </button>
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

      <div className={styles.workspace}>
        <section className={styles.planList} aria-label="Trainingspläne">
          {filteredPlans.map((plan) => {
            const progress = getPlanProgress(plan);
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

          <section className={styles.leaderboard}>
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
          </section>
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
              <div className={styles.detailActions}>
                <button type="button" onClick={duplicateSelectedPlan}>
                  <Copy size={17} /> Als Vorlage nutzen
                </button>
                <button type="button" onClick={() => setDialog("share")}>
                  <Share2 size={17} /> Teilen
                </button>
              </div>
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
                    {selectedPlan.assignedAthletes.length
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
                  <h2><Sparkles size={18} /> Trickliste & Level</h2>
                  <p>Athleten reichen Erfolge ein, Trainer bestätigen sie.</p>
                </div>
                <span>{selectedPlan.tricks.filter((trick) => trick.status === "confirmed").length} / {selectedPlan.tricks.length} bestätigt</span>
              </div>
              <div className={styles.trickTable}>
                <div className={styles.trickHeader}>
                  <span>Trick</span><span>Athlet</span><span>Status</span><span>Aktion</span>
                </div>
                {selectedPlan.tricks.map((trick) => (
                  <TrickRow
                    key={trick.id}
                    trick={trick}
                    athleteName={personName(trick.athleteId)}
                    permissions={getTrickPermissions(trick)}
                    onUpdate={updateTrick}
                  />
                ))}
                {selectedPlan.tricks.length === 0 ? (
                  <div className={styles.emptyTricks}>Diese Vorlage enthält noch keine Tricks.</div>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}
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
              <label>Level<select name="level"><option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option><option value="4">Level 4</option><option value="5">Level 5</option></select></label>
              <label>Trickgruppe<input name="trickGroup" defaultValue="Flat" /></label>
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

            <fieldset>
              <legend>Erste Tricks</legend>
              <div className={styles.formGrid}>
                {[1, 2, 3].map((number) => (
                  <label key={number}>Trick {number}<input name={`trick-${number}`} placeholder={number === 1 ? "z. B. Ollie" : "Optional"} /></label>
                ))}
              </div>
            </fieldset>

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

function TrickRow({
  trick,
  athleteName,
  permissions,
  onUpdate,
}: {
  trick: TrainingTrick;
  athleteName: string;
  permissions: {
    canReportProgress: boolean;
    canConfirm: boolean;
    confirmationHint: string;
  };
  onUpdate: (trickId: string, status: TrickProgressStatus) => void;
}) {
  return (
    <article className={styles.trickRow}>
      <div>
        <span className={styles.level}>LVL {trick.level}</span>
        <div><strong>{trick.name}</strong><small>{trick.group}</small></div>
      </div>
      <span>{athleteName}</span>
      <span className={`${styles.trickStatus} ${styles[trick.status]}`}>
        {trickStatusLabels[trick.status]}
      </span>
      <div className={styles.trickActions}>
        {trick.status === "not_started" && permissions.canReportProgress ? (
          <button type="button" onClick={() => onUpdate(trick.id, "in_progress")}>Starten</button>
        ) : null}
        {trick.status === "in_progress" && permissions.canReportProgress ? (
          <button type="button" onClick={() => onUpdate(trick.id, "awaiting_confirmation")}>Als geschafft melden</button>
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
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title">
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
