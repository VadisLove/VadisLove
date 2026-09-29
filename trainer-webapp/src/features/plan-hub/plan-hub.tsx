"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronLeft, ChevronRight, History, Play, Plus } from "lucide-react";
import {
  assignTrainingPlan,
  confirmTrickFromRecap,
  reviewTrainingVideoEvidence,
  saveSalutation,
  setAthletePlanPermission,
  setClubTemplate,
  shareOwnPlanWithTrainer,
  submitTrainingReport,
  updateSharedTrickProgress,
} from "@/app/trainingsplaene/actions";
import { setPlanCreateMode } from "@/components/layout/mobile-bottom-navigation";
import type { TrainingPlan, TrainingVideoEvidence, TrickProgressStatus } from "@/domain/models";
import type { TrainingWorkspace } from "@/domain/training";
import type { SessionRecap } from "@/domain/training-recap";
import { Button } from "@/components/ui/button";
import { SessionView, StartTraining, type PlanStepLookup } from "@/features/training/training-workspace";
import { useTrainingWorkspace } from "@/features/training/use-training-workspace";
import {
  buildHubPlans,
  cellKey,
  daysUntil,
  emptyHubContext,
  hubRoleOf,
  inDays,
  myAssignment,
  nextReportable,
  nextStepFor,
  openReports,
  pendingEvidenceMap,
  personaOf,
  planBadges,
  planPercent,
  shortName,
  sortHubPlans,
  stepOf,
  trickAggregate,
  waitingReports,
  words,
  type HubAssignment,
  type HubContext,
  type HubGroup,
  type HubPlan,
  type HubRole,
  type HubTrick,
  type HubWords,
  type Salutation,
  type Step,
  type WaitingReport,
} from "./plan-hub-model";
import { HubWordsContext, useWords } from "./hub-words";
import { PlanDetail } from "./plan-detail";
import { AthleteProgress, StaffProgress } from "./plan-progress";
import { RecapView } from "./plan-recap";
import { PermissionsSheet, ReportSheet, ReviewSheet, SalutationSheet, type ReportInput } from "./plan-sheets";
import { PlanWizard, type WizardResult } from "./plan-wizard";
import styles from "./plan-hub.module.css";

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
  /** Trainer*innen: offenen/geübten Trick direkt aus dem Rückblick bestätigen (Quote ≥ 80 %). */
  confirmFromRecap: (plan: HubPlan, assignment: HubAssignment, trick: HubTrick, since: number) => void;
  /** Vereinsvorlage als Grundlage für einen neuen Plan übernehmen. */
  useTemplate: (plan: HubPlan) => void;
}

type SheetState =
  | { type: "report"; plan: HubPlan; assignment: HubAssignment; trick: HubTrick }
  | { type: "review"; report: WaitingReport }
  | null;

const dotTone = ["dotOpen", "dotPracticed", "dotReported", "dotConfirmed"] as const;
const badgeTone = { warn: "badgeWarn", draft: "badgeDraft", template: "badgeTemplate", athlete: "badgeAthlete" } as const;

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
  context,
  initialRights = false,
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
  /** Rollen, Rechte, Anrede, Gruppen und Vorlagen; null, wenn der Abruf fehlschlug. */
  context: HubContext | null;
  /** `?rechte=1` (Profil → Berechtigungen) öffnet „Wer darf erstellen?“. */
  initialRights?: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [startPlan, setStartPlan] = useState<{ content: TrainingPlan; assigned: string[] } | null>(null);

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
  const ctx = context ?? emptyHubContext;
  const role: HubRole = hubRoleOf(data?.user.accountType, ctx.isBoard);
  const persona = personaOf(data?.user.accountType, ctx.isBoard);
  const staff = role === "staff";
  // Trainer*innen und Vorstand dürfen immer, Athlet*innen nur mit übertragenem Recht.
  const canCreate = staff || (role === "athlete" && ctx.canCreatePlans);

  // Anrede: eigene Angabe für Rollentexte, Anrede der Trainer*in für Texte über sie.
  const [salutation, setSalutation] = useState<Salutation | null>(ctx.salutation);
  const [salutationAsked, setSalutationAsked] = useState(false);
  const w = useMemo(
    () => words(salutation, role === "athlete" ? ctx.trainerSalutation : salutation),
    [salutation, role, ctx.trainerSalutation],
  );
  const askSalutation = Boolean(context) && salutation === null && role !== "viewer" && !salutationAsked;

  // Lokale Erstellrechte bis zum nächsten Serverabruf (Toggle reagiert sofort).
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, boolean>>({});
  const [rightsOpen, setRightsOpen] = useState(initialRights);
  const permissionContext = useMemo<HubContext>(
    () => ({
      ...ctx,
      athletes: ctx.athletes.map((athlete) => ({
        ...athlete,
        canCreatePlans: permissionOverrides[athlete.id] ?? athlete.canCreatePlans,
      })),
    }),
    [ctx, permissionOverrides],
  );

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
    const built = buildHubPlans({ savedPlans: data.plans, shares: data.shares, userId: data.user.id, names, context: ctx }).map((plan) => ({
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
  }, [data, names, overrides, role, ctx]);

  const evidenceMap = useMemo(() => pendingEvidenceMap(evidence), [evidence]);
  const reports = useMemo(() => (staff ? waitingReports(plans, evidenceMap) : []), [staff, plans, evidenceMap]);
  // „mit Video“ (▶) nur bei echten Videos, reine Notizen zählen als „!“.
  const hasEvidence = useCallback(
    (key: string) => {
      const entry = evidenceMap.get(key);
      return Boolean(entry && entry.provider !== "note");
    },
    [evidenceMap],
  );

  const findPlan = useCallback(
    (key: string | null) =>
      key ? plans.find((plan) => plan.key === key || plan.assignments.some((entry) => entry.shareId === key)) : undefined,
    [plans],
  );

  const [tab, setTab] = useState<HubTab>(initialTab);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => initialPlanKey);
  const [mobileDetail, setMobileDetail] = useState(Boolean(initialPlanKey));
  const [progressKey, setProgressKey] = useState<string | null>(initialPlanKey);
  const [wizard, setWizard] = useState<{ edit: HubPlan | null; step?: number; template?: HubPlan } | null>(() => {
    const plan = initialAction === "share" ? findPlan(initialPlanKey) : undefined;
    return plan?.editable && hubRoleOf(workspace?.user.accountType) === "staff" ? { edit: plan, step: 2 } : null;
  });
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busyKey, setBusyKey] = useState("");

  const selected = findPlan(selectedKey) ?? plans[0] ?? null;
  const progressPlans = staff
    ? plans.filter((plan) => plan.assignments.length)
    : plans.filter((plan) => myAssignment(plan));
  const progressPlan =
    findPlan(progressKey) && progressPlans.includes(findPlan(progressKey)!)
      ? findPlan(progressKey)!
      : (staff ? progressPlans.find((plan) => openReports(plan).length) : null) ?? progressPlans[0] ?? null;

  // Der zentrale „+“-Button der mobilen Tab-Bar hängt `?neu=<Zeit>` an;
  // jeder neue Zeitstempel öffnet den Erstellen-Flow genau einmal.
  // Ohne Erstellrecht öffnet derselbe Button („↑ Melden“) das Melden-Sheet.
  const [handledCreate, setHandledCreate] = useState<string | null>(null);
  if (createRequest && data && createRequest !== handledCreate) {
    setHandledCreate(createRequest);
    if (canCreate) setWizard({ edit: null });
    else if (role === "athlete") reportShortcut(false);
  }
  useEffect(() => {
    if (createRequest) setUrlParam("neu", null);
  }, [createRequest]);
  useEffect(() => {
    if (initialRights) setUrlParam("rechte", null);
  }, [initialRights]);

  // Mittlerer Tab-Bar-Button: „+“ mit Recht, sonst „↑ Melden“.
  const createMode = canCreate || role !== "athlete" ? "create" : "report";
  useEffect(() => {
    setPlanCreateMode(createMode);
    return () => setPlanCreateMode("create");
  }, [createMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (training.pending || training.busy) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [training.pending, training.busy]);

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

  /** „↑ Trick melden“: nächster geübter Trick, sonst Hinweis und Pfad öffnen. */
  // `scroll = false`, wenn der Aufruf während des Renderns erfolgt (Tab-Bar-Anfrage).
  function reportShortcut(scroll = true) {
    const next = nextReportable(plans);
    if (next) {
      setSheet({ type: "report", ...next });
      return;
    }
    const step = nextStepFor(plans);
    setToast(step ? `Markiere ${step.trick.name} zuerst als geübt – dann kannst du ihn melden.` : "Noch kein Trick zum Melden.");
    if (step) {
      setTab("plaene");
      setSelectedKey(step.plan.key);
      setMobileDetail(true);
      if (scroll) window.scrollTo({ top: 0 });
    }
  }

  async function togglePermission(athleteId: string, name: string, allowed: boolean) {
    setPermissionOverrides((current) => ({ ...current, [athleteId]: allowed }));
    const result = await setAthletePlanPermission({ athleteId, allowed });
    if (result.status === "error") {
      setPermissionOverrides((current) => ({ ...current, [athleteId]: !allowed }));
      setToast(result.message);
      return;
    }
    setToast(allowed ? `${shortName(name)} darf jetzt Pläne erstellen` : `${shortName(name)} darf keine Pläne mehr erstellen`);
    router.refresh();
  }

  async function chooseSalutation(value: Salutation, label: string | null) {
    setSalutation(value);
    setSalutationAsked(true);
    const result = await saveSalutation(value);
    if (result.status === "error") setToast(result.message);
    else if (label) setToast(`Gespeichert – wir sprechen dich als ${label} an`);
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

  /** Meldung mit hochgeladenem Video oder nur Notiz; `true`, wenn gespeichert. */
  async function submitReport(assignment: HubAssignment, trick: HubTrick, input: ReportInput) {
    const key = cellKey(assignment.shareId, trick.id);
    setBusyKey(key);
    try {
      const result = await submitTrainingReport({
        planId: assignment.shareId,
        trickId: trick.id,
        note: input.note,
        video: input.video,
      });
      if (result.status === "error") {
        setToast(result.message);
        return false;
      }
      if (result.evidence) setEvidence((current) => [result.evidence!, ...current]);
      setOverrides((current) => ({ ...current, [key]: 2 }));
      setSheet(null);
      setToast(`Gemeldet – ${w.nom} wurde benachrichtigt`);
      router.refresh();
      return true;
    } catch {
      setToast("Nicht gespeichert. Bitte erneut versuchen.");
      return false;
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
    confirmFromRecap: (plan, assignment, trick, since) =>
      void (async () => {
        const key = cellKey(assignment.shareId, trick.id);
        setBusyKey(key);
        try {
          const result = await confirmTrickFromRecap({
            planId: assignment.shareId,
            trickId: trick.id,
            since: new Date(since).toISOString(),
          });
          if (result.status === "error") {
            setToast(result.message);
            return;
          }
          setOverrides((current) => ({ ...current, [key]: 3 }));
          setToast(`${trick.name} für ${shortName(assignment.athleteName)} bestätigt`);
          router.refresh();
        } catch {
          setToast("Nicht gespeichert. Bitte erneut versuchen.");
        } finally {
          setBusyKey("");
        }
      })(),
    useTemplate: (plan) => setWizard({ edit: null, template: plan }),
    startTraining: (plan) => {
      if (!data) return;
      const saved = plan.savedPlanId ? data.plans.find((entry) => entry.id === plan.savedPlanId)?.versions[0] : undefined;
      const content = saved ? { ...saved.content, id: plan.savedPlanId! } : data.shares.find((entry) => entry.id === plan.startId);
      if (!content) return;
      // Skater starten ihr Selbsttraining direkt – ohne Zwischenschritt.
      if (role === "athlete") {
        const share = content.id.startsWith("shared-");
        void training.run(
          "session_start",
          {
            source: share ? "share" : "plan",
            plan_id: share ? undefined : content.id,
            share_id: share ? content.id.slice(7) : undefined,
            version_id: saved?.id,
            mode: "self",
            users: [],
          },
          "Training starten",
        );
        return;
      }
      setStartPlan({ content, assigned: plan.assignments.map((entry) => entry.athleteId) });
    },
  };

  async function submitWizard(result: WizardResult) {
    const editing = wizard?.edit ?? null;
    const planId = editing?.savedPlanId ?? result.content.id;
    const content = { ...result.content, id: planId };
    const saved = await training.run("plan_save", { id: planId, revision: result.revision, content });
    if (!saved) {
      setToast("Plan nicht gespeichert. Bitte erneut versuchen.");
      return;
    }
    // Zuweisungen nutzen denselben Stand wie die soeben gespeicherte Version.
    const snapshot = { ...content, version: String(result.revision + 1) };
    let text = editing
      ? `Version ${result.revision + 1} von „${result.content.title}“ gespeichert`
      : result.draft
        ? `„${result.content.title}“ als Entwurf gespeichert`
        : `„${result.content.title}“ erstellt`;
    if (staff && (result.recipients.length || result.groups.length || result.club)) {
      const assigned = await assignTrainingPlan({
        plan: snapshot,
        athleteIds: result.recipients,
        groupIds: result.groups,
        club: result.club,
      });
      text = assigned.status === "success" ? `${text} und zugewiesen` : `${text}. ${assigned.message}`;
    }
    if (persona === "board" && result.clubTemplate !== (editing?.isTemplate ?? false)) {
      const template = await setClubTemplate({ planId, enabled: result.clubTemplate });
      text =
        template.status === "error"
          ? `${text}. ${template.message}`
          : result.clubTemplate
            ? editing
              ? `${text} · als Vereinsvorlage freigegeben`
              : "Als Vereinsvorlage freigegeben"
            : `${text} · keine Vereinsvorlage mehr`;
    }
    if (role === "athlete" && result.shareWithTrainer && !editing?.sharedWithTrainer) {
      const shared = await shareOwnPlanWithTrainer(snapshot);
      text = shared.status === "success" ? `${text} und mit ${w.dat} geteilt` : `${text}. ${shared.message}`;
    }
    setWizard(null);
    setSelectedKey(editing?.key ?? planId);
    setToast(text);
    router.refresh();
  }

  /* ------------------------------ Ansicht ----------------------------- */

  const running = data?.sessions.filter((session) => session.status === "running") ?? [];
  const session = data?.sessions.find((entry) => entry.id === sessionId);
  const screen = tab !== "plaene" ? tab : mobileDetail && selected ? "detail" : "list";

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

  // Planstatus je Athlet und Trick für „Bereit für den Plan“: gespeicherter Plan
  // (Trainer) bzw. erhaltene Freigabe (Skater) der laufenden Session.
  const planStep: PlanStepLookup = (athleteUserId, trickId) => {
    if (!session || !athleteUserId) return null;
    const [kind, id] = [session.source_key.split(":")[0], session.source_key.slice(session.source_key.indexOf(":") + 1)];
    const plan =
      kind === "plan"
        ? plans.find((entry) => entry.savedPlanId === id)
        : plans.find((entry) => entry.startId === `shared-${id}` || entry.assignments.some((a) => a.shareId === `shared-${id}`));
    const assignment = plan?.assignments.find((entry) => entry.athleteId === athleteUserId);
    const step = assignment?.steps[trickId];
    return assignment && step !== undefined ? { step, shareId: assignment.shareId.replace(/^shared-/, "") } : null;
  };

  const toastView = toast ? (
    <div className={styles.toast} role="status" aria-live="polite">
      {toast}
    </div>
  ) : null;

  // Live-Training und Trainingsstart ersetzen die Übersicht vollständig.
  if (data && (session || sessionId || startPlan)) {
    return (
      <div className={`${styles.hub} ${styles.trainingScreen}`}>
        {session ? (
          <SessionView
            key={session.id}
            title={session.plan_snapshot.title}
            initialExercise={session.id === initialSessionId ? initialExercise : 0}
            session={session}
            ctx={{
              channel: training,
              planStep,
              notify: setToast,
              trainerNom: w.nom,
              people: data.people,
              onExit: () => {
                setStartPlan(null);
                openSession(null);
              },
              onReview: () => {
                openSession(null);
                switchTab("rueckblick");
              },
            }}
          />
        ) : startPlan ? (
          <>
            {statusBar}
            <StartTraining
              plan={startPlan.content}
              assigned={startPlan.assigned}
              data={data}
              blocked={training.blocked}
              run={training.run}
              cancel={() => setStartPlan(null)}
            />
          </>
        ) : (
          <>
            <button type="button" className={styles.back} onClick={() => openSession(null)}>
              <ChevronLeft size={18} aria-hidden="true" /> Pläne
            </button>
            <p className={styles.errorBox}>Dieses Training ist nicht verfügbar oder du hast keinen Zugriff mehr.</p>
          </>
        )}
        {toastView}
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
    <HubWordsContext.Provider value={w}>
    <div className={styles.hub} data-screen={screen}>
      <header className={styles.head}>
        <div>
          <span className={styles.kicker}>Training</span>
          <h1 className={styles.title}>Trainingspläne</h1>
        </div>
        <div className={styles.headActions}>
          {staff && context ? (
            <Button variant="secondary" size="lg" className={styles.desktopOnly} onClick={() => setRightsOpen(true)}>
              Wer darf erstellen?
            </Button>
          ) : null}
          {canCreate ? (
            <Button size="lg" className={styles.desktopOnly} onClick={() => setWizard({ edit: null })}>
              <Plus size={18} aria-hidden="true" /> Plan erstellen
            </Button>
          ) : role === "athlete" && data ? (
            <Button size="lg" className={styles.desktopOnly} onClick={() => reportShortcut()}>
              <ArrowUp size={18} aria-hidden="true" /> Trick melden
            </Button>
          ) : null}
        </div>
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
                groups={ctx.groups}
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
          persona={persona}
          editPlan={wizard.edit}
          startTemplate={wizard.template ?? null}
          startStep={wizard.step}
          athletes={wizardAthletes(data?.people ?? [], ctx)}
          groups={ctx.groups}
          clubs={ctx.clubs}
          templates={ctx.templates.filter((entry) => !entry.own)}
          hasTrainer={ctx.hasTrainer}
          busy={training.busy}
          onClose={() => setWizard(null)}
          onSubmit={(result) => void submitWizard(result)}
        />
      ) : null}

      {rightsOpen && staff ? (
        <PermissionsSheet
          context={permissionContext}
          board={persona === "board"}
          onToggle={(athlete, allowed) => void togglePermission(athlete.id, athlete.name, allowed)}
          onClose={() => setRightsOpen(false)}
        />
      ) : null}

      {askSalutation && !wizard && !sheet ? (
        <SalutationSheet
          role={role}
          onChoose={(value, label) => void chooseSalutation(value, label)}
          onLater={() => void chooseSalutation("d", null)}
        />
      ) : null}

      {sheet?.type === "report" ? (
        <ReportSheet
          trickName={sheet.trick.name}
          busy={busyKey === cellKey(sheet.assignment.shareId, sheet.trick.id)}
          onClose={() => setSheet(null)}
          onSubmit={(input) => submitReport(sheet.assignment, sheet.trick, input)}
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

      {toastView}
    </div>
    </HubWordsContext.Provider>
  );
}

/** Verbundene Athlet*innen plus (Vorstand) Vereinsathlet*innen, ohne Doppelungen. */
function wizardAthletes(people: { id: string; name: string }[], context: HubContext) {
  const map = new Map(people.map((person) => [person.id, person.name]));
  for (const athlete of context.athletes) if (!map.has(athlete.id)) map.set(athlete.id, athlete.name);
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/* ----------------------------- Listenkarten ----------------------------- */

function PlanCard({
  plan,
  role,
  groups,
  selected,
  onSelect,
}: {
  plan: HubPlan;
  role: HubRole;
  groups: HubGroup[];
  selected: boolean;
  onSelect: () => void;
}) {
  const w = useWords();
  const days = daysUntil(plan.deadline);
  const sub = planCardSub(plan, role, groups, w, days);

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
          {planBadges(plan, role).map((badge) => (
            <span key={badge.tone} className={`${styles.badge} ${styles[badgeTone[badge.tone]]}`}>
              {badge.label}
            </span>
          ))}
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

/** Untertitel der Plan-Karte je nach Rolle und Herkunft des Plans. */
function planCardSub(plan: HubPlan, role: HubRole, groups: HubGroup[], w: HubWords, days: number | null) {
  const count = plan.assignments.length;
  const athletes = `${count} ${count === 1 ? "Athlet" : "Athleten"}`;
  if (plan.kind === "template") return `Vereinsvorlage · ${plan.sourceLabel || "vom Vorstand"}`;
  if (role === "staff") {
    if (plan.kind === "athlete") return `Von ${shortName(plan.createdByAthlete)} erstellt · mit dir geteilt`;
    if (plan.clubAssigned) return `Alle Gruppen im Verein · ${athletes}`;
    const groupNames = plan.groupIds.flatMap((id) => groups.filter((group) => group.id === id).map((group) => group.name));
    if (groupNames.length) return `${groupNames.join(", ")} · ${athletes}`;
    if (count === 1) return `Individuell · ${shortName(plan.assignments[0].athleteName)}`;
    if (count) return athletes;
    if (plan.isTemplate) return "Vereinsvorlage";
    return plan.isDraft ? "Noch nicht zugewiesen" : "Eigener Plan";
  }
  if (plan.kind === "received") {
    return `Von ${plan.sourceLabel || w.dat}${days !== null && days >= 0 ? ` · Frist ${inDays(days)}` : ""}`;
  }
  return plan.sharedWithTrainer ? `Von dir erstellt · geteilt mit ${w.dat}` : "Von dir erstellt · nur für dich";
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
  const mine = plans.flatMap((plan) => {
    const assignment = myAssignment(plan);
    return assignment ? [{ plan, assignment }] : [];
  });
  if (!mine.length) return null;
  let confirmed = 0;
  let waiting = 0;
  let total = 0;
  for (const { plan, assignment } of mine) {
    for (const trick of plan.tricks) {
      const step = assignment.steps[trick.id] ?? 0;
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
  const w = useWords();
  const next = nextStepFor(plans);
  if (!next) return null;
  const { plan, trick, step } = next;
  const assignment = myAssignment(plan)!;
  return (
    <section className={styles.nextCard}>
      <span className={styles.nowKicker}>Dein nächster Schritt</span>
      <h2>
        {trick.name} {step === 1 ? "melden" : "üben"}
      </h2>
      <p>{step === 1 ? `Geübt ✓ – zeig ${w.dat} ein Video` : trick.goal ? `Ziel: ${trick.goal}` : plan.title}</p>
      {step === 1 ? (
        <Button onClick={() => actions.openReport(plan, assignment, trick)}>Jetzt melden →</Button>
      ) : (
        <Button onClick={() => onOpen(plan.key)}>Zum Pfad →</Button>
      )}
    </section>
  );
}
