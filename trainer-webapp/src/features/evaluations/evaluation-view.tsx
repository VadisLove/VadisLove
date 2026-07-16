"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  BarChart3,
  CalendarCheck2,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Medal,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  createPersonalGoal,
  saveAthleteEvaluation,
  setPersonalGoalCompleted,
  type EvaluationActionResult,
} from "@/app/auswertung/actions";
import { PageHeader } from "@/components/ui/page-header";
import type {
  AthleteEvaluation,
  CalendarEvent,
  EvaluationContestOverride,
  EvaluationDashboardData,
  EvaluationSkillCategory,
  EvaluationSkillRating,
  Person,
  TrainingPlan,
} from "@/domain/models";
import styles from "./evaluation-view.module.css";

type ViewMode = "single" | "compare";
type SortMetric = "overall" | "attendance" | "contests" | "tasks" | "skills";

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

const skillCategoryLabels: Record<EvaluationSkillCategory, string> = {
  skateboarding: "Skateboardspezifische Anforderungen",
  mental: "Mentaler Zustand",
  athletic: "Athletik",
};

function todayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentYearStart() {
  return `${todayIso().slice(0, 4)}-01-01`;
}

function withinPeriod(event: CalendarEvent, from: string, to: string) {
  return event.date <= to && event.endDate >= from;
}

function participantStatus(event: CalendarEvent, athleteId: string) {
  return event.participants.find((participant) => participant.id === athleteId)?.status;
}

function matchingEvaluation(evaluations: AthleteEvaluation[], athleteId: string, from: string, to: string) {
  return evaluations.find((evaluation) => (
    evaluation.athleteId === athleteId
    && evaluation.periodStart === from
    && evaluation.periodEnd === to
  ));
}

function athletePlanTasks(plans: TrainingPlan[], athleteId: string) {
  const tasks = plans
    .filter((plan) => plan.assignedAthletes.includes(athleteId) || plan.tricks.some((trick) => trick.athleteId === athleteId))
    .flatMap((plan) => [
      ...plan.goals.map((goal) => ({
        id: `${plan.id}-goal-${goal.id}`,
        title: goal.title,
        completed: goal.completed,
        source: plan.title,
      })),
      ...plan.tricks
        .filter((trick) => !trick.athleteId || trick.athleteId === athleteId)
        .map((trick) => ({
          id: `${plan.id}-trick-${trick.id}`,
          title: trick.name,
          completed: trick.status === "confirmed",
          source: plan.title,
        })),
    ]);

  return Array.from(new Map(tasks.map((task) => [task.id, task])).values());
}

function csvCell(value: string | number) {
  const stringValue = String(value).replaceAll('"', '""');
  return `"${stringValue}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Textfeld mit optionaler Browser-Spracherkennung ohne externen API-Schluessel. */
function SpeechTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  disabled?: boolean;
}) {
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

  return (
    <div className={styles.speechField}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
      />
      <button
        type="button"
        className={listening ? styles.listeningButton : styles.speechButton}
        onClick={toggle}
        disabled={disabled}
        title="Bemerkung per Browser-Spracherkennung diktieren"
        aria-label={listening ? "Diktat beenden" : "Diktat starten"}
      >
        {listening ? <MicOff size={17} /> : <Mic size={17} />}
      </button>
    </div>
  );
}

interface AthleteMetrics {
  athlete: Person;
  attended: number;
  invitedTrainings: number;
  attendance: number;
  contestCount: number;
  contestScore: number;
  taskCompleted: number;
  taskTotal: number;
  taskScore: number;
  skillScore: number;
  overall: number;
}

function calculateMetrics({
  athlete,
  events,
  plans,
  evaluations,
  from,
  to,
  weights,
}: {
  athlete: Person;
  events: CalendarEvent[];
  plans: TrainingPlan[];
  evaluations: AthleteEvaluation[];
  from: string;
  to: string;
  weights: EvaluationDashboardData["weights"];
}): AthleteMetrics {
  const trainings = events.filter((event) => event.type === "training" && withinPeriod(event, from, to) && participantStatus(event, athlete.id));
  const attended = trainings.filter((event) => participantStatus(event, athlete.id) === "confirmed").length;
  const attendance = trainings.length ? Math.round((attended / trainings.length) * 100) : 0;
  const evaluation = matchingEvaluation(evaluations, athlete.id, from, to);
  const overrides = new Map((evaluation?.contestOverrides || []).map((override) => [override.eventId, override]));
  const contests = events.filter((event) => (
    event.type === "contest"
    && withinPeriod(event, from, to)
    && participantStatus(event, athlete.id) === "confirmed"
    && !overrides.get(event.id)?.excluded
  ));
  const placements = contests.flatMap((event) => {
    const placement = overrides.get(event.id)?.placement;
    return placement ? [placement] : [];
  });
  const averagePlacement = placements.length
    ? placements.reduce((sum, placement) => sum + placement, 0) / placements.length
    : null;
  const contestScore = contests.length === 0 ? 0 : averagePlacement === null ? 50 : Math.max(0, Math.round(100 - (averagePlacement - 1) * 5));
  const tasks = athletePlanTasks(plans, athlete.id);
  const taskCompleted = tasks.filter((task) => task.completed).length;
  const taskScore = tasks.length ? Math.round((taskCompleted / tasks.length) * 100) : 0;
  const ratings = evaluation?.skillRatings || [];
  const skillScore = ratings.length
    ? Math.round((ratings.reduce((sum, rating) => sum + rating.rating, 0) / ratings.length) * 20)
    : 0;
  const overall = Math.round(
    attendance * weights.attendance / 100
    + contestScore * weights.contests / 100
    + taskScore * weights.tasks / 100
    + skillScore * weights.skills / 100,
  );

  return {
    athlete,
    attended,
    invitedTrainings: trainings.length,
    attendance,
    contestCount: contests.length,
    contestScore,
    taskCompleted,
    taskTotal: tasks.length,
    taskScore,
    skillScore,
    overall,
  };
}

export function EvaluationView({ initialData }: { initialData: EvaluationDashboardData }) {
  const router = useRouter();
  const initialFrom = currentYearStart();
  const initialTo = todayIso();
  const initialAthleteId = initialData.athletes[0]?.id || "";
  const initialEvaluation = matchingEvaluation(initialData.evaluations, initialAthleteId, initialFrom, initialTo);
  const [mode, setMode] = useState<ViewMode>("single");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [athleteId, setAthleteId] = useState(initialAthleteId);
  const [sortMetric, setSortMetric] = useState<SortMetric>("overall");
  const [title, setTitle] = useState(initialEvaluation?.title || `Auswertung ${initialFrom} bis ${initialTo}`);
  const [conversationOn, setConversationOn] = useState(initialEvaluation?.conversationOn || "");
  const [squad, setSquad] = useState(initialEvaluation?.squad || "");
  const [dalidStatus, setDalidStatus] = useState(initialEvaluation?.dalidStatus || "");
  const [personalNotes, setPersonalNotes] = useState(initialEvaluation?.personalNotes || "");
  const [measures, setMeasures] = useState(initialEvaluation?.measures || "");
  const [ratings, setRatings] = useState<Record<string, EvaluationSkillRating>>(() => Object.fromEntries((initialEvaluation?.skillRatings || []).map((rating) => [rating.skillKey, rating])));
  const [contestOverrides, setContestOverrides] = useState<Record<string, EvaluationContestOverride>>(() => Object.fromEntries((initialEvaluation?.contestOverrides || []).map((override) => [override.eventId, override])));
  const [newGoal, setNewGoal] = useState("");
  const [result, setResult] = useState<EvaluationActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const athlete = initialData.athletes.find((entry) => entry.id === athleteId);
  const evaluation = useMemo(
    () => matchingEvaluation(initialData.evaluations, athleteId, from, to),
    [athleteId, from, initialData.evaluations, to],
  );

  const loadContext = (nextAthleteId: string, nextFrom: string, nextTo: string) => {
    const nextEvaluation = matchingEvaluation(initialData.evaluations, nextAthleteId, nextFrom, nextTo);
    setTitle(nextEvaluation?.title || `Auswertung ${nextFrom} bis ${nextTo}`);
    setConversationOn(nextEvaluation?.conversationOn || "");
    setSquad(nextEvaluation?.squad || "");
    setDalidStatus(nextEvaluation?.dalidStatus || "");
    setPersonalNotes(nextEvaluation?.personalNotes || "");
    setMeasures(nextEvaluation?.measures || "");
    setRatings(Object.fromEntries((nextEvaluation?.skillRatings || []).map((rating) => [rating.skillKey, rating])));
    setContestOverrides(Object.fromEntries((nextEvaluation?.contestOverrides || []).map((override) => [override.eventId, override])));
    setResult(null);
  };

  const selectedTasks = useMemo(() => athletePlanTasks(initialData.plans, athleteId), [athleteId, initialData.plans]);
  const personalGoals = initialData.personalGoals.filter((goal) => goal.athleteId === athleteId);
  const automaticContests = initialData.events.filter((event) => (
    event.type === "contest"
    && withinPeriod(event, from, to)
    && participantStatus(event, athleteId) === "confirmed"
  ));
  const visibleContests = automaticContests.filter((event) => !contestOverrides[event.id]?.excluded);
  const hiddenContests = automaticContests.filter((event) => contestOverrides[event.id]?.excluded);
  const selectedMetrics = athlete
    ? calculateMetrics({ athlete, events: initialData.events, plans: initialData.plans, evaluations: [{
      id: evaluation?.id || "draft", trainerId: evaluation?.trainerId || initialData.currentUserId, athleteId, periodStart: from, periodEnd: to,
      title, conversationOn, squad, dalidStatus, personalNotes, measures,
      skillRatings: Object.values(ratings), contestOverrides: Object.values(contestOverrides),
    }], from, to, weights: initialData.weights })
    : null;

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

  const updateRating = (skillKey: string, patch: Partial<EvaluationSkillRating>) => {
    setRatings((current) => ({
      ...current,
      [skillKey]: {
        skillKey,
        rating: current[skillKey]?.rating || 3,
        note: current[skillKey]?.note || "",
        ...patch,
      },
    }));
  };

  const updateContest = (eventId: string, patch: Partial<EvaluationContestOverride>) => {
    setContestOverrides((current) => ({
      ...current,
      [eventId]: {
        eventId,
        excluded: current[eventId]?.excluded || false,
        category: current[eventId]?.category || "Street",
        placement: current[eventId]?.placement || null,
        note: current[eventId]?.note || "",
        ...patch,
      },
    }));
  };

  const save = () => {
    if (!athleteId) return;
    startTransition(async () => {
      const response = await saveAthleteEvaluation({
        athleteId, periodStart: from, periodEnd: to, title, conversationOn, squad,
        dalidStatus, personalNotes, measures,
        skillRatings: Object.values(ratings),
        contestOverrides: Object.values(contestOverrides),
      });
      setResult(response);
      if (response.status === "success") router.refresh();
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

  const exportSingle = () => {
    if (!athlete || !selectedMetrics) return;
    const rows: Array<Array<string | number>> = [
      ["Athlet", athlete.name], ["Zeitraum", `${from} bis ${to}`], ["Kader", squad],
      ["Trainingsanwesenheit", `${selectedMetrics.attended}/${selectedMetrics.invitedTrainings} (${selectedMetrics.attendance} %)`],
      [], ["Contests", "Datum", "Kategorie", "Platzierung", "Bemerkung"],
      ...visibleContests.map((contest) => [contest.title, contest.date, contestOverrides[contest.id]?.category || "Street", contestOverrides[contest.id]?.placement || "", contestOverrides[contest.id]?.note || ""]),
      [], ["Skill", "Bewertung 1–5", "Bemerkung"],
      ...initialData.skills.filter((skill) => skill.visible).map((skill) => [skill.label, ratings[skill.key]?.rating || "", ratings[skill.key]?.note || ""]),
      [], ["Aufgabe / Trickziel", "Quelle", "Erledigt"],
      ...selectedTasks.map((task) => [task.title, task.source, task.completed ? "Ja" : "Nein"]),
      [], ["Persönliche Bemerkung", personalNotes], ["Maßnahmen", measures],
    ];
    downloadCsv(`auswertung-${athlete.name.toLowerCase().replaceAll(" ", "-")}-${to}.csv`, rows);
  };

  const exportComparison = () => downloadCsv(`fahrer-vergleich-${from}-${to}.csv`, [
    ["Rang", "Athlet", "Overall", "Anwesenheit", "Contest-Score", "Aufgaben", "Skills"],
    ...comparison.map((entry, index) => [index + 1, entry.athlete.name, entry.overall, entry.attendance, entry.contestScore, entry.taskScore, entry.skillScore]),
  ]);

  if (!initialData.currentUserId) {
    return <div className={styles.emptyState}><Trophy size={28} /><h1>Bitte anmelden</h1><p>Auswertungen sind nur für angemeldete Konten verfügbar.</p></div>;
  }

  if (initialData.athletes.length === 0) {
    return (
      <>
        <PageHeader title="Auswertung" description="Leistung, Entwicklung und Ziele im Blick behalten." />
        <div className={styles.emptyState}><UsersRound size={30} /><h2>Noch keine verbundenen Athleten</h2><p>Bestätige zuerst eine Trainer–Athlet-Verbindung im Personen-Tab.</p></div>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Auswertung" description="Entwicklung dokumentieren, Ziele ableiten und Fahrer fair vergleichen." />

      <section className={styles.commandBar} aria-label="Auswertungsansicht und Zeitraum">
        <div className={styles.modeSwitch}>
          <button type="button" className={mode === "single" ? styles.activeMode : ""} onClick={() => setMode("single")}><ClipboardCheck size={17} /> Einzelauswertung</button>
          <button type="button" className={mode === "compare" ? styles.activeMode : ""} onClick={() => setMode("compare")}><BarChart3 size={17} /> Fahrervergleich</button>
        </div>
        <div className={styles.periodFields}>
          <label>Von<input type="date" value={from} max={to} onChange={(event) => { setFrom(event.target.value); loadContext(athleteId, event.target.value, to); }} /></label>
          <ChevronRight size={16} />
          <label>Bis<input type="date" value={to} min={from} onChange={(event) => { setTo(event.target.value); loadContext(athleteId, from, event.target.value); }} /></label>
        </div>
      </section>

      {mode === "compare" ? (
        <section className={styles.comparePanel}>
          <header className={styles.compareHeader}>
            <div><span className={styles.eyebrow}>Overall-Liste</span><h2>Fahrer im direkten Vergleich</h2><p>Alle Scores verwenden die persönliche Gewichtung des angemeldeten Trainers.</p></div>
            <div className={styles.compareActions}>
              <label>Sortieren nach<select value={sortMetric} onChange={(event) => setSortMetric(event.target.value as SortMetric)}><option value="overall">Overall</option><option value="attendance">Trainingsbesuche</option><option value="contests">Contest-Erfolge</option><option value="tasks">Aufgaben</option><option value="skills">Skills</option></select></label>
              <button type="button" onClick={exportComparison}><Download size={17} /> CSV</button>
            </div>
          </header>
          <div className={styles.weightRail}>
            <span>Anwesenheit <strong>{initialData.weights.attendance}%</strong></span><span>Contests <strong>{initialData.weights.contests}%</strong></span><span>Aufgaben <strong>{initialData.weights.tasks}%</strong></span><span>Skills <strong>{initialData.weights.skills}%</strong></span>
          </div>
          <div className={styles.rankingTable} role="table" aria-label="Fahrerrangliste">
            <div className={styles.rankingHead} role="row"><span>Rang / Fahrer</span><span>Overall</span><span>Anwesenheit</span><span>Contests</span><span>Aufgaben</span><span>Skills</span></div>
            {comparison.map((entry, index) => (
              <div className={styles.rankingRow} role="row" key={entry.athlete.id}>
                <span className={styles.riderCell}><b>{index + 1}</b><i>{entry.athlete.initials}</i><span><strong>{entry.athlete.name}</strong><small>{entry.athlete.region}</small></span></span>
                <span className={styles.overallScore}>{entry.overall}</span>
                <span>{entry.attendance}%<small>{entry.attended}/{entry.invitedTrainings} Trainings</small></span>
                <span>{entry.contestScore}<small>{entry.contestCount} Contests</small></span>
                <span>{entry.taskScore}%<small>{entry.taskCompleted}/{entry.taskTotal} erledigt</small></span>
                <span>{entry.skillScore}%<small>Trainerbewertung</small></span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className={styles.athleteHero}>
            <div className={styles.athleteIdentity}>
              <span className={styles.avatar}>{athlete?.initials}</span>
              <div><span className={styles.eyebrow}>Athletenprofil</span><select value={athleteId} onChange={(event) => { setAthleteId(event.target.value); loadContext(event.target.value, from, to); }}>{initialData.athletes.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select><p>{athlete?.region}</p></div>
            </div>
            <div className={styles.heroFields}>
              <label>Kader<input value={squad} onChange={(event) => setSquad(event.target.value)} placeholder="z. B. NK2" disabled={!initialData.canManage} /></label>
              <label>Gespräch geführt<input type="date" value={conversationOn} onChange={(event) => setConversationOn(event.target.value)} disabled={!initialData.canManage} /></label>
              <label>DaLiD / GSU<input value={dalidStatus} onChange={(event) => setDalidStatus(event.target.value)} placeholder="Status oder Termin" disabled={!initialData.canManage} /></label>
            </div>
            <div className={styles.metricStrip}>
              <article><CalendarCheck2 size={18} /><span><strong>{selectedMetrics?.attendance || 0}%</strong> Anwesenheit</span></article>
              <article><Trophy size={18} /><span><strong>{selectedMetrics?.contestCount || 0}</strong> Contests</span></article>
              <article><Target size={18} /><span><strong>{selectedMetrics?.taskCompleted || 0}/{selectedMetrics?.taskTotal || 0}</strong> Ziele</span></article>
              <article><Sparkles size={18} /><span><strong>{selectedMetrics?.overall || 0}</strong> Overall</span></article>
            </div>
          </section>

          <div className={styles.contentGrid}>
            <section className={`${styles.panel} ${styles.contestPanel}`}>
              <header><span><Trophy size={19} /></span><div><h2>Contest-Teilnahmen & Ergebnisse</h2><p>Bestätigte Contests werden automatisch aus dem Kalender übernommen.</p></div></header>
              <div className={styles.contestTable}>
                <div className={styles.contestHead}><span>Contest</span><span>Kategorie</span><span>Platz</span><span>Bemerkung</span><span /></div>
                {visibleContests.map((contest) => (
                  <div className={styles.contestRow} key={contest.id}>
                    <span><strong>{contest.title}</strong><small>{contest.date} · {contest.location || "Ort offen"}</small></span>
                    <input value={contestOverrides[contest.id]?.category || "Street"} onChange={(event) => updateContest(contest.id, { category: event.target.value })} disabled={!initialData.canManage} aria-label={`Kategorie ${contest.title}`} />
                    <input type="number" min="1" value={contestOverrides[contest.id]?.placement || ""} onChange={(event) => updateContest(contest.id, { placement: event.target.value ? Number(event.target.value) : null })} disabled={!initialData.canManage} aria-label={`Platzierung ${contest.title}`} />
                    <input value={contestOverrides[contest.id]?.note || ""} onChange={(event) => updateContest(contest.id, { note: event.target.value })} placeholder="Bemerkung" disabled={!initialData.canManage} aria-label={`Bemerkung ${contest.title}`} />
                    {initialData.canManage ? <button type="button" onClick={() => updateContest(contest.id, { excluded: true })} aria-label={`${contest.title} aus Auswertung entfernen`}><Trash2 size={16} /></button> : null}
                  </div>
                ))}
                {visibleContests.length === 0 ? <p className={styles.inlineEmpty}>Im Zeitraum gibt es keine zugesagten Contests.</p> : null}
              </div>
              {hiddenContests.length > 0 ? <div className={styles.hiddenContests}><span>{hiddenContests.length} ausgeblendet</span>{hiddenContests.map((contest) => <button type="button" key={contest.id} onClick={() => updateContest(contest.id, { excluded: false })}><RotateCcw size={14} /> {contest.title}</button>)}</div> : null}
            </section>

            <section className={`${styles.panel} ${styles.attendancePanel}`}>
              <header><span><CalendarCheck2 size={19} /></span><div><h2>Trainingsbeteiligung</h2><p>Bestätigte Besuche im gewählten Zeitraum.</p></div></header>
              <div className={styles.attendanceGauge} style={{ "--attendance": `${selectedMetrics?.attendance || 0}%` } as React.CSSProperties}><strong>{selectedMetrics?.attendance || 0}%</strong><span>{selectedMetrics?.attended || 0} von {selectedMetrics?.invitedTrainings || 0} Einheiten</span></div>
            </section>
          </div>

          <div className={styles.skillGrid}>
            {(["skateboarding", "mental", "athletic"] as EvaluationSkillCategory[]).map((category) => {
              const categorySkills = initialData.skills.filter((skill) => skill.visible && skill.category === category);
              if (!categorySkills.length) return null;
              return (
                <section className={styles.skillSection} key={category}>
                  <header><span className={styles.sectionNumber}>{category === "skateboarding" ? "01" : category === "mental" ? "02" : "03"}</span><div><h2>{skillCategoryLabels[category]}</h2><p>Bewertung auf einer Skala von 1 bis 5</p></div></header>
                  <div className={styles.skillList}>
                    {categorySkills.map((skill) => (
                      <article className={styles.skillCard} key={skill.key}>
                        <div className={styles.skillTitle}><h3>{skill.label}</h3><span>{ratings[skill.key]?.rating ? `${ratings[skill.key].rating}/5` : "Offen"}</span></div>
                        <div className={styles.ratingScale} role="radiogroup" aria-label={`${skill.label} bewerten`}>
                          {[1, 2, 3, 4, 5].map((score) => <button type="button" key={score} role="radio" aria-checked={ratings[skill.key]?.rating === score} className={ratings[skill.key]?.rating === score ? styles.activeRating : ""} onClick={() => updateRating(skill.key, { rating: score })} disabled={!initialData.canManage}>{score}</button>)}
                        </div>
                        <SpeechTextarea value={ratings[skill.key]?.note || ""} onChange={(note) => updateRating(skill.key, { note })} placeholder="Beobachtung oder Entwicklung festhalten …" rows={3} disabled={!initialData.canManage} />
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className={styles.goalGrid}>
            <section className={styles.goalPanel}>
              <header><span><Target size={19} /></span><div><h2>Trickziele aus Aufgaben</h2><p>Direkt aus zugewiesenen Trainingsplänen übernommen.</p></div></header>
              <div className={styles.goalList}>{selectedTasks.map((task) => <div key={task.id} className={task.completed ? styles.completedGoal : styles.goalItem}><span>{task.completed ? <Check size={15} /> : <ChevronRight size={15} />}</span><div><strong>{task.title}</strong><small>{task.source}</small></div></div>)}{!selectedTasks.length ? <p className={styles.inlineEmpty}>Noch keine Aufgaben oder Trickziele zugewiesen.</p> : null}</div>
            </section>
            <section className={styles.goalPanel}>
              <header><span><Award size={19} /></span><div><h2>Persönliche Ziele</h2><p>Vom Athleten selbst oder gemeinsam mit dem Trainer gesetzt.</p></div></header>
              <div className={styles.goalList}>{personalGoals.map((goal) => <button type="button" key={goal.id} className={goal.completed ? styles.completedGoal : styles.goalItem} onClick={() => startTransition(async () => { const response = await setPersonalGoalCompleted(goal.id, !goal.completed); setResult(response); if (response.status === "success") router.refresh(); })}><span>{goal.completed ? <Check size={15} /> : <ChevronRight size={15} />}</span><div><strong>{goal.title}</strong><small>{goal.completed ? "Erreicht" : "In Arbeit"}</small></div></button>)}</div>
              <div className={styles.addGoal}><input value={newGoal} onChange={(event) => setNewGoal(event.target.value)} placeholder="Neues persönliches Ziel" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGoal(); } }} /><button type="button" onClick={addGoal} disabled={pending || !newGoal.trim()}><Plus size={16} /> Ergänzen</button></div>
            </section>
          </div>

          <section className={styles.notesPanel}>
            <div><label>Persönliche Bemerkung</label><SpeechTextarea value={personalNotes} onChange={setPersonalNotes} placeholder="Gespräch, Umfeld, Entwicklung und nächste Schritte …" rows={6} disabled={!initialData.canManage} /></div>
            <div><label>Maßnahmen</label><SpeechTextarea value={measures} onChange={setMeasures} placeholder="Vereinbarte Maßnahmen, Physio, Trainingsschwerpunkte …" rows={6} disabled={!initialData.canManage} /></div>
          </section>

          <footer className={styles.saveBar}>
            <div><Medal size={20} /><span><strong>{evaluation ? "Gespeicherte Auswertung" : "Neue Auswertung"}</strong><small>{athlete?.name} · {from} bis {to}</small></span></div>
            {result ? <p className={result.status === "error" ? styles.error : styles.success} aria-live="polite">{result.message}</p> : <span />}
            <button type="button" className={styles.exportButton} onClick={exportSingle}><Download size={17} /> CSV</button>
            {initialData.canManage ? <button type="button" className={styles.saveButton} onClick={save} disabled={pending}><Save size={17} /> {pending ? "Speichert …" : "Auswertung speichern"}</button> : null}
          </footer>
        </>
      )}
    </div>
  );
}
