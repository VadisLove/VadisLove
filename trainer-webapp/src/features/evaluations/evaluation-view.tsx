"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  Download,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";
import {
  createPersonalGoal,
  saveAthleteEvaluation,
  setPersonalGoalCompleted,
  type EvaluationActionResult,
} from "@/app/auswertung/actions";
import { updateSharedTrickProgress } from "@/app/trainingsplaene/actions";
import { Button } from "@/components/ui/button";
import type {
  EvaluationContestOverride,
  EvaluationDashboardData,
  EvaluationSkillCategory,
  EvaluationSkillRating,
} from "@/domain/models";
import {
  calculateMetrics,
  currentYearStart,
  evaluationDate,
  formatAverage,
  formatDate,
  formatShortDate,
  matchingEvaluation,
  participantStatus,
  previousEvaluation,
  ratingDelta,
  skillCategories,
  skillCategoryMeta,
  summarizeCategory,
  todayIso,
  withinPeriod,
  athleteTrickGoals,
  type AthleteMetrics,
  type Delta,
  type TrickGoal,
} from "./evaluation-model";
import styles from "./evaluation-view.module.css";

type ViewMode = "single" | "compare";
type SortMetric = "overall" | "attendance" | "contests" | "tasks" | "skills";
type MobileTab = EvaluationSkillCategory | "goals" | "summary";
type TrickFilter = "all" | "open" | "waiting" | "done";

interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: { transcript: string } }>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

function csvCell(value: string | number) {
  const stringValue = String(value).replaceAll('"', '""');
  return `"${stringValue}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = `﻿${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Browser-Spracherkennung ohne externen API-Schluessel; haengt Diktat an den Text an. */
function useSpeechInput(value: string, onChange: (value: string) => void) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [onChange, value]);

  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const instance = new Recognition();
    instance.lang = "de-DE";
    instance.interimResults = false;
    instance.continuous = true;
    instance.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ").trim();
      const currentValue = valueRef.current;
      if (transcript) onChangeRef.current(`${currentValue}${currentValue.trim() ? " " : ""}${transcript}`);
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => setListening(false);
    recognitionRef.current = instance;
    return () => {
      // Einige Browser werfen beim Stoppen einer noch nicht gestarteten Erkennung.
      try { instance.stop(); } catch { /* Die Erkennung ist bereits beendet. */ }
    };
  }, []);

  const toggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) recognition.stop();
    else {
      setListening(true);
      recognition.start();
    }
  };

  return { listening, toggle };
}

function MicButton({ listening, onClick, disabled }: { listening: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={listening ? styles.micOn : styles.mic}
      onClick={onClick}
      disabled={disabled}
      title="Per Browser-Spracherkennung diktieren"
      aria-label={listening ? "Diktat beenden" : "Diktat starten"}
    >
      {listening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  );
}

/** Textfeld mit Diktier-Button (Bemerkung, Maßnahmen). */
function SpeechTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  disabled?: boolean;
  label: string;
}) {
  const speech = useSpeechInput(value, onChange);
  return (
    <div className={styles.speechField}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} disabled={disabled} aria-label={label} />
      <MicButton listening={speech.listening} onClick={speech.toggle} disabled={disabled} />
    </div>
  );
}

/** Aufgeklappte Kriteriums-Notiz: Textarea, Diktieren, „Fertig“. */
function NoteEditor({ value, onChange, onDone, label }: { value: string; onChange: (value: string) => void; onDone: () => void; label: string }) {
  const speech = useSpeechInput(value, onChange);
  return (
    <div className={styles.noteEditor}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Beobachtung oder Entwicklung festhalten …"
        rows={2}
        autoFocus
        aria-label={`Notiz zu ${label}`}
        onKeyDown={(event) => { if (event.key === "Escape") onDone(); }}
      />
      <MicButton listening={speech.listening} onClick={speech.toggle} />
      <button type="button" className={styles.doneButton} onClick={onDone}>Fertig</button>
    </div>
  );
}

function DeltaPill({ delta }: { delta: Delta }) {
  return <span className={styles.delta} data-tone={delta.tone}>{delta.label}</span>;
}

/** Bottom-Sheet auf dem Handy, rechte Seitenleiste auf dem Desktop. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className={styles.sheetHead}>
          <h2>{title}</h2>
          <button type="button" className={styles.iconButton} aria-label="Schließen" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

const trickMarks: Record<TrickGoal["state"], ReactNode> = {
  open: <Circle size={14} aria-hidden="true" />,
  practicing: <CircleDot size={14} aria-hidden="true" />,
  waiting: <Clock3 size={14} aria-hidden="true" />,
  done: <Check size={14} aria-hidden="true" />,
};

const trickStateLabels: Record<TrickGoal["state"], string> = {
  open: "offen",
  practicing: "wird geübt",
  waiting: "wartet auf Bestätigung",
  done: "erreicht",
};

interface FormSnapshot {
  title: string;
  conversationOn: string;
  squad: string;
  dalidStatus: string;
  personalNotes: string;
  measures: string;
  ratings: Record<string, EvaluationSkillRating>;
  contestOverrides: Record<string, EvaluationContestOverride>;
}

function snapshotFor(data: EvaluationDashboardData, athleteId: string, from: string, to: string): FormSnapshot {
  const evaluation = matchingEvaluation(data.evaluations, athleteId, from, to);
  return {
    title: evaluation?.title || `Auswertung ${from} bis ${to}`,
    conversationOn: evaluation?.conversationOn || "",
    squad: evaluation?.squad || "",
    dalidStatus: evaluation?.dalidStatus || "",
    personalNotes: evaluation?.personalNotes || "",
    measures: evaluation?.measures || "",
    ratings: Object.fromEntries((evaluation?.skillRatings || []).map((rating) => [rating.skillKey, rating])),
    contestOverrides: Object.fromEntries((evaluation?.contestOverrides || []).map((override) => [override.eventId, override])),
  };
}

/** Vergleichbare Form: leere Notizen ohne Bewertung zählen nicht als Änderung. */
function serialize(form: FormSnapshot) {
  const ratings = Object.values(form.ratings)
    .filter((rating) => rating.rating || rating.note.trim())
    .map((rating) => [rating.skillKey, rating.rating || 0, rating.note.trim()])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const contests = Object.values(form.contestOverrides)
    .map((override) => [override.eventId, override.excluded, override.category, override.placement, override.note])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return JSON.stringify([form.title, form.conversationOn, form.squad, form.dalidStatus, form.personalNotes, form.measures, ratings, contests]);
}

const discardMessage = "Es gibt ungespeicherte Änderungen an dieser Auswertung. Trotzdem fortfahren und die Änderungen verwerfen?";

export function EvaluationView({ initialData }: { initialData: EvaluationDashboardData }) {
  const router = useRouter();
  const initialFrom = currentYearStart();
  const initialTo = todayIso();
  const initialAthleteId = initialData.athletes[0]?.id || "";
  const [mode, setMode] = useState<ViewMode>("single");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [athleteId, setAthleteId] = useState(initialAthleteId);
  const [sortMetric, setSortMetric] = useState<SortMetric>("overall");
  const [form, setForm] = useState<FormSnapshot>(() => snapshotFor(initialData, initialAthleteId, initialFrom, initialTo));
  const [baseline, setBaseline] = useState(() => serialize(snapshotFor(initialData, initialAthleteId, initialFrom, initialTo)));
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("skateboarding");
  const [trickFilter, setTrickFilter] = useState<TrickFilter>("all");
  const [confirmedTricks, setConfirmedTricks] = useState<Record<string, true>>({});
  const [busyTrick, setBusyTrick] = useState("");
  const [sheet, setSheet] = useState<"contests" | "details" | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const [result, setResult] = useState<EvaluationActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const canManage = initialData.canManage;

  const { title, conversationOn, squad, dalidStatus, personalNotes, measures, ratings, contestOverrides } = form;
  const dirty = canManage && serialize(form) !== baseline;
  const patchForm = (patch: Partial<FormSnapshot>) => setForm((current) => ({ ...current, ...patch }));

  const athlete = initialData.athletes.find((entry) => entry.id === athleteId);
  const evaluation = useMemo(
    () => matchingEvaluation(initialData.evaluations, athleteId, from, to),
    [athleteId, from, initialData.evaluations, to],
  );
  const previous = useMemo(
    () => previousEvaluation(initialData.evaluations, athleteId, from, to),
    [athleteId, from, initialData.evaluations, to],
  );
  const previousRatings = useMemo(
    () => Object.fromEntries((previous?.skillRatings || []).map((rating) => [rating.skillKey, rating.rating])) as Record<string, number>,
    [previous],
  );
  const previousDate = previous ? evaluationDate(previous) : "";

  /* ---------------- Ungespeicherte Änderungen absichern ---------------- */

  const confirmDiscard = useCallback(() => !dirty || window.confirm(discardMessage), [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    // App-interne Links laufen ohne Seitenwechsel; sie werden hier vorab abgefangen.
    const guardLinks = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      if (!window.confirm(discardMessage)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [dirty]);

  const loadContext = (nextAthleteId: string, nextFrom: string, nextTo: string) => {
    const next = snapshotFor(initialData, nextAthleteId, nextFrom, nextTo);
    setForm(next);
    setBaseline(serialize(next));
    setOpenNote(null);
    setResult(null);
  };

  const changeAthlete = (nextAthleteId: string) => {
    if (nextAthleteId === athleteId || !confirmDiscard()) return;
    setAthleteId(nextAthleteId);
    loadContext(nextAthleteId, from, to);
  };

  const changePeriod = (nextFrom: string, nextTo: string) => {
    if (!nextFrom || !nextTo || !confirmDiscard()) return;
    setFrom(nextFrom);
    setTo(nextTo);
    loadContext(athleteId, nextFrom, nextTo);
  };

  /* ---------------------------- Kennzahlen ---------------------------- */

  const trickGoals = useMemo(
    () => athleteTrickGoals(initialData.plans, athleteId).map((goal) => (
      confirmedTricks[goal.id] ? { ...goal, state: "done" as const, done: true } : goal
    )),
    [athleteId, confirmedTricks, initialData.plans],
  );
  const trickDone = trickGoals.filter((goal) => goal.done).length;
  const trickWaiting = trickGoals.filter((goal) => goal.state === "waiting").length;
  const visibleTricks = trickGoals.filter((goal) => (
    trickFilter === "all"
    || (trickFilter === "done" ? goal.done : trickFilter === "waiting" ? goal.state === "waiting" : !goal.done)
  ));
  const personalGoals = initialData.personalGoals.filter((goal) => goal.athleteId === athleteId);
  const automaticContests = initialData.events.filter((event) => (
    event.type === "contest"
    && withinPeriod(event, from, to)
    && participantStatus(event, athleteId) === "confirmed"
  ));
  const visibleContests = automaticContests.filter((event) => !contestOverrides[event.id]?.excluded);
  const hiddenContests = automaticContests.filter((event) => contestOverrides[event.id]?.excluded);
  const ratedEntries = Object.values(ratings).filter((rating) => rating.rating >= 1);
  const selectedMetrics = athlete
    ? calculateMetrics({ athlete, events: initialData.events, plans: initialData.plans, evaluations: [{
      id: evaluation?.id || "draft", trainerId: evaluation?.trainerId || initialData.currentUserId, athleteId, periodStart: from, periodEnd: to,
      title, conversationOn, squad, dalidStatus, personalNotes, measures,
      skillRatings: ratedEntries, contestOverrides: Object.values(contestOverrides),
    }], from, to, weights: initialData.weights })
    : null;

  const summaries = skillCategories
    .map((category) => summarizeCategory(category, initialData.skills, ratings, previousRatings))
    .filter((summary) => summary.total > 0);
  const totalSkills = summaries.reduce((sum, summary) => sum + summary.total, 0);
  const ratedSkills = summaries.reduce((sum, summary) => sum + summary.rated, 0);

  const comparison = useMemo(() => {
    const metricKey: Record<SortMetric, keyof AthleteMetrics> = {
      overall: "overall",
      attendance: "attendance",
      contests: "contestScore",
      tasks: "taskScore",
      skills: "skillScore",
    };
    return initialData.athletes
      .map((entry) => calculateMetrics({
        athlete: entry,
        events: initialData.events,
        plans: initialData.plans,
        evaluations: initialData.evaluations,
        from,
        to,
        weights: initialData.weights,
      }))
      .sort((left, right) => Number(right[metricKey[sortMetric]]) - Number(left[metricKey[sortMetric]]));
  }, [from, initialData, sortMetric, to]);

  /* ----------------------------- Aktionen ----------------------------- */

  const setRating = (skillKey: string, score: number) => {
    setForm((current) => {
      const existing = current.ratings[skillKey];
      // Erneuter Klick auf den gewählten Wert setzt die Bewertung zurück (Notiz bleibt).
      const rating = existing?.rating === score ? 0 : score;
      return { ...current, ratings: { ...current.ratings, [skillKey]: { skillKey, rating, note: existing?.note || "" } } };
    });
  };

  const setNote = (skillKey: string, note: string) => {
    setForm((current) => ({
      ...current,
      ratings: { ...current.ratings, [skillKey]: { skillKey, rating: current.ratings[skillKey]?.rating || 0, note } },
    }));
  };

  const updateContest = (eventId: string, patch: Partial<EvaluationContestOverride>) => {
    setForm((current) => ({
      ...current,
      contestOverrides: {
        ...current.contestOverrides,
        [eventId]: {
          eventId,
          excluded: current.contestOverrides[eventId]?.excluded || false,
          category: current.contestOverrides[eventId]?.category || "Street",
          placement: current.contestOverrides[eventId]?.placement || null,
          note: current.contestOverrides[eventId]?.note || "",
          ...patch,
        },
      },
    }));
  };

  const save = () => {
    if (!athleteId || !canManage) return;
    const unratedNotes = initialData.skills.filter((skill) => ratings[skill.key]?.note.trim() && !ratings[skill.key]?.rating);
    if (unratedNotes.length) {
      setResult({ status: "error", message: `Notiz ohne Bewertung: ${unratedNotes.map((skill) => skill.label).join(", ")}. Bitte bewerten oder Notiz leeren.` });
      return;
    }
    const submitted = form;
    startTransition(async () => {
      const response = await saveAthleteEvaluation({
        athleteId, periodStart: from, periodEnd: to, title, conversationOn, squad,
        dalidStatus, personalNotes, measures,
        skillRatings: ratedEntries,
        contestOverrides: Object.values(contestOverrides),
      });
      setResult(response);
      if (response.status === "success") {
        setBaseline(serialize(submitted));
        router.refresh();
      }
    });
  };

  const addGoal = () => {
    if (!newGoal.trim() || !athleteId) return;
    startTransition(async () => {
      const response = await createPersonalGoal(athleteId, newGoal);
      setResult(response);
      if (response.status === "success") {
        setNewGoal("");
        router.refresh();
      }
    });
  };

  const toggleGoal = (goalId: string, completed: boolean) => {
    startTransition(async () => {
      const response = await setPersonalGoalCompleted(goalId, completed);
      setResult(response);
      if (response.status === "success") router.refresh();
    });
  };

  /** Gemeldeten Trick bestätigen – dieselbe Datenbankfunktion wie im Trainingsplan (inkl. XP). */
  const confirmTrick = (goal: TrickGoal) => {
    if (!goal.trickId || busyTrick) return;
    setBusyTrick(goal.id);
    startTransition(async () => {
      try {
        const response = await updateSharedTrickProgress({ planId: goal.planId, trickId: goal.trickId!, status: "confirmed" });
        setResult({ status: response.status, message: response.status === "success" ? `„${goal.title}“ bestätigt.` : response.message });
        if (response.status === "success") {
          setConfirmedTricks((current) => ({ ...current, [goal.id]: true }));
          router.refresh();
        }
      } catch {
        setResult({ status: "error", message: "Nicht gespeichert. Bitte erneut versuchen." });
      } finally {
        setBusyTrick("");
      }
    });
  };

  const exportSingle = () => {
    if (!athlete || !selectedMetrics) return;
    const rows: Array<Array<string | number>> = [
      ["Athlet", athlete.name], ["Zeitraum", `${from} bis ${to}`], ["Kader", squad],
      ["Trainingsanwesenheit", `${selectedMetrics.attended}/${selectedMetrics.invitedTrainings} (${selectedMetrics.attendance} %)`],
      [], ["Contests", "Datum", "Kategorie", "Platzierung", "Bemerkung"],
      ...visibleContests.map((contest) => [contest.title, contest.date, contestOverrides[contest.id]?.category || "Street", contestOverrides[contest.id]?.placement || "", contestOverrides[contest.id]?.note || ""]),
      [], ["Skill", "Bewertung 1–5", "Vorwert", "Bemerkung"],
      ...initialData.skills.filter((skill) => skill.visible).map((skill) => [skill.label, ratings[skill.key]?.rating || "", previousRatings[skill.key] || "", ratings[skill.key]?.note || ""]),
      [], ["Aufgabe / Trickziel", "Quelle", "Status"],
      ...trickGoals.map((goal) => [goal.title, goal.planTitle, trickStateLabels[goal.state]]),
      [], ["Persönliche Bemerkung", personalNotes], ["Maßnahmen", measures],
    ];
    downloadCsv(`auswertung-${athlete.name.toLowerCase().replaceAll(" ", "-")}-${to}.csv`, rows);
  };

  const exportComparison = () => downloadCsv(`fahrer-vergleich-${from}-${to}.csv`, [
    ["Rang", "Athlet", "Overall", "Anwesenheit", "Contest-Score", "Aufgaben", "Skills"],
    ...comparison.map((entry, index) => [index + 1, entry.athlete.name, entry.overall, entry.attendance, entry.contestScore, entry.taskScore, entry.skillScore]),
  ]);

  if (!initialData.currentUserId) {
    return <div className={styles.page}><div className={styles.emptyState}><Trophy size={28} /><h1>Bitte anmelden</h1><p>Auswertungen sind nur für angemeldete Konten verfügbar.</p></div></div>;
  }

  if (initialData.athletes.length === 0) {
    return (
      <div className={styles.page}>
        <header className={styles.head}><div><span className={styles.kicker}>Athleten</span><h1 className={styles.title}>Auswertung</h1></div></header>
        <div className={styles.emptyState}><UsersRound size={30} /><h2>Noch keine verbundenen Athleten</h2><p>Bestätige zuerst eine Trainer–Athlet-Verbindung im Personen-Tab.</p></div>
      </div>
    );
  }

  const periodLabel = `${formatDate(from)} – ${formatDate(to)}`;
  const periodShort = `${formatShortDate(from)} – ${formatShortDate(to)}${to.slice(2, 4)}`;
  const statusLine = athlete ? [squad ? `Kader ${squad}` : "", athlete.region, conversationOn ? `Gespräch am ${formatDate(conversationOn)}` : ""].filter(Boolean).join(" · ") : "";
  const mobileLine = [squad, athlete?.region, dalidStatus].filter(Boolean).join(" · ");

  const modeSwitch = (
    <div className={styles.segmented} role="tablist" aria-label="Ansicht">
      <button type="button" role="tab" aria-selected={mode === "single"} onClick={() => setMode("single")}>Einzelauswertung</button>
      <button type="button" role="tab" aria-selected={mode === "compare"} onClick={() => setMode("compare")}>Fahrervergleich</button>
    </div>
  );

  const periodPicker = (
    <div className={styles.periodWrap}>
      <button type="button" className={styles.periodButton} aria-expanded={periodOpen} onClick={() => setPeriodOpen((open) => !open)}>
        <CalendarRange size={16} aria-hidden="true" />
        <span className={styles.periodLong}>{periodLabel}</span>
        <span className={styles.periodShort}>{periodShort}</span>
      </button>
      {periodOpen ? (
        <div className={styles.periodPopover} role="dialog" aria-label="Zeitraum wählen">
          <label>Von<input type="date" value={from} max={to} onChange={(event) => changePeriod(event.target.value, to)} /></label>
          <label>Bis<input type="date" value={to} min={from} onChange={(event) => changePeriod(from, event.target.value)} /></label>
          <button type="button" className={styles.doneButton} onClick={() => setPeriodOpen(false)}>Fertig</button>
        </div>
      ) : null}
    </div>
  );

  const resultMessage = result ? (
    <p className={result.status === "error" ? styles.error : styles.success} role="status" aria-live="polite">{result.message}</p>
  ) : null;

  return (
    <div className={styles.page} data-mode={mode} data-tab={mobileTab}>
      <header className={styles.head}>
        <div>
          <span className={styles.kicker}>Athleten</span>
          <h1 className={styles.title}>Auswertung</h1>
        </div>
        <div className={styles.headActions}>
          <span className={styles.desktopOnly}>{modeSwitch}</span>
          {periodPicker}
          <button
            type="button"
            className={`${styles.iconButton} ${styles.mobileOnly}`}
            onClick={() => setMode(mode === "single" ? "compare" : "single")}
            aria-label={mode === "single" ? "Zum Fahrervergleich" : "Zur Einzelauswertung"}
            title={mode === "single" ? "Fahrervergleich" : "Einzelauswertung"}
          >
            <ArrowLeftRight size={18} />
          </button>
          {mode === "single" ? (
            <>
              <Button variant="secondary" className={`${styles.headButton} ${styles.desktopOnly}`} onClick={exportSingle}><Download size={16} aria-hidden="true" /> CSV</Button>
              {canManage ? (
                <Button className={`${styles.headButton} ${styles.desktopOnly}`} onClick={save} disabled={pending}>
                  {pending ? "Speichert …" : dirty ? "Auswertung speichern •" : "Auswertung speichern"}
                </Button>
              ) : null}
            </>
          ) : (
            <Button variant="secondary" className={styles.headButton} onClick={exportComparison}><Download size={16} aria-hidden="true" /> CSV</Button>
          )}
        </div>
      </header>

      {mode === "single" && result ? <div className={styles.desktopOnly}>{resultMessage}</div> : null}

      {mode === "compare" ? (
        <section className={styles.card}>
          <header className={styles.cardHead}>
            <div className={styles.cardTitle}>Fahrer im direkten Vergleich <span>· {comparison.length}</span></div>
            <label className={styles.sortField}>Sortieren nach
              <select value={sortMetric} onChange={(event) => setSortMetric(event.target.value as SortMetric)}>
                <option value="overall">Overall</option><option value="attendance">Trainingsbesuche</option><option value="contests">Contest-Erfolge</option><option value="tasks">Aufgaben</option><option value="skills">Skills</option>
              </select>
            </label>
          </header>
          <div className={styles.weightRail}>
            <span>Anwesenheit <strong>{initialData.weights.attendance} %</strong></span><span>Contests <strong>{initialData.weights.contests} %</strong></span><span>Aufgaben <strong>{initialData.weights.tasks} %</strong></span><span>Skills <strong>{initialData.weights.skills} %</strong></span>
          </div>
          <div className={styles.rankingTable} role="table" aria-label="Fahrerrangliste">
            <div className={styles.rankingHead} role="row"><span>Rang / Fahrer</span><span>Overall</span><span>Anwesenheit</span><span>Contests</span><span>Aufgaben</span><span>Skills</span></div>
            {comparison.map((entry, index) => (
              <div className={styles.rankingRow} role="row" key={entry.athlete.id}>
                <span className={styles.riderCell}><b>{index + 1}</b><i>{entry.athlete.initials}</i><span><strong>{entry.athlete.name}</strong><small>{entry.athlete.region}</small></span></span>
                <span className={styles.overallScore}>{entry.overall}</span>
                <span>{entry.attendance} %<small>{entry.attended}/{entry.invitedTrainings} Trainings</small></span>
                <span>{entry.contestScore}<small>{entry.contestCount} Contests</small></span>
                <span>{entry.taskScore} %<small>{entry.taskCompleted}/{entry.taskTotal} erledigt</small></span>
                <span>{entry.skillScore} %<small>Trainerbewertung</small></span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <>
          <div className={styles.stickyHead}>
            <section className={styles.athleteStrip} aria-label="Athlet und Kennzahlen">
              <div className={styles.athleteMain}>
                <span className={styles.avatar} aria-hidden="true">{athlete?.initials}</span>
                <div className={styles.athleteText}>
                  <label className={styles.athleteSelect}>
                    <span className="sr-only">Athlet wählen</span>
                    <select value={athleteId} onChange={(event) => changeAthlete(event.target.value)}>
                      {initialData.athletes.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
                    </select>
                    <strong>{athlete?.name}</strong>
                    <ChevronDown size={16} aria-hidden="true" />
                  </label>
                  <small className={styles.desktopMeta}>{statusLine || "Kader und Gespräch noch nicht erfasst"}</small>
                  <small className={styles.mobileMeta}>{mobileLine || "Kader & Status offen"}</small>
                </div>
                <button type="button" className={`${styles.stripIcon} ${styles.mobileOnly}`} onClick={() => setSheet("details")} aria-label="Kader, Gespräch und Status bearbeiten">
                  <SlidersHorizontal size={18} />
                </button>
              </div>
              <div className={styles.kpis}>
                <div><strong>{selectedMetrics?.attendance || 0} %</strong><span><span className={styles.desktopInline}>Anwesenheit</span><span className={styles.mobileInline}>Anwesend</span></span></div>
                <button type="button" onClick={() => setSheet("contests")} aria-label={`${selectedMetrics?.contestCount || 0} Contests anzeigen`}>
                  <strong>{selectedMetrics?.contestCount || 0} <ChevronRight size={15} className={styles.kpiChevron} aria-hidden="true" /></strong><span>Contests</span>
                </button>
                <div><strong>{trickDone}/{trickGoals.length}</strong><span><span className={styles.desktopInline}>Trickziele</span><span className={styles.mobileInline}>Ziele</span></span></div>
                <div><strong>{selectedMetrics?.overall || 0}</strong><span>Score</span></div>
              </div>
              <button type="button" className={`${styles.statusButton} ${styles.desktopOnly}`} onClick={() => setSheet("details")}>
                Status: {dalidStatus || "offen"} <ChevronDown size={15} aria-hidden="true" />
              </button>
            </section>

            <nav className={`${styles.tabs} ${styles.mobileOnly}`} role="tablist" aria-label="Bereiche">
              {[
                ...summaries.map((summary) => ({ id: summary.category as MobileTab, label: skillCategoryMeta[summary.category].short, count: `${summary.rated}/${summary.total}` })),
                { id: "goals" as MobileTab, label: "Ziele", count: `${trickDone}/${trickGoals.length}` },
                { id: "summary" as MobileTab, label: "Abschluss", count: "" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab.id}
                  onClick={() => { setMobileTab(tab.id); setOpenNote(null); }}
                >
                  {tab.label}{tab.count ? <span>{tab.count}</span> : null}
                </button>
              ))}
            </nav>
          </div>

          <div className={styles.layout}>
            <div className={styles.mainColumn}>
              <section className={`${styles.card} ${styles.ratingCard}`} aria-label="Bewertung">
                <header className={`${styles.cardHead} ${styles.desktopFlex}`}>
                  <div className={styles.cardTitle}>Bewertung <span>· {ratedSkills}/{totalSkills}</span></div>
                  <div className={styles.legend}>
                    {previous ? <><span className={styles.legendSwatch} aria-hidden="true" />letzte Auswertung {formatDate(previousDate)}</> : "Noch keine frühere Auswertung"}
                  </div>
                </header>
                <div className={`${styles.columns} ${styles.desktopGrid}`} aria-hidden="true"><span>Kriterium</span><span>1 · 2 · 3 · 4 · 5</span><span>Δ</span><span>Notiz</span></div>

                {summaries.map((summary) => {
                  const meta = skillCategoryMeta[summary.category];
                  return (
                    <div key={summary.category} className={styles.group} data-panel={summary.category}>
                      <div className={`${styles.groupHead} ${styles.desktopFlex}`}>
                        <span><b>{meta.number}</b>{meta.title}</span>
                        <span>Ø {formatAverage(summary.average)} {previous ? <em>· zuvor {formatAverage(summary.previousAverage)}</em> : null}</span>
                      </div>
                      {summary.skills.map((skill) => {
                        const current = ratings[skill.key];
                        const previousValue = previousRatings[skill.key];
                        const note = current?.note || "";
                        const isOpen = openNote === skill.key;
                        return (
                          <div className={styles.row} key={skill.key}>
                            <div className={styles.rowGrid}>
                              <span className={styles.criterion}>{skill.label}</span>
                              <span className={styles.scale} role="radiogroup" aria-label={`${skill.label} bewerten`}>
                                {[1, 2, 3, 4, 5].map((score) => {
                                  const selected = current?.rating === score;
                                  const last = previousValue === score;
                                  return (
                                    <button
                                      type="button"
                                      key={score}
                                      role="radio"
                                      aria-checked={selected}
                                      aria-label={`${score}${last ? ", Wert der letzten Auswertung" : ""}`}
                                      data-state={selected ? "selected" : last ? "last" : undefined}
                                      onClick={() => setRating(skill.key, score)}
                                      disabled={!canManage}
                                    >
                                      {score}
                                    </button>
                                  );
                                })}
                              </span>
                              <DeltaPill delta={ratingDelta(current?.rating || undefined, previousValue)} />
                              <button
                                type="button"
                                className={styles.noteTrigger}
                                data-filled={note ? "true" : undefined}
                                aria-expanded={isOpen}
                                onClick={() => setOpenNote(isOpen ? null : skill.key)}
                                disabled={!canManage && !note}
                                title={note || undefined}
                              >
                                {note ? `✎ ${note}` : "+ Notiz"}
                              </button>
                            </div>
                            {isOpen ? (
                              canManage
                                ? <NoteEditor value={note} onChange={(value) => setNote(skill.key, value)} onDone={() => setOpenNote(null)} label={skill.label} />
                                : <p className={styles.noteReadOnly}>{note}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </section>

              <section className={`${styles.card} ${styles.trickCard}`} data-panel="goals" aria-label="Trickziele">
                <header className={styles.trickHead}>
                  <div className={styles.cardTitle}>Trickziele aus Trainingsplänen <span>· {trickDone}/{trickGoals.length} erreicht</span></div>
                  <div className={styles.filter} role="tablist" aria-label="Trickziele filtern">
                    {([
                      ["all", "Alle"],
                      ["open", "Offen"],
                      ...(trickWaiting ? [["waiting", `Zu bestätigen · ${trickWaiting}`]] : []),
                      ["done", "Erreicht"],
                    ] as Array<[TrickFilter, string]>).map(([id, label]) => (
                      <button key={id} type="button" role="tab" aria-selected={trickFilter === id} onClick={() => setTrickFilter(id)}>{label}</button>
                    ))}
                  </div>
                </header>
                {trickGoals.length ? (
                  <div className={styles.chips}>
                    {visibleTricks.map((goal) => {
                      const tip = `${goal.planTitle} · ${trickStateLabels[goal.state]}`;
                      const content = <><span className={styles.chipMark}>{trickMarks[goal.state]}</span>{goal.title}</>;
                      if (goal.state === "waiting" && canManage && goal.trickId) {
                        return (
                          <button key={goal.id} type="button" className={styles.chip} data-state={goal.state} onClick={() => confirmTrick(goal)} disabled={busyTrick === goal.id} title={`${tip} – Klick bestätigt`}>
                            {content}<span className={styles.chipAction}>{busyTrick === goal.id ? "…" : "bestätigen"}</span>
                          </button>
                        );
                      }
                      return (
                        <Link key={goal.id} className={styles.chip} data-state={goal.state} href={`/trainingsplaene?tab=fortschritt&plan=${encodeURIComponent(goal.planId)}`} title={`${tip} – im Trainingsplan öffnen`}>
                          {content}
                        </Link>
                      );
                    })}
                    {!visibleTricks.length ? <p className={styles.inlineEmpty}>Keine Trickziele in diesem Filter.</p> : null}
                  </div>
                ) : (
                  <p className={styles.inlineEmpty}>Noch keine Übungen aus Trainingsplänen zugewiesen. <Link href="/trainingsplaene">Plan zuweisen</Link></p>
                )}
                <p className={styles.hint}>
                  Status kommt live aus den Trainingsplänen. Gemeldete Tricks lassen sich hier direkt bestätigen, alle anderen öffnen den Plan.
                </p>
              </section>
            </div>

            <aside className={styles.sideColumn}>
              <section className={`${styles.card} ${styles.sideCard}`} data-panel="summary" aria-label="Entwicklung">
                <div className={styles.cardTitle}>{previous ? `Entwicklung seit ${formatShortDate(previousDate)}` : "Entwicklung"}</div>
                {summaries.map((summary) => (
                  <div className={styles.devRow} key={summary.category}>
                    <div className={styles.devLabel}>
                      <span>{skillCategoryMeta[summary.category].short} <em>{summary.rated}/{summary.total}</em></span>
                      <strong data-tone={summary.delta?.tone || "open"}>{formatAverage(summary.average)} {summary.delta && summary.delta.tone !== "same" ? summary.delta.label : summary.delta ? "=" : ""}</strong>
                    </div>
                    <div className={styles.devBar}>
                      <span style={{ width: `${((summary.average || 0) / 5) * 100}%` }} />
                      {summary.comparableAverage !== null ? <i style={{ left: `${(summary.comparableAverage / 5) * 100}%` }} /> : null}
                    </div>
                  </div>
                ))}
                <p className={styles.hint}>{previous ? "Balken = jetzt · Strich = letzte Auswertung" : "Nach der nächsten Auswertung erscheint hier der Vergleich."}</p>
              </section>

              <section className={`${styles.card} ${styles.sideCard}`} data-panel="summary" aria-label="Bemerkung und Maßnahmen">
                <div className={styles.fieldTitle}>Persönliche Bemerkung</div>
                <SpeechTextarea label="Persönliche Bemerkung" value={personalNotes} onChange={(value) => patchForm({ personalNotes: value })} placeholder="Gespräch, Umfeld, Entwicklung, nächste Schritte …" disabled={!canManage} />
                <div className={styles.fieldTitle}>Maßnahmen</div>
                <SpeechTextarea label="Maßnahmen" value={measures} onChange={(value) => patchForm({ measures: value })} placeholder="Vereinbarte Maßnahmen, Physio, Trainingsschwerpunkte …" disabled={!canManage} />
              </section>

              <section className={`${styles.card} ${styles.sideCard}`} data-panel="goals" aria-label="Persönliche Ziele">
                <div className={styles.fieldTitle}>Persönliche Ziele</div>
                {personalGoals.map((goal) => (
                  <button type="button" key={goal.id} className={styles.goalRow} data-done={goal.completed ? "true" : undefined} onClick={() => toggleGoal(goal.id, !goal.completed)} disabled={pending} aria-pressed={goal.completed}>
                    <span className={styles.goalCheck} aria-hidden="true">{goal.completed ? <Check size={13} /> : null}</span>
                    <span className={styles.goalTitle}>{goal.title}</span>
                    <small>{goal.completed ? "erreicht" : "in Arbeit"}</small>
                  </button>
                ))}
                {!personalGoals.length ? <p className={styles.hint}>Noch keine persönlichen Ziele.</p> : null}
                <div className={styles.addGoal}>
                  <input value={newGoal} onChange={(event) => setNewGoal(event.target.value)} placeholder="Neues persönliches Ziel" aria-label="Neues persönliches Ziel" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGoal(); } }} />
                  <button type="button" className={styles.softButton} onClick={addGoal} disabled={pending || !newGoal.trim()}><Plus size={15} aria-hidden="true" /> Hinzufügen</button>
                </div>
              </section>
            </aside>
          </div>

          <footer className={styles.mobileFooter}>
            <div className={styles.progress}>
              <span>{ratedSkills}/{totalSkills} bewertet{dirty ? " · ungespeichert" : ""}</span>
              <div><span style={{ width: `${totalSkills ? (ratedSkills / totalSkills) * 100 : 0}%` }} /></div>
            </div>
            {canManage ? <Button className={styles.footerSave} onClick={save} disabled={pending}>{pending ? "Speichert …" : "Speichern"}</Button> : null}
            {result ? <div className={styles.footerMessage}>{resultMessage}</div> : null}
          </footer>
        </>
      )}

      {sheet === "contests" ? (
        <Sheet title={`Contests · ${visibleContests.length}`} onClose={() => setSheet(null)}>
          <p className={styles.hint}>Bestätigte Contests im Zeitraum werden automatisch aus dem Kalender übernommen.</p>
          <div className={styles.contestList}>
            {visibleContests.map((contest) => (
              <div className={styles.contestItem} key={contest.id}>
                <div className={styles.contestTop}>
                  <span><strong>{contest.title}</strong><small>{formatDate(contest.date)} · {contest.location || "Ort offen"}</small></span>
                  {canManage ? <button type="button" className={styles.iconButton} onClick={() => updateContest(contest.id, { excluded: true })} aria-label={`${contest.title} aus Auswertung entfernen`}><Trash2 size={16} /></button> : null}
                </div>
                <div className={styles.contestFields}>
                  <label>Kategorie<input value={contestOverrides[contest.id]?.category || "Street"} onChange={(event) => updateContest(contest.id, { category: event.target.value })} disabled={!canManage} /></label>
                  <label>Platz<input type="number" min="1" inputMode="numeric" value={contestOverrides[contest.id]?.placement || ""} onChange={(event) => updateContest(contest.id, { placement: event.target.value ? Number(event.target.value) : null })} disabled={!canManage} /></label>
                  <label className={styles.contestNote}>Bemerkung<input value={contestOverrides[contest.id]?.note || ""} onChange={(event) => updateContest(contest.id, { note: event.target.value })} placeholder="Bemerkung" disabled={!canManage} /></label>
                </div>
              </div>
            ))}
            {!visibleContests.length ? <p className={styles.inlineEmpty}>Im Zeitraum gibt es keine zugesagten Contests.</p> : null}
          </div>
          {hiddenContests.length ? (
            <div className={styles.hiddenContests}>
              <span>{hiddenContests.length} ausgeblendet</span>
              {hiddenContests.map((contest) => <button type="button" key={contest.id} onClick={() => updateContest(contest.id, { excluded: false })}><RotateCcw size={14} aria-hidden="true" /> {contest.title}</button>)}
            </div>
          ) : null}
          <p className={styles.hint}>Änderungen werden mit „Auswertung speichern“ übernommen.</p>
        </Sheet>
      ) : null}

      {sheet === "details" ? (
        <Sheet title="Kader, Gespräch & Status" onClose={() => setSheet(null)}>
          <div className={styles.detailFields}>
            <label>Kader<input value={squad} onChange={(event) => patchForm({ squad: event.target.value })} placeholder="z. B. NK2" disabled={!canManage} /></label>
            <label>Gespräch geführt<input type="date" value={conversationOn} onChange={(event) => patchForm({ conversationOn: event.target.value })} disabled={!canManage} /></label>
            <label>Status / DaLiD / GSU<input value={dalidStatus} onChange={(event) => patchForm({ dalidStatus: event.target.value })} placeholder="z. B. Kader halten" disabled={!canManage} /></label>
          </div>
          <Button onClick={() => setSheet(null)}>Übernehmen</Button>
          <p className={styles.hint}>Änderungen werden mit „Auswertung speichern“ übernommen.</p>
        </Sheet>
      ) : null}
    </div>
  );
}
