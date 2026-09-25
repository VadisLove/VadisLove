"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, History, Play, Plus } from "lucide-react";
import {
  reviewTrainingVideoEvidence,
  shareTrainingPlanSnapshot,
  submitTrainingVideoEvidence,
  updateSharedTrickProgress,
} from "@/app/trainingsplaene/actions";
import type { TrainingPlan, TrainingVideoEvidence, TrickProgressStatus } from "@/domain/models";
import type { TrainingWorkspace } from "@/domain/training";
import type { SessionRecap } from "@/domain/training-recap";
import { Button } from "@/components/ui/button";
import { SessionView, StartTraining } from "@/features/training/training-workspace";
import { useTrainingWorkspace } from "@/features/training/use-training-workspace";
import {
  buildHubPlans,
  cellKey,
  daysUntil,
  hubRoleOf,
  inDays,
  nextStepFor,
  openReports,
  pendingEvidenceMap,
  planPercent,
  shortName,
  sortHubPlans,
  stepOf,
  trickAggregate,
  waitingReports,
  words,
  type HubAssignment,
  type HubPlan,
  type HubRole,
  type HubTrick,
  type Step,
  type WaitingReport,
} from "./plan-hub-model";
import { PlanDetail } from "./plan-detail";
import { AthleteProgress, StaffProgress } from "./plan-progress";
import { RecapView } from "./plan-recap";
import { ReportSheet, ReviewSheet, type ReportInput } from "./plan-sheets";
import { PlanWizard, type WizardResult } from "./plan-wizard";
import styles from "./plan-hub.module.css";
import trainingStyles from "@/features/training/training.module.css";

export type HubTab = "plaene" | "fortschritt" | "rueckblick";

/** Aktionen, die Detail-, Fortschritts- und Rückblick-Ansicht auslösen können. */
export interface HubActions {
  /** Schlüssel der Zelle, deren Aktion gerade läuft (Buttons sperren). */
  busyKey: string;
  markPracticed: (plan: HubPlan, assignment: HubAssignment, trick: HubTrick) => void;
  openReport: (plan: HubPlan, assignment: HubAssignment, trick: HubTrick) => void;
  openReview: (plan: HubPlan, assignment: HubAssignment, trick: HubTrick) => void;
  confirm: (report: WaitingReport, feedback: string) => void;
  practiceAgain: (report: WaitingReport, feedback: string) => void;
  showProgress: (planKey: string) => void;
  edit: (plan: HubPlan) => void;
  startTraining: (plan: HubPlan) => void;
}

type SheetState =
  | { type: "report"; plan: HubPlan; assignment: HubAssignment; trick: HubTrick }
  | { type: "review"; report: WaitingReport }
  | null;

const dotTone = ["dotOpen", "dotPracticed", "dotReported", "dotConfirmed"] as const;

function setUrlParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url);
}

/**
 * Trainingspläne, Freigaben & Fortschritte und Session-Rückblick in einem Bereich.
 *
 * Serverdaten kommen als Props; nach jeder Aktion wird die Route neu geladen.
 * Bis dahin zeigen lokale Overrides den bereits bestätigten neuen Status.
 */
export function PlanHub({
  workspace,
  evidence: initialEvidence,
  recaps,
  recapsFailed,
  names: nameEntries,
  initialTab,
  initialPlanKey,
  initialAction,
  initialSessionId,
  initialExercise,
  createRequest,
}: {
  workspace: TrainingWorkspace | null;
  evidence: TrainingVideoEvidence[];
  recaps: SessionRecap[];
  recapsFailed: boolean;
  names: [string, string][];
  initialTab: HubTab;
  initialPlanKey: string | null;
  /** `share` (z. B. aus dem Dashboard) öffnet direkt die Zuweisung des Plans. */
  initialAction: string | null;
  initialSessionId: string | null;
  initialExercise: number;
  createRequest: string | null;
}) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [dirty, setDirty] = useState(false);
  const [startPlan, setStartPlan] = useState<TrainingPlan | null>(null);

  const openSession = useCallback((id: string | null) => {
    setSessionId(id);
    setUrlParam("session", id);
    setUrlParam("exercise", null);
  }, []);

  const training = useTrainingWorkspace(workspace, (command, reply) => {
    if (command.operation === "session_start" && reply.result.session_id) {
      setStartPlan(null);
      openSession(reply.result.session_id);
    }
  });
  const data = training.data;
  const role: HubRole = hubRoleOf(data?.user.accountType);
  const staff = role === "staff";
  // Athlet*innen dürfen bis zur Rechteverwaltung weiterhin eigene Pläne anlegen.
  const canCreate = role === "staff" || role === "athlete";

  const [evidence, setEvidence] = useState(initialEvidence);
  const [overrides, setOverrides] = useState<Record<string, Step>>({});
  // Neue Serverdaten ersetzen lokale Zwischenstände (Abgleich während des Renderns).
  const [previousServer, setPreviousServer] = useState({ initialEvidence, workspace });
  if (previousServer.initialEvidence !== initialEvidence || previousServer.workspace !== workspace) {
    setPreviousServer({ initialEvidence, workspace });
    setEvidence(initialEvidence);
    setOverrides({});
  }

  const names = useMemo(() => {
    const map = new Map(nameEntries);
    for (const person of [...(data?.people ?? []), ...(data?.sharePeople ?? [])]) map.set(person.id, person.name);
    if (data) map.set(data.user.id, data.user.displayName);
    return map;
  }, [nameEntries, data]);

  const plans = useMemo(() => {
    if (!data) return [];
    const built = buildHubPlans({ savedPlans: data.plans, shares: data.shares, userId: data.user.id, names }).map((plan) => ({
      ...plan,
      assignments: plan.assignments.map((assignment) => ({
        ...assignment,
        steps: Object.fromEntries(
          Object.entries(assignment.steps).map(([trickId, step]) => [
            trickId,
            overrides[cellKey(assignment.shareId, trickId)] ?? step,
          ]),
        ),
      })),
    }));
    return sortHubPlans(built, role);
  }, [data, names, overrides, role]);

  const evidenceMap = useMemo(() => pendingEvidenceMap(evidence), [evidence]);
  const reports = useMemo(() => (staff ? waitingReports(plans, evidenceMap) : []), [staff, plans, evidenceMap]);
  const hasEvidence = useCallback((key: string) => evidenceMap.has(key), [evidenceMap]);

  const findPlan = useCallback(
    (key: string | null) =>
      key ? plans.find((plan) => plan.key === key || plan.assignments.some((entry) => entry.shareId === key)) : undefined,
    [plans],
  );

  const [tab, setTab] = useState<HubTab>(initialTab);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => initialPlanKey);
  const [mobileDetail, setMobileDetail] = useState(Boolean(initialPlanKey));
  const [progressKey, setProgressKey] = useState<string | null>(initialPlanKey);
  const [wizard, setWizard] = useState<{ edit: HubPlan | null; step?: number } | null>(() => {
    const plan = initialAction === "share" ? findPlan(initialPlanKey) : undefined;
    return plan?.editable && hubRoleOf(workspace?.user.accountType) === "staff" ? { edit: plan, step: 2 } : null;
  });
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busyKey, setBusyKey] = useState("");

  const selected = findPlan(selectedKey) ?? plans[0] ?? null;
  const progressPlans = staff
    ? plans.filter((plan) => plan.assignments.length)
    : plans.filter((plan) => plan.kind === "received");
  const progressPlan =
    findPlan(progressKey) && progressPlans.includes(findPlan(progressKey)!)
      ? findPlan(progressKey)!
      : (staff ? progressPlans.find((plan) => openReports(plan).length) : null) ?? progressPlans[0] ?? null;

  // Der zentrale „+“-Button der mobilen Tab-Bar hängt `?neu=<Zeit>` an;
  // jeder neue Zeitstempel öffnet den Erstellen-Flow genau einmal.
  const [handledCreate, setHandledCreate] = useState<string | null>(null);
  if (createRequest && canCreate && createRequest !== handledCreate) {
    setHandledCreate(createRequest);
    setWizard({ edit: null });
  }
  useEffect(() => {
    if (createRequest) setUrlParam("neu", null);
  }, [createRequest]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || training.pending || training.busy) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, training.pending, training.busy]);

  function switchTab(next: HubTab) {
    setTab(next);
    setUrlParam("tab", next === "plaene" ? null : next);
    window.scrollTo({ top: 0 });
  }

  function selectPlan(key: string) {
    setSelectedKey(key);
    setMobileDetail(true);
    window.scrollTo({ top: 0 });
  }

  /* ----------------------------- Aktionen ----------------------------- */

  async function changeStep(assignment: HubAssignment, trick: HubTrick, status: TrickProgressStatus, success: string) {
    const key = cellKey(assignment.shareId, trick.id);
    setBusyKey(key);
    try {
      const result = await updateSharedTrickProgress({ planId: assignment.shareId, trickId: trick.id, status });
      if (result.status === "error") {
        setToast(result.message);
        return false;
      }
      setOverrides((current) => ({ ...current, [key]: stepOf[status] }));
      setToast(success);
      router.refresh();
      return true;
    } catch {
      setToast("Nicht gespeichert. Bitte erneut versuchen.");
      return false;
    } finally {
      setBusyKey("");
    }
  }

  async function review(report: WaitingReport, decision: "approved" | "changes_requested", feedback: string, success: string) {
    const { assignment, trick, evidence: item } = report;
    if (!item) {
      return changeStep(assignment, trick, decision === "approved" ? "confirmed" : "in_progress", success);
    }
    const key = cellKey(assignment.shareId, trick.id);
    setBusyKey(key);
    try {
      const result = await reviewTrainingVideoEvidence({
        evidenceId: item.id,
        decision,
        // „Nochmal üben“ verlangt serverseitig eine Begründung.
        trainerFeedback: feedback || (decision === "changes_requested" ? "Bitte nochmal üben." : ""),
      });
      if (result.status === "error") {
        setToast(result.message);
        return false;
      }
      if (result.evidence) {
        setEvidence((current) => current.map((entry) => (entry.id === item.id ? result.evidence! : entry)));
      }
      setOverrides((current) => ({ ...current, [key]: decision === "approved" ? 3 : 1 }));
      setToast(success);
      router.refresh();
      return true;
    } catch {
      setToast("Nicht gespeichert. Bitte erneut versuchen.");
      return false;
    } finally {
      setBusyKey("");
    }
  }

  async function submitReport(plan: HubPlan, assignment: HubAssignment, trick: HubTrick, input: ReportInput) {
    const success = `Gemeldet – ${words().nom} wurde benachrichtigt`;
    if (!input.youtubeUrl) {
      if (await changeStep(assignment, trick, "awaiting_confirmation", success)) setSheet(null);
      return;
    }
    const key = cellKey(assignment.shareId, trick.id);
    setBusyKey(key);
    try {
      const result = await submitTrainingVideoEvidence({
        planId: assignment.shareId,
        trickId: trick.id,
        youtubeUrl: input.youtubeUrl,
        athleteComment: input.note,
        attemptCount: input.attempts,
        selfRating: input.rating,
      });
      if (result.status === "error") {
        setToast(result.message);
        return;
      }
      if (result.evidence) setEvidence((current) => [result.evidence!, ...current]);
      setOverrides((current) => ({ ...current, [key]: 2 }));
      setSheet(null);
      setToast(success);
      router.refresh();
    } catch {
      setToast("Nicht gespeichert. Bitte erneut versuchen.");
    } finally {
      setBusyKey("");
    }
  }

  const actions: HubActions = {
    busyKey,
    markPracticed: (_plan, assignment, trick) =>
      void changeStep(assignment, trick, "in_progress", `${trick.name} als geübt markiert`),
    openReport: (plan, assignment, trick) => setSheet({ type: "report", plan, assignment, trick }),
    openReview: (plan, assignment, trick) =>
      setSheet({
        type: "review",
        report: { plan, assignment, trick, evidence: evidenceMap.get(cellKey(assignment.shareId, trick.id)) },
      }),
    confirm: (report, feedback) =>
      void review(report, "approved", feedback, `${report.trick.name} für ${shortName(report.assignment.athleteName)} bestätigt`).then(
        (ok) => ok && setSheet(null),
      ),
    practiceAgain: (report, feedback) =>
      void review(
        report,
        "changes_requested",
        feedback,
        `${shortName(report.assignment.athleteName)} übt ${report.trick.name} nochmal`,
      ).then((ok) => ok && setSheet(null)),
    showProgress: (planKey) => {
      setProgressKey(planKey);
      switchTab("fortschritt");
    },
    edit: (plan) => setWizard({ edit: plan }),
    startTraining: (plan) => {
      if (!data) return;
      const content = plan.savedPlanId
        ? data.plans.find((entry) => entry.id === plan.savedPlanId)?.versions[0]?.content
        : data.shares.find((entry) => entry.id === plan.startId);
      if (content) setStartPlan(plan.savedPlanId ? { ...content, id: plan.savedPlanId } : content);
    },
  };

  async function submitWizard(result: WizardResult) {
    const editing = wizard?.edit ?? null;
    const saved = await training.run("plan_save", {
      id: editing?.savedPlanId ?? result.content.id,
      revision: result.revision,
      content: editing?.savedPlanId ? { ...result.content, id: editing.savedPlanId } : result.content,
    });
    if (!saved) {
      setToast("Plan nicht gespeichert. Bitte erneut versuchen.");
      return;
    }
    let text = editing
      ? `Version ${result.revision + 1} von „${result.content.title}“ gespeichert`
      : result.draft
        ? `„${result.content.title}“ als Entwurf gespeichert`
        : `„${result.content.title}“ erstellt`;
    if (result.recipients.length) {
      const shared = await shareTrainingPlanSnapshot({
        plan: editing?.savedPlanId ? { ...result.content, id: editing.savedPlanId } : result.content,
        recipientUserIds: result.recipients,
      });
      text = shared.status === "success" ? `${text} und zugewiesen` : `${text}. ${shared.message}`;
    }
    setWizard(null);
    setSelectedKey(editing?.key ?? result.content.id);
    setToast(text);
    router.refresh();
  }

  /* ------------------------------ Ansicht ----------------------------- */

  const running = data?.sessions.filter((session) => session.status === "running") ?? [];
  const session = data?.sessions.find((entry) => entry.id === sessionId);
  const screen = tab !== "plaene" ? tab : mobileDetail && selected ? "detail" : "list";
  const w = words();

  const statusBar = training.message ? (
    <div className={training.pending || !data ? styles.errorBox : styles.infoNote} role="status">
      {training.message}
      {training.pending && !training.conflict ? (
        <Button variant="secondary" disabled={training.busy} onClick={() => void training.retry()}>
          Erneut versuchen
        </Button>
      ) : null}
      {training.pending || !data ? (
        <Button variant="secondary" disabled={training.busy} onClick={() => void training.load()}>
          Aktuellen Stand laden
        </Button>
      ) : null}
    </div>
  ) : null;

  // Live-Training und Trainingsstart ersetzen die Übersicht vollständig.
  if (data && (session || sessionId || startPlan)) {
    return (
      <div className={`${styles.hub} ${styles.trainingScreen}`}>
        <button
          type="button"
          className={styles.back}
          disabled={training.blocked || dirty}
          onClick={() => {
            setStartPlan(null);
            openSession(null);
          }}
        >
          <ChevronLeft size={18} aria-hidden="true" /> Pläne
        </button>
        {statusBar}
        {session ? (
          <div className={trainingStyles.workspace}>
            <h1 className={styles.planTitle}>{session.plan_snapshot.title}</h1>
            <SessionView
              key={session.id}
              initialExercise={session.id === initialSessionId ? initialExercise : 0}
              session={session}
              blocked={training.blocked}
              run={training.run}
              onDirty={setDirty}
            />
          </div>
        ) : startPlan ? (
          <div className={trainingStyles.workspace}>
          <StartTraining
            plan={startPlan}
            data={data}
            blocked={training.blocked}
            run={training.run}
            cancel={() => setStartPlan(null)}
          />
          </div>
        ) : (
          <p className={styles.errorBox}>Dieses Training ist nicht verfügbar oder du hast keinen Zugriff mehr.</p>
        )}
      </div>
    );
  }

  const tabs: { id: HubTab; label: string; count?: number }[] = [
    { id: "plaene", label: "Pläne" },
    ...(staff
      ? [{ id: "fortschritt" as const, label: "Freigaben & Fortschritte", count: reports.length }]
      : role === "athlete"
        ? [{ id: "fortschritt" as const, label: "Mein Fortschritt" }]
        : []),
    { id: "rueckblick", label: "Session-Rückblick" },
  ];

  return (
    <div className={styles.hub} data-screen={screen}>
      <header className={styles.head}>
        <div>
          <span className={styles.kicker}>Training</span>
          <h1 className={styles.title}>Trainingspläne</h1>
        </div>
        {canCreate ? (
          <Button size="lg" className={styles.desktopOnly} onClick={() => setWizard({ edit: null })}>
            <Plus size={18} aria-hidden="true" /> Plan erstellen
          </Button>
        ) : null}
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Bereiche">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? styles.tabOn : undefined}
            onClick={() => switchTab(entry.id)}
          >
            {entry.label}
            {entry.count ? <span className={styles.tabCount}>{entry.count}</span> : null}
          </button>
        ))}
      </nav>

      {statusBar}

      {!data ? (
        <p className={styles.emptyCard}>Deine Trainingspläne werden erst nach erfolgreichem Abruf angezeigt.</p>
      ) : tab === "plaene" ? (
        <div className={styles.plansLayout}>
          <div className={styles.planList}>
            {running.map((entry) => (
              <button key={entry.id} type="button" className={styles.entryCard} onClick={() => openSession(entry.id)}>
                <span className={`${styles.entryIcon} ${styles.entryBlue}`}>
                  <Play size={18} fill="currentColor" aria-hidden="true" />
                </span>
                <span>
                  <strong>Laufendes Training</strong>
                  <small>{entry.plan_snapshot.title} · fortsetzen</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}

            {role === "athlete" ? <NextStepCard plans={plans} actions={actions} onOpen={selectPlan} /> : null}

            <ProgressEntry role={role} plans={plans} reports={reports.length} onOpen={() => switchTab("fortschritt")} />

            <button type="button" className={`${styles.entryCard} ${styles.mobileOnlyFlex}`} onClick={() => switchTab("rueckblick")}>
              <span className={`${styles.entryIcon} ${styles.entryBlue}`}>
                <History size={20} aria-hidden="true" />
              </span>
              <span>
                <strong>Session-Rückblick</strong>
                <small>Landungen, Quoten & Hinweise</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>

            {plans.length ? <h2 className={`${styles.listLabel} ${styles.mobileOnly}`}>Meine Pläne</h2> : null}
            {plans.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                role={role}
                selected={selected?.key === plan.key}
                onSelect={() => selectPlan(plan.key)}
              />
            ))}
            {!plans.length ? (
              <p className={styles.emptyCard}>
                {canCreate ? "Noch keine Pläne. Erstelle deinen ersten Plan – auch ohne Verein." : "Noch keine Pläne zugewiesen."}
              </p>
            ) : null}
            {canCreate ? (
              <button type="button" className={styles.newPlan} onClick={() => setWizard({ edit: null })}>
                <Plus size={18} aria-hidden="true" /> Neuer Plan
              </button>
            ) : (
              <p className={styles.listHint}>Neue Pläne erstellt {w.nom} oder der Verein.</p>
            )}
          </div>
          {selected ? (
            <PlanDetail
              key={selected.key}
              plan={selected}
              role={role}
              actions={actions}
              hasEvidence={hasEvidence}
              onBack={() => setMobileDetail(false)}
            />
          ) : null}
        </div>
      ) : tab === "fortschritt" ? (
        staff ? (
          <StaffProgress
            plans={progressPlans}
            plan={progressPlan}
            onSelect={setProgressKey}
            reports={reports}
            hasEvidence={hasEvidence}
            actions={actions}
            onBack={() => switchTab("plaene")}
          />
        ) : (
          <AthleteProgress
            plans={progressPlans}
            plan={progressPlan}
            onSelect={setProgressKey}
            evidence={evidence.filter((item) => item.athleteId === data.user.id)}
            onBack={() => switchTab("plaene")}
          />
        )
      ) : (
        <RecapView
          recaps={recaps}
          failed={recapsFailed}
          role={role}
          userId={data.user.id}
          plans={plans}
          actions={actions}
          onBack={() => switchTab("plaene")}
        />
      )}

      {wizard ? (
        <PlanWizard
          role={role}
          editPlan={wizard.edit}
          startStep={wizard.step}
          athletes={data?.people ?? []}
          busy={training.busy}
          onClose={() => setWizard(null)}
          onSubmit={(result) => void submitWizard(result)}
        />
      ) : null}

      {sheet?.type === "report" ? (
        <ReportSheet
          trickName={sheet.trick.name}
          busy={busyKey === cellKey(sheet.assignment.shareId, sheet.trick.id)}
          onClose={() => setSheet(null)}
          onSubmit={(input) => void submitReport(sheet.plan, sheet.assignment, sheet.trick, input)}
        />
      ) : null}
      {sheet?.type === "review" ? (
        <ReviewSheet
          report={sheet.report}
          busy={busyKey === cellKey(sheet.report.assignment.shareId, sheet.report.trick.id)}
          onClose={() => setSheet(null)}
          onConfirm={(feedback) => actions.confirm(sheet.report, feedback)}
          onAgain={(feedback) => actions.practiceAgain(sheet.report, feedback)}
        />
      ) : null}

      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------- Listenkarten ----------------------------- */

function PlanCard({
  plan,
  role,
  selected,
  onSelect,
}: {
  plan: HubPlan;
  role: HubRole;
  selected: boolean;
  onSelect: () => void;
}) {
  const open = role === "staff" ? openReports(plan).length : 0;
  const days = daysUntil(plan.deadline);
  const mine = plan.kind === "received" ? plan.assignments[0] : null;
  const sub =
    role === "staff"
      ? plan.assignments.length === 1
        ? `Individuell · ${shortName(plan.assignments[0].athleteName)}`
        : plan.assignments.length
          ? `${plan.assignments.length} Athleten`
          : plan.isDraft
            ? "Noch nicht zugewiesen"
            : "Eigener Plan"
      : mine
        ? `Von ${plan.sourceLabel || words().dat}${days !== null && days >= 0 ? ` · Frist ${inDays(days)}` : ""}`
        : "Eigener Plan · nur für dich";

  return (
    <button
      type="button"
      className={`${styles.planCard} ${selected ? styles.planCardOn : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.planCardMain}>
        <span className={styles.planCardTitle}>
          <strong>{plan.title}</strong>
          {open ? <span className={`${styles.badge} ${styles.badgeWarn}`}>{open} offen</span> : null}
          {plan.isDraft ? <span className={styles.badge}>Entwurf</span> : null}
        </span>
        <small>{sub}</small>
        <span className={styles.dots} aria-hidden="true">
          {plan.tricks.slice(0, 12).map((trick) => {
            const step: Step = plan.assignments.length ? trickAggregate(plan, trick.id).step : 0;
            return <span key={trick.id} className={styles[dotTone[step]]} />;
          })}
        </span>
      </span>
      <span className={styles.percent}>
        {planPercent(plan)}
        <small>%</small>
      </span>
    </button>
  );
}

function ProgressEntry({
  role,
  plans,
  reports,
  onOpen,
}: {
  role: HubRole;
  plans: HubPlan[];
  reports: number;
  onOpen: () => void;
}) {
  if (role === "staff") {
    if (!plans.some((plan) => plan.assignments.length)) return null;
    return (
      <button type="button" className={`${styles.entryCard} ${reports ? styles.entryWarn : ""}`} onClick={onOpen}>
        <span className={`${styles.entryIcon} ${reports ? styles.entryAmber : styles.entryBlue}`}>{reports}</span>
        <span>
          <strong>{reports === 1 ? "1 Meldung wartet" : reports ? `${reports} Meldungen warten` : "Keine offenen Meldungen"}</strong>
          <small>{reports ? "In der Matrix bestätigen" : "Fortschritte in der Matrix ansehen"}</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    );
  }
  if (role !== "athlete") return null;
  const received = plans.filter((plan) => plan.kind === "received");
  if (!received.length) return null;
  let confirmed = 0;
  let waiting = 0;
  let total = 0;
  for (const plan of received) {
    for (const trick of plan.tricks) {
      const step = plan.assignments[0].steps[trick.id] ?? 0;
      total += 1;
      if (step === 3) confirmed += 1;
      if (step === 2) waiting += 1;
    }
  }
  return (
    <button type="button" className={styles.entryCard} onClick={onOpen}>
      <span className={`${styles.entryIcon} ${styles.entryGreen}`}>
        {confirmed}/{total}
      </span>
      <span>
        <strong>Mein Fortschritt</strong>
        <small>
          {confirmed} bestätigt · {waiting} wartet
        </small>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}

function NextStepCard({
  plans,
  actions,
  onOpen,
}: {
  plans: HubPlan[];
  actions: HubActions;
  onOpen: (key: string) => void;
}) {
  const next = nextStepFor(plans);
  if (!next) return null;
  const { plan, trick, step } = next;
  const assignment = plan.assignments[0];
  return (
    <section className={styles.nextCard}>
      <span className={styles.nowKicker}>Dein nächster Schritt</span>
      <h2>
        {trick.name} {step === 1 ? "melden" : "üben"}
      </h2>
      <p>{step === 1 ? `Geübt ✓ – zeig ${words().dat} ein Video` : trick.goal ? `Ziel: ${trick.goal}` : plan.title}</p>
      {step === 1 ? (
        <Button onClick={() => actions.openReport(plan, assignment, trick)}>Jetzt melden →</Button>
      ) : (
        <Button onClick={() => onOpen(plan.key)}>Zum Pfad →</Button>
      )}
    </section>
  );
}
