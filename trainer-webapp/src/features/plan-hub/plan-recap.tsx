"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { addReview } from "@/app/trainingsplaene/verlauf/actions";
import { Button } from "@/components/ui/button";
import { reviewLabels, type SessionRecap } from "@/domain/training-recap";
import {
  formatDay,
  formatDuration,
  formatTime,
  lineBreakText,
  lineTrickStats,
  periodStart,
  planStepForSkill,
  quoteOf,
  quoteTone,
  recapTotals,
  shortName,
  skillSummaries,
  stepLabels,
  type HubPlan,
  type HubRole,
  type RecapPeriod,
  type SkillSummary,
} from "./plan-hub-model";
import type { HubActions } from "./plan-hub";
import { useWords } from "./hub-words";
import styles from "./plan-hub.module.css";

const periods: { value: RecapPeriod; label: string }[] = [
  { value: "7", label: "7 Tage" },
  { value: "30", label: "30 Tage" },
  { value: "season", label: "Saison" },
];

const modeLabels: Record<SessionRecap["mode"], string> = {
  self: "Selbsttraining",
  individual: "Einzeltraining",
  group: "Gruppentraining",
};

const savedMessage = "Ergänzung gespeichert.";

const toneClass = { good: "quoteGood", mid: "quoteMid", low: "quoteLow", none: "quoteNone" } as const;

function QuotePill({ quote }: { quote: number | null }) {
  return <span className={`${styles.quotePill} ${styles[toneClass[quoteTone(quote)]]}`}>{quote === null ? "–" : `${quote} %`}</span>;
}

/**
 * Session-Rückblick: Kennzahlen, Empfehlung aus den Trainingsdaten, Skills im
 * Zeitraum und aufklappbare Sessions mit Hinweisen. Rechte filtert die
 * Datenbank (`training_recaps`), bevor Daten hier ankommen.
 */
export function RecapView({
  recaps,
  failed,
  role,
  userId,
  plans,
  actions,
  onBack,
}: {
  recaps: SessionRecap[];
  failed: boolean;
  role: HubRole;
  userId: string;
  plans: HubPlan[];
  actions: HubActions;
  onBack: () => void;
}) {
  const staff = role === "staff";
  const w = useWords();

  // Athlet*innen mit Sessions; eigene Sessions (Selbsttraining) zuerst.
  const athletes = useMemo(() => {
    const map = new Map<string, string>();
    for (const recap of recaps) map.set(recap.athlete_id, recap.athlete_name);
    return [...map].sort(([a], [b]) => Number(b === userId) - Number(a === userId));
  }, [recaps, userId]);

  const [athleteId, setAthleteId] = useState(athletes[0]?.[0] ?? userId);
  const [period, setPeriod] = useState<RecapPeriod>("30");
  const [openId, setOpenId] = useState<string | null>(null);

  const since = periodStart(period);
  const visible = recaps
    .filter((recap) => recap.athlete_id === athleteId && Date.parse(recap.completed_at) >= since)
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  const totals = recapTotals(visible);
  const skills = skillSummaries(visible);
  const athleteName = athletes.find(([id]) => id === athleteId)?.[1] ?? "";
  // Pläne kennen die Profil-ID; der Rückblick liefert zusätzlich die Trainings-ID.
  const planAthleteId =
    recaps.find((recap) => recap.athlete_id === athleteId)?.athlete_user_id ?? (athleteId === userId ? userId : athleteId);
  const expanded = openId ?? visible[0]?.participant_id ?? null;

  return (
    <div className={styles.recap}>
      <button type="button" className={`${styles.back} ${styles.mobileOnly}`} onClick={onBack}>
        <ChevronLeft size={18} aria-hidden="true" /> Pläne
      </button>
      <h2 className={`${styles.screenTitle} ${styles.mobileOnly}`}>Session-Rückblick</h2>

      {failed ? (
        <p role="alert" className={styles.errorBox}>
          Die Ergebnisse konnten nicht geladen werden. Bitte die Seite erneut laden.
        </p>
      ) : null}

      <div className={styles.recapFilters}>
        {staff || athletes.length > 1 ? (
          <div className={styles.chips} role="tablist" aria-label="Athlet auswählen">
            {athletes.map(([id, name]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === athleteId}
                className={`${styles.chip} ${id === athleteId ? styles.chipDark : ""}`}
                onClick={() => {
                  setAthleteId(id);
                  setOpenId(null);
                }}
              >
                {id === userId ? "Ich" : shortName(name)}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className={styles.segmented} role="radiogroup" aria-label="Zeitraum">
          {periods.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="radio"
              aria-checked={period === entry.value}
              className={period === entry.value ? styles.segmentOn : undefined}
              onClick={() => {
                setPeriod(entry.value);
                setOpenId(null);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.metrics}>
        <Metric value={String(totals.sessions)} label="Sessions" />
        <Metric value={String(totals.landed)} label="Landungen" />
        <Metric value={totals.quote === null ? "–" : `${totals.quote} %`} label="Landequote" />
        <Metric value={`${Math.round(totals.elapsedMs / 60000)} min`} label="Übungszeit" />
      </div>

      <div className={styles.recapGrid}>
        <section className={styles.sessions}>
          <h3 className={styles.sessionsHead}>
            {athleteName ? `${athleteId === userId ? "Du" : shortName(athleteName)} · neueste zuerst` : "Sessions"}
            <small>
              Landungen zählen als Training. Bestätigt wird ein Trick erst durch {staff ? "dich" : w.acc}.
            </small>
          </h3>
          {visible.length ? (
            visible.map((recap) => (
              <SessionRow
                key={recap.participant_id}
                recap={recap}
                open={expanded === recap.participant_id}
                onToggle={() => setOpenId(expanded === recap.participant_id ? "" : recap.participant_id)}
              />
            ))
          ) : (
            <p className={styles.emptyCard}>Keine abgeschlossenen Sessions in diesem Zeitraum.</p>
          )}
        </section>

        <aside className={styles.recapSide}>
          <Insight skills={skills} plans={plans} athleteId={planAthleteId} staff={staff} actions={actions} since={since} />
          {skills.some((skill) => skill.kind !== "line") ? (
            <section className={styles.skillCard}>
              <h3>Skills im Zeitraum</h3>
              <ul className={styles.skillList}>
                {skills
                  .filter((skill) => skill.kind !== "line")
                  .map((skill) => (
                    <SkillRow key={skill.skillId} skill={skill} plans={plans} athleteId={planAthleteId} />
                  ))}
              </ul>
            </section>
          ) : null}
          {skills
            .filter((skill) => skill.kind === "line")
            .map((skill) => (
              <LineSkillCard key={skill.skillId} skill={skill} plans={plans} athleteId={planAthleteId} />
            ))}
        </aside>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.metric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/** Dunkle Karte „Aus den Trainingsdaten“: bereit (≥ 80 %) oder Schwachstelle (< 50 %). */
function Insight({
  skills,
  plans,
  athleteId,
  staff,
  actions,
  since,
}: {
  skills: SkillSummary[];
  plans: HubPlan[];
  athleteId: string;
  staff: boolean;
  actions: HubActions;
  /** Beginn des gewählten Zeitraums; die DB prüft die Quote für denselben Zeitraum. */
  since: number;
}) {
  const w = useWords();
  const ready = skills
    .map((skill) => ({ skill, match: planStepForSkill(plans, athleteId, skill.name) }))
    .filter(({ skill, match }) => (skill.quote ?? 0) >= 80 && (!match || match.step < (staff ? 3 : 2)))
    .sort((a, b) => (b.skill.quote ?? 0) - (a.skill.quote ?? 0))[0];
  const weak = skills.filter((skill) => skill.quote !== null && skill.quote < 50).sort((a, b) => (a.quote ?? 0) - (b.quote ?? 0))[0];

  if (!ready && !weak) return null;

  let action: React.ReactNode = null;
  let hint = "";
  if (ready) {
    const match = ready.match;
    if (staff) {
      if (match?.step === 2) {
        action = (
          <Button variant="success" onClick={() => actions.openReview(match.plan, match.assignment, match.trick)}>
            <Check size={16} aria-hidden="true" /> Bestätigen
          </Button>
        );
        hint = "Stabil über 80 % und bereits gemeldet – jetzt bestätigen?";
      } else if (match) {
        // Offen oder geübt: Trainer*innen dürfen ohne Meldung direkt bestätigen.
        const busy = actions.busyKey === `${match.assignment.shareId}:${match.trick.id}`;
        action = (
          <Button
            variant="success"
            disabled={busy}
            onClick={() => actions.confirmFromRecap(match.plan, match.assignment, match.trick, since)}
          >
            <Check size={16} aria-hidden="true" /> Bestätigen
          </Button>
        );
        hint = "Stabil über 80 % – ohne Meldung bestätigen?";
      } else {
        hint = "Stabil über 80 % – nicht in einem zugewiesenen Plan.";
      }
    } else if (match?.step === 1) {
      action = <Button onClick={() => actions.openReport(match.plan, match.assignment, match.trick)}>Jetzt melden</Button>;
      hint = `Stabil über 80 % – zeig es ${w.dat}.`;
    } else if (match?.step === 0) {
      action = <Button onClick={() => actions.markPracticed(match.plan, match.assignment, match.trick)}>Als geübt markieren</Button>;
      hint = "Stabil über 80 % – markiere ihn als geübt und melde ihn danach.";
    } else {
      hint = `Stabil über 80 % – sprich ${w.acc} darauf an.`;
    }
  }

  return (
    <section className={styles.insight}>
      <span className={styles.nowKicker}>Aus den Trainingsdaten</span>
      <div className={styles.insightBody}>
        <div>
          <strong>
            {ready ? `${ready.skill.name} · ${ready.skill.quote} %` : `${weak!.name} · ${weak!.quote} %`}
          </strong>
          <small>{ready ? hint : "Schwachstelle unter 50 % – mehr Wiederholungen einplanen."}</small>
        </div>
        {action}
      </div>
    </section>
  );
}

function SkillRow({ skill, plans, athleteId }: { skill: SkillSummary; plans: HubPlan[]; athleteId: string }) {
  const match = planStepForSkill(plans, athleteId, skill.name);
  const series = skill.series.slice(-8);
  return (
    <li>
      <div>
        <strong>{skill.name}</strong>
        <small>
          {skill.landed} / {skill.attempts}
          {match ? (
            <span className={match.step === 3 ? styles.textGood : match.step === 2 ? styles.textWarn : undefined}>
              {" "}
              {stepLabels[match.step]}
            </span>
          ) : null}
          {skill.trend !== null && skill.trend !== 0 ? (
            <span className={skill.trend > 0 ? styles.textGood : styles.textWarn}>
              {" "}
              {skill.trend > 0 ? "▲" : "▼"} {skill.trend > 0 ? "+" : ""}
              {skill.trend} %
            </span>
          ) : null}
        </small>
        {skill.inLines !== undefined && skill.inLines !== null ? (
          <small className={styles.inLines}>in Lines: {skill.inLines} %</small>
        ) : null}
      </div>
      <span className={styles.spark} aria-hidden="true">
        {series.map((value, index) => (
          <span key={index} className={styles[toneClass[quoteTone(value)]]} style={{ height: `${Math.max(8, value)}%` }} />
        ))}
      </span>
      <QuotePill quote={skill.quote} />
    </li>
  );
}

/** Line als eigene Skill-Karte: Quote = komplette Lines, Bruch-Balken, „bricht meist bei …“. */
function LineSkillCard({ skill, plans, athleteId }: { skill: SkillSummary; plans: HubPlan[]; athleteId: string }) {
  const match = planStepForSkill(plans, athleteId, skill.name);
  const names = skill.lineTricks ?? [];
  const breakText = lineBreakText(skill);
  const segments = [
    { key: "complete", n: skill.landed, tone: styles.breakComplete, label: "komplett" },
    ...names.map((name, index) => ({
      key: `b${index}`,
      n: skill.breaks?.[index] ?? 0,
      tone: index === names.length - 1 ? styles.breakLast : styles.breakEarly,
      label: `raus bei ${name}`,
    })),
    { key: "unknown", n: skill.breaks?.[-1] ?? 0, tone: styles.breakUnknown, label: "ohne Angabe" },
  ].filter((segment) => segment.n > 0);
  return (
    <section className={`${styles.skillCard} ${styles.lineSkill}`}>
      <div className={styles.lineSkillBody}>
        <strong>
          {skill.name}
          <span className={styles.lineBadge}>LINE</span>
        </strong>
        <span className={styles.lineSkillQuote}>
          <QuotePill quote={skill.quote} />
          <small>
            komplett {skill.landed}/{skill.attempts}
            {match ? ` · ${stepLabels[match.step]}` : ""}
          </small>
        </span>
        <span
          className={styles.breakBar}
          role="img"
          aria-label={segments.map((segment) => `${segment.label}: ${segment.n}`).join(", ")}
        >
          {segments.map((segment) => (
            <span key={segment.key} className={segment.tone} style={{ flex: segment.n }} />
          ))}
        </span>
        {breakText ? <small className={styles.textWarn}>{breakText}</small> : null}
      </div>
    </section>
  );
}

function SessionRow({ recap, open, onToggle }: { recap: SessionRecap; open: boolean; onToggle: () => void }) {
  const attempts = recap.exercises.reduce((sum, exercise) => sum + exercise.attempts, 0);
  const landed = recap.exercises.reduce((sum, exercise) => sum + exercise.landed, 0);
  const active = recap.exercises.reduce((sum, exercise) => sum + Number(exercise.elapsed_ms), 0);
  // Dauer = aktive Zeit (ohne Pausen); ältere Sessions ohne Pausenfelder wie bisher.
  const total = recap.active_ms ?? Math.max(0, Date.parse(recap.completed_at) - Date.parse(recap.started_at));
  const quote = quoteOf(attempts, landed);

  return (
    <article className={`${styles.sessionRow} ${open ? styles.sessionOpen : ""}`}>
      <button type="button" className={styles.sessionHead} aria-expanded={open} onClick={onToggle}>
        <span className={styles.sessionDate}>
          <strong>{formatDay(recap.started_at)}</strong>
          <small>{formatTime(recap.started_at)}</small>
        </span>
        <span className={styles.sessionTitle}>
          <strong>{recap.title}</strong>
          <small>
            {recap.park || modeLabels[recap.mode]} · {formatDuration(total)} · {formatDuration(active)} aktiv
            {recap.present ? "" : " · abwesend"}
          </small>
        </span>
        <span className={styles.sessionCount}>
          {attempts ? `${landed} / ${attempts} gelandet` : "Keine Versuche"}
        </span>
        <QuotePill quote={quote} />
        {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>
      {open ? (
        <div className={styles.sessionBody}>
          <div>
            <span className={styles.sectionKicker}>Übungen</span>
            <ul className={styles.exerciseList}>
              {recap.exercises.map((exercise) => {
                const exerciseQuote = quoteOf(exercise.attempts, exercise.landed);
                const line = exercise.kind === "line";
                return (
                  <li key={exercise.id} className={line ? styles.lineExercise : undefined}>
                    <span className={line ? styles.lineExerciseName : undefined}>
                      {exercise.name}
                      {line ? <span className={styles.lineBadge}>LINE</span> : null}
                    </span>
                    <span className={styles.exerciseBar} aria-hidden="true">
                      <span
                        className={styles[toneClass[quoteTone(exerciseQuote)]]}
                        style={{ width: `${exerciseQuote ?? 0}%` }}
                      />
                    </span>
                    <small>{exercise.attempts ? `${exercise.landed} / ${exercise.attempts}` : "–"}</small>
                    <b>{exerciseQuote === null ? "–" : `${exerciseQuote} %`}</b>
                    {line && exercise.attempts ? (
                      <ul className={styles.lineSubRows}>
                        {lineTrickStats(exercise).map((stat, index) => {
                          const statQuote = quoteOf(stat.reached, stat.landed);
                          return (
                            <li key={`${stat.name}-${index}`}>
                              <span className={statQuote !== null && statQuote < 80 ? styles.textWarn : undefined}>
                                {index + 1}. {stat.name}
                              </span>
                              <span className={`${styles.exerciseBar} ${styles.exerciseBarThin}`} aria-hidden="true">
                                <span
                                  className={styles[toneClass[quoteTone(statQuote)]]}
                                  style={{ width: `${statQuote ?? 0}%` }}
                                />
                              </span>
                              <small>{stat.reached ? `${stat.landed} / ${stat.reached}` : "–"}</small>
                              <b>{statQuote === null ? "–" : `${statQuote} %`}</b>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <span className={styles.sectionKicker}>Hinweise & Ziele</span>
            <Notes recap={recap} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

/** Vorhandene Einträge plus Eingabe. Korrekturen bleiben im Protokoll erhalten. */
function Notes({ recap }: { recap: SessionRecap }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    async (previous: { message: string }, form: FormData) => {
      const result = await addReview(previous, form);
      // Nach erfolgreichem Speichern: Eingabe leeren, neue Request-ID, Daten neu laden.
      if (result.message === savedMessage) {
        setBody("");
        setRequestId(crypto.randomUUID());
        router.refresh();
      }
      return result;
    },
    { message: "" },
  );
  const allowed = (Object.keys(reviewLabels) as (keyof typeof reviewLabels)[]).filter((kind) =>
    kind === "request" ? recap.is_self : kind === "confirmation" ? recap.can_confirm : recap.can_review,
  );
  const [kind, setKind] = useState(allowed[0] ?? "hint");
  const [exercise, setExercise] = useState("");
  // Sichtbarkeit wählen nur Trainer*innen, und nur für Hinweise und Ziele.
  const [visibility, setVisibility] = useState<"athlete" | "coaches">("athlete");
  const canChooseVisibility = recap.can_review && (kind === "hint" || kind === "goal");
  const firstName = recap.athlete_name.split(" ")[0];
  const needsExercise = kind === "request" || kind === "confirmation";
  const current = recap.reviews.filter((review) => !recap.reviews.some((next) => next.supersedes === review.id));

  return (
    <div className={styles.notes}>
      {current.map((review) => {
        const coachesOnly = review.visibility === "coaches";
        return (
          <div key={review.id} className={`${styles.noteCard} ${coachesOnly ? styles.noteTrainer : ""}`}>
            <p>{review.body}</p>
            <small>
              {review.author_name} · {reviewLabels[review.kind]}
              {review.exercise_id ? ` · ${recap.exercises.find((e) => e.id === review.exercise_id)?.name ?? "Übung"}` : ""}
              {coachesOnly ? (
                <b className={styles.noteTag}> · Nur Trainer</b>
              ) : review.kind === "hint" || review.kind === "goal" ? (
                ` · Für ${recap.is_self ? "dich" : firstName}`
              ) : null}
            </small>
          </div>
        );
      })}
      {recap.note ? (
        <div className={`${styles.noteCard} ${styles.noteTrainer}`}>
          <p>{recap.note}</p>
          <small>Session-Notiz · Nur Trainer</small>
        </div>
      ) : null}
      {!current.length && !recap.note ? <p className={styles.muted}>Noch keine Hinweise.</p> : null}

      {allowed.length ? (
        <form action={action} className={styles.noteForm}>
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="participant" value={recap.participant_id} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="replaces" value="" />
          <input type="hidden" name="visibility" value={canChooseVisibility ? visibility : "athlete"} />
          <div className={styles.inlineInput}>
            <input
              name="body"
              required
              maxLength={4000}
              placeholder="Hinweis oder Ziel für die nächste Session"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <Button type="submit" disabled={pending || !body.trim() || (needsExercise && !exercise)}>
              {pending ? "…" : "Speichern"}
            </Button>
          </div>
          <div className={styles.noteOptions}>
            {allowed.length > 1 ? (
              <div className={styles.segmented} role="radiogroup" aria-label="Art des Eintrags">
                {allowed.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    role="radio"
                    aria-checked={kind === entry}
                    className={kind === entry ? styles.segmentOn : undefined}
                    onClick={() => setKind(entry)}
                  >
                    {entry === "hint" ? "Hinweis" : entry === "goal" ? "Ziel" : entry === "request" ? "Bestätigung anfragen" : "Fortschritt bestätigen"}
                  </button>
                ))}
              </div>
            ) : null}
            {canChooseVisibility ? (
              <div className={styles.segmented} role="radiogroup" aria-label="Sichtbarkeit">
                {(
                  [
                    ["athlete", `Für ${firstName} sichtbar`],
                    ["coaches", "Nur Trainer"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={visibility === value}
                    className={visibility === value ? styles.segmentOn : undefined}
                    onClick={() => setVisibility(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <select
              name="exercise"
              aria-label="Übung"
              value={exercise}
              required={needsExercise}
              onChange={(event) => setExercise(event.target.value)}
            >
              <option value="">{needsExercise ? "Übung wählen" : "Gesamte Session"}</option>
              {recap.exercises.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          <small className={styles.fieldHint}>
            {canChooseVisibility && visibility === "coaches"
              ? `Nur für Trainer sichtbar – ${firstName} und Eltern sehen diesen Eintrag nicht.`
              : recap.is_self
                ? "Sichtbar für dich, deine Trainer und verknüpfte Eltern."
                : `Sichtbar für ${firstName}, Trainer und verknüpfte Eltern.`}
            {state.message && state.message !== savedMessage ? ` ${state.message}` : ""}
          </small>
        </form>
      ) : null}
    </div>
  );
}
