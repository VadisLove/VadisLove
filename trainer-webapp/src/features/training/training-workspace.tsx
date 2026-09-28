"use client";

import { useEffect, useRef, useState } from "react";
import type { TrainingPlan } from "@/domain/models";
import {
  attemptSummary,
  timerMilliseconds,
  type TrainingSession,
  type TrainingWorkspace,
} from "@/domain/training";
import styles from "./training.module.css";

/** Sendet einen idempotenten Trainings-Command; `true` bei Serverbestätigung. */
export type Run = (
  operation: string,
  payload: Record<string, unknown>,
) => Promise<boolean>;
function Skateboard() {
  return (
    <svg viewBox="0 0 32 24" width="26" height="24" aria-hidden="true">
      <path
        d="M3 9c1 4 3 5 7 5h12c4 0 6-1 7-5M8 14v3m16-3v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="9" cy="19" r="2" fill="currentColor" />
      <circle cx="23" cy="19" r="2" fill="currentColor" />
    </svg>
  );
}

/** Auswahl der Anwesenden vor dem Start eines Live-Trainings. */
export function StartTraining({
  plan,
  data,
  blocked,
  run,
  cancel,
}: {
  plan: TrainingPlan;
  data: TrainingWorkspace;
  blocked: boolean;
  run: Run;
  cancel: () => void;
}) {
  const isTrainer = data.user.accountType === "trainer";
  const [mode, setMode] = useState(isTrainer ? "individual" : "self");
  const [users, setUsers] = useState<string[]>([]);
  const version = data.plans.find((p) => p.id === plan.id)?.versions[0];
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run("session_start", {
          source: plan.id.startsWith("shared-") ? "share" : "plan",
          plan_id: plan.id.startsWith("shared-") ? undefined : plan.id,
          share_id: plan.id.startsWith("shared-")
            ? plan.id.slice(7)
            : undefined,
          version_id: version?.id,
          mode,
          users,
        });
      }}
    >
      <fieldset className={styles.form} disabled={blocked}>
        <h2>{isTrainer ? "Wen trainierst du?" : "Dein Training starten"}</h2>
        <p>
          {plan.title} · Version {version?.version_number ?? plan.version}
        </p>
        {isTrainer ? (
          <>
            <div className={styles.row}>
              <button
                type="button"
                aria-pressed={mode === "individual"}
                onClick={() => {
                  setMode("individual");
                  setUsers([]);
                }}
              >
                Einzelner Fahrer
              </button>
              <button
                type="button"
                aria-pressed={mode === "group"}
                onClick={() => {
                  setMode("group");
                  setUsers([]);
                }}
              >
                Gruppe
              </button>
            </div>
            <h3>Wer ist tatsächlich anwesend?</h3>
            <p>
              Wähle die anwesenden Fahrer. Kalender-Zusagen sind keine
              Anwesenheit.
            </p>
            {data.people.map((p) => (
              <label className={styles.check} key={p.id}>
                <input
                  type={mode === "individual" ? "radio" : "checkbox"}
                  name="participants"
                  checked={users.includes(p.id)}
                  onChange={(e) =>
                    setUsers(
                      mode === "individual"
                        ? [p.id]
                        : e.target.checked
                          ? [...users, p.id]
                          : users.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
            {!data.people.length && (
              <p>
                Keine aktiv zugeordneten Athleten vorhanden. Stelle zuerst eine
                bestätigte Trainer-Athlet-Verbindung her.
              </p>
            )}
          </>
        ) : (
          <p>
            Du trainierst selbst. Alle Ergebnisse gehören zu dir; ein Verein ist
            nicht erforderlich.
          </p>
        )}
        <button
          className={styles.primary}
          disabled={
            isTrainer ? !users.length : data.user.accountType !== "athlete"
          }
        >
          Training starten
        </button>
        <button type="button" onClick={cancel}>
          Zurück
        </button>
      </fieldset>
    </form>
  );
}

/** Live-Training: Versuche zählen, Timer, Anwesenheit und Notizen. */
export function SessionView({
  session,
  blocked,
  run,
  onDirty,
  initialExercise,
}: {
  initialExercise: number;
  session: TrainingSession;
  blocked: boolean;
  run: Run;
  onDirty: (dirty: boolean) => void;
}) {
  const [exerciseIndex, setExerciseIndex] = useState(
    Math.max(0, Math.min(session.exercises.length - 1, initialExercise)),
  );
  const [participantIndex, setParticipantIndex] = useState(0);
  const [now, setNow] = useState(0);
  const [finish, setFinish] = useState(false);
  const carousel = useRef<HTMLDivElement>(null);
  // Entwürfe bleiben bei Konflikten erhalten; bestätigte Wiederholungen werden
  // automatisch sauber, sobald der Server denselben Notiztext zurückliefert.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const notesDirty = Object.entries(noteDrafts).some(
    ([key, value]) =>
      value !==
      (key === "session"
        ? session.note
        : session.exercises.find((e) => e.id === key)?.note),
  );
  useEffect(() => {
    onDirty(notesDirty);
  }, [notesDirty, onDirty]);
  const completed = session.status === "completed";
  const exercise = session.exercises[exerciseIndex];
  const disabled = blocked || completed;
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const command: Run = (op, payload) =>
    run(op, { session_id: session.id, revision: session.revision, ...payload });
  function selectRider(index: number) {
    const n = Math.max(0, Math.min(session.participants.length - 1, index));
    setParticipantIndex(n);
    if (carousel.current)
      carousel.current.scrollTo({
        left: n * (carousel.current.clientWidth + 12),
        behavior: "instant",
      });
  }
  if (!exercise) return <p>Keine Übungen in diesem Training.</p>;
  const seconds = Math.floor(
    timerMilliseconds(exercise, now || Date.parse(session.started_at)) / 1000,
  );
  return (
    <div className={styles.session}>
      <span className={styles.pill}>
        {session.mode === "self"
          ? "Selbsttraining"
          : session.mode === "group"
            ? "Trainer · Gruppe"
            : "Trainer · Einzelner Fahrer"}
      </span>
      {completed && (
        <div className={styles.notice}>
          Training abgeschlossen und gespeichert ·{" "}
          {new Date(session.completed_at!).toLocaleString("de-DE")}. Änderungen
          sind gesperrt.
        </div>
      )}
      <label>
        Übung
        <select
          value={exerciseIndex}
          disabled={blocked || notesDirty}
          onChange={(e) => {
            const n = Number(e.target.value);
            setExerciseIndex(n);
            const url = new URL(window.location.href);
            url.searchParams.set("exercise", String(n));
            window.history.replaceState(null, "", url);
          }}
        >
          {session.exercises.map((e, i) => (
            <option key={e.id} value={i}>
              {i + 1}. {e.content.name}
            </option>
          ))}
        </select>
      </label>
      <h2>{exercise.content.name}</h2>
      <p>{exercise.content.targetValue}</p>
      {exercise.content.trainerNote && (
        <p className={styles.muted}>{exercise.content.trainerNote}</p>
      )}
      <div className={`${styles.card} ${styles.row}`}>
        <strong className={styles.timer}>
          {Math.floor(seconds / 60)
            .toString()
            .padStart(2, "0")}
          :{(seconds % 60).toString().padStart(2, "0")}
        </strong>
        <button
          disabled={disabled}
          onClick={() =>
            void command("timer", {
              exercise_id: exercise.id,
              action: exercise.timer_started_at ? "pause" : "start",
            })
          }
        >
          {exercise.timer_started_at
            ? "Timer pausieren"
            : "Timer starten / fortsetzen"}
        </button>
      </div>
      {session.mode !== "self" && (
        <details>
          <summary>
            Anwesenheit · {session.participants.filter((p) => p.present).length}{" "}
            anwesend
          </summary>
          {session.participants.map((p) => (
            <label className={styles.check} key={p.id}>
              <input
                type="checkbox"
                checked={p.present}
                disabled={disabled}
                onChange={(e) =>
                  void command("attendance", {
                    participant_id: p.id,
                    present: e.target.checked,
                  })
                }
              />
              {p.athlete.display_name}
            </label>
          ))}
        </details>
      )}
      {session.mode === "group" && (
        <>
          <div className={styles.picker} aria-label="Fahrer auswählen">
            <button
              aria-label="Vorheriger Fahrer"
              disabled={participantIndex === 0}
              onClick={() => selectRider(participantIndex - 1)}
            >
              ‹
            </button>
            <div className={styles.names}>
              {session.participants.map((p, i) => (
                <button
                  key={p.id}
                  aria-pressed={i === participantIndex}
                  onClick={() => selectRider(i)}
                >
                  {p.athlete.display_name}
                </button>
              ))}
            </div>
            <button
              aria-label="Nächster Fahrer"
              disabled={participantIndex === session.participants.length - 1}
              onClick={() => selectRider(participantIndex + 1)}
            >
              ›
            </button>
          </div>
          <p className={styles.muted}>
            {participantIndex + 1} von {session.participants.length} Fahrern ·
            nach links/rechts wischen
          </p>
        </>
      )}
      <div
        className={styles.carousel}
        ref={carousel}
        onScroll={(e) => {
          const n = Math.round(
            e.currentTarget.scrollLeft / (e.currentTarget.clientWidth + 12),
          );
          setParticipantIndex(
            Math.max(0, Math.min(session.participants.length - 1, n)),
          );
        }}
      >
        {session.participants.map((p, i) => {
          const counts = attemptSummary(session, p.id, exercise.id);
          return (
            <article
              className={styles.card}
              key={p.id}
              inert={session.mode === "group" && i !== participantIndex}
            >
              <h3>
                {session.mode === "self"
                  ? "Deine Versuche"
                  : p.athlete.display_name}
              </h3>
              <p aria-live="polite">
                {counts.attempts
                  ? `${counts.landed} / ${counts.attempts} gestanden · ${counts.percent} %`
                  : "Noch keine Versuche · Quote —"}
              </p>
              {!p.present && <p>Als abwesend markiert</p>}
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  disabled={disabled || !p.present}
                  onClick={() =>
                    void command("attempt", {
                      participant_id: p.id,
                      exercise_id: exercise.id,
                      landed: true,
                    })
                  }
                >
                  <Skateboard />
                  Gestanden
                </button>
                <button
                  disabled={disabled || !p.present}
                  onClick={() =>
                    void command("attempt", {
                      participant_id: p.id,
                      exercise_id: exercise.id,
                      landed: false,
                    })
                  }
                >
                  Nicht gestanden
                </button>
              </div>
              <button
                className={styles.undo}
                disabled={disabled || !counts.attempts}
                onClick={() =>
                  void command("undo", {
                    participant_id: p.id,
                    exercise_id: exercise.id,
                  })
                }
              >
                ↶ Letzten Versuch rückgängig
              </button>
            </article>
          );
        })}
      </div>
      <NoteEditor
        key={exercise.id}
        label="Übungsnotiz"
        value={exercise.note}
        draft={noteDrafts[exercise.id] ?? exercise.note}
        disabled={disabled}
        onChange={(value) =>
          setNoteDrafts((current) => ({ ...current, [exercise.id]: value }))
        }
        save={(note) =>
          command("exercise_note", { exercise_id: exercise.id, note })
        }
      />
      <NoteEditor
        label="Trainingsnotiz"
        value={session.note}
        draft={noteDrafts.session ?? session.note}
        disabled={disabled}
        onChange={(value) =>
          setNoteDrafts((current) => ({ ...current, session: value }))
        }
        save={(note) => command("session_note", { note })}
      />
      {!completed &&
        (finish ? (
          <div className={styles.card}>
            <h3>Training endgültig abschließen?</h3>
            <p>
              Danach bleiben Ergebnisse unveränderlich. Laufende Timer werden
              gestoppt.
            </p>
            <button
              className={styles.primary}
              disabled={blocked || notesDirty}
              onClick={() => void command("complete", {})}
            >
              Abschließen und speichern
            </button>
            <button onClick={() => setFinish(false)}>Weiter trainieren</button>
          </div>
        ) : (
          <button
            disabled={blocked || notesDirty}
            onClick={() => setFinish(true)}
          >
            Training beenden
          </button>
        ))}
    </div>
  );
}

/** Kontrollierter Entwurf: Speicherbestätigung und lokale Eingabe bleiben getrennt. */
function NoteEditor({
  label,
  value,
  draft,
  disabled,
  save,
  onChange,
}: {
  label: string;
  value: string;
  draft: string;
  disabled: boolean;
  save: (note: string) => Promise<boolean>;
  onChange: (value: string) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(draft);
      }}
    >
      <label>
        {label}
        <textarea
          maxLength={4000}
          disabled={disabled}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <button disabled={disabled || draft === value}>Notiz speichern</button>
    </form>
  );
}
