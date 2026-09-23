"use client";

import Link from "next/link";
import { shareTrainingPlanSnapshot } from "@/app/trainingsplaene/actions";
import { useEffect, useRef, useState } from "react";
import type { TrainingPlan } from "@/domain/models";
import {
  attemptSummary,
  timerMilliseconds,
  type TrainingCommand,
  type TrainingReply,
  type TrainingSession,
  type TrainingWorkspace,
} from "@/domain/training";
import styles from "./training.module.css";

type Run = (
  operation: string,
  payload: Record<string, unknown>,
) => Promise<boolean>;
const uuid = () => crypto.randomUUID();
function newPlan(): TrainingPlan {
  return {
    id: uuid(),
    title: "",
    category: "",
    version: "0",
    author: "Eigener Plan",
    ownerLevel: "club",
    sharedWith: [],
    updatedAt: "",
    description: "",
    status: "active",
    visibility: "private",
    isTemplate: false,
    assignedGroups: [],
    assignedAthletes: [],
    sharedTrainers: [],
    goals: [],
    tricks: [],
  };
}
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

/** Ein bestätigter Serverstand ist die einzige Quelle für angezeigte Zählwerte.
 * Fehler halten den identischen Command für einen sicheren Wiederholungsversuch.
 */
export function TrainingWorkspaceView({
  initial,
  initialSessionId = null,
  initialExercise = 0,
}: {
  initial: TrainingWorkspace | null;
  initialSessionId?: string | null;
  initialExercise?: number;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState(
    initial ? "" : "Trainings konnten nicht geladen werden.",
  );
  const [pending, setPending] = useState<TrainingCommand | null>(null);
  const [conflict, setConflict] = useState(false);
  const [editor, setEditor] = useState<TrainingPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [startId, setStartId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const session = data?.sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || pending || busy) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending, busy]);

  function openSession(id: string | null) {
    setSessionId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("session", id);
    else url.searchParams.delete("session");
    url.searchParams.delete("exercise");
    window.history.replaceState(null, "", url);
  }
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/training", { cache: "no-store" });
      if (!response.ok) throw Error();
      setData(await response.json());
      setPending(null);
      setConflict(false);
      setMessage(
        "Aktueller Stand geladen. Offene Eingaben bitte vergleichen und bei Bedarf erneut speichern.",
      );
    } catch {
      setMessage("Laden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function send(command: TrainingCommand) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setMessage("Wird gespeichert …");
    let success = false;
    try {
      const response = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = (await response.json()) as TrainingReply;
      if (!result.ok) {
        setPending(command);
        setConflict(Boolean(result.conflict));
        setMessage(result.message);
      } else {
        setData(result.workspace);
        setPending(null);
        setConflict(false);
        setMessage("Alles gespeichert.");
        if (command.operation === "session_start" && result.result.session_id) {
          openSession(result.result.session_id);
          setStartId(null);
        }
        if (command.operation === "plan_save") {
          setEditor(null);
          setDirty(false);
        }
        success = true;
      }
    } catch {
      setPending(command);
      setMessage(
        "Noch nicht gespeichert oder bestätigt. Lass die Seite offen und versuche es erneut.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
    return success;
  }
  const run: Run = async (operation, payload) =>
    pending ? false : send({ request_id: uuid(), operation, payload });
  const blocked = busy || Boolean(pending);
  const saved = data?.plans.find((p) => p.id === editor?.id);
  const startPlan = startId?.startsWith("shared-")
    ? data?.shares.find((p) => p.id === startId)
    : data?.plans.find((p) => p.id === startId)?.versions[0]?.content;

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>TRAINING</span>
          <h1>{session ? session.plan_snapshot.title : "Trainingspläne"}</h1>
        </div>
        <Link href="/trainingsplaene/freigaben">
          Freigaben & bisherige Fortschritte
        </Link>
      </header>
      {message && (
        <div
          className={pending || !data ? styles.error : styles.notice}
          role="status"
        >
          {message}
          {pending && !conflict && (
            <button disabled={busy} onClick={() => void send(pending)}>
              Speichern erneut versuchen
            </button>
          )}
          {(pending || !data) && (
            <button disabled={busy} onClick={() => void load()}>
              Aktuellen Stand laden
            </button>
          )}
        </div>
      )}
      {!data ? (
        <p>Deine Trainings werden erst nach erfolgreichem Abruf angezeigt.</p>
      ) : session ? (
        <>
          <button disabled={blocked || dirty} onClick={() => openSession(null)}>
            ← Meine Trainings
          </button>
          <SessionView
            key={session.id}
            initialExercise={
              session.id === initialSessionId ? initialExercise : 0
            }
            session={session}
            blocked={blocked}
            run={run}
            onDirty={setDirty}
          />
        </>
      ) : sessionId ? (
        <div className={styles.error}>
          Dieses Training ist nicht verfügbar oder du hast keinen Zugriff mehr.
          <button onClick={() => openSession(null)}>Zur Übersicht</button>
        </div>
      ) : editor ? (
        <PlanEditor
          key={editor.id}
          initial={editor}
          revision={saved?.versions[0]?.version_number ?? 0}
          blocked={blocked}
          run={run}
          onDirty={setDirty}
          cancel={() => {
            setEditor(null);
            setDirty(false);
          }}
        />
      ) : startPlan ? (
        <StartTraining
          plan={startPlan}
          data={data}
          blocked={blocked}
          run={run}
          cancel={() => setStartId(null)}
        />
      ) : (
        <>
          {data.sessions.some((s) => s.status === "running") && (
            <section>
              <h2>Laufende Trainings</h2>
              <div className={styles.grid}>
                {data.sessions
                  .filter((s) => s.status === "running")
                  .map((s) => (
                    <article className={styles.card} key={s.id}>
                      <span className={styles.pill}>
                        {s.mode === "self"
                          ? "Selbsttraining"
                          : "Betreutes Training"}
                      </span>
                      <h3>{s.plan_snapshot.title}</h3>
                      <p>
                        {new Date(s.started_at).toLocaleDateString("de-DE")} ·{" "}
                        {s.participants.length} Teilnehmer
                      </p>
                      <button
                        className={styles.primary}
                        onClick={() => openSession(s.id)}
                      >
                        Training fortsetzen
                      </button>
                    </article>
                  ))}
              </div>
            </section>
          )}
          <section>
            <div className={styles.row}>
              <h2>Eigene Pläne</h2>
              <button
                className={styles.primary}
                onClick={() => setEditor(newPlan())}
              >
                + Plan erstellen
              </button>
            </div>
            {!data.plans.length && (
              <p>
                Noch kein eigener Plan. Erstelle deine Übungen – auch ohne
                Verein.
              </p>
            )}
            <div className={styles.grid}>
              {data.plans.map((p) => {
                const v = p.versions[0];
                return (
                  <article className={styles.card} key={p.id}>
                    <h3>{p.title}</h3>
                    <p>
                      Version {v?.version_number} ·{" "}
                      {v?.content.tricks.length ?? 0} Übungen
                    </p>
                    <div className={styles.row}>
                      <button
                        disabled={!v}
                        className={styles.primary}
                        onClick={() => setStartId(p.id)}
                      >
                        Training starten
                      </button>
                      <button
                        disabled={!v}
                        onClick={() => setEditor(v.content)}
                      >
                        Bearbeiten
                      </button>
                    </div>
                    {v && (
                      <SharePlan plan={v.content} people={data.sharePeople} />
                    )}
                    <details>
                      <summary>Planversionen</summary>
                      {p.versions.map((version) => (
                        <p key={version.id}>
                          Version {version.version_number} ·{" "}
                          {new Date(version.created_at).toLocaleString("de-DE")}{" "}
                          · {version.content.title}
                        </p>
                      ))}
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
          {!!data.shares.length && (
            <section>
              <h2>Geteilte Pläne</h2>
              <div className={styles.grid}>
                {data.shares.map((p) => (
                  <article className={styles.card} key={p.id}>
                    <h3>{p.title}</h3>
                    <p>
                      {p.tricks.length} Übungen · unveränderlicher Freigabestand
                    </p>
                    <button
                      className={styles.primary}
                      onClick={() => setStartId(p.id)}
                    >
                      Training starten
                    </button>
                    <Link
                      href={`/trainingsplaene/freigaben?plan=${encodeURIComponent(p.id)}`}
                    >
                      Freigabe ansehen
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2>Abgeschlossene Trainings</h2>
            {!data.sessions.some((s) => s.status === "completed") && (
              <p>Noch kein Training abgeschlossen.</p>
            )}
            {data.sessions
              .filter((s) => s.status === "completed")
              .map((s) => (
                <button
                  className={styles.history}
                  key={s.id}
                  onClick={() => openSession(s.id)}
                >
                  {s.plan_snapshot.title} ·{" "}
                  {new Date(s.completed_at!).toLocaleDateString("de-DE")} →
                </button>
              ))}
          </section>
        </>
      )}
    </div>
  );
}

function PlanEditor({
  initial,
  revision,
  blocked,
  run,
  onDirty,
  cancel,
}: {
  initial: TrainingPlan;
  revision: number;
  blocked: boolean;
  run: Run;
  onDirty: (dirty: boolean) => void;
  cancel: () => void;
}) {
  const [plan, setPlan] = useState(initial);
  function change(patch: Partial<TrainingPlan>) {
    setPlan((p) => ({ ...p, ...patch }));
    onDirty(true);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run("plan_save", { id: plan.id, revision, content: plan });
      }}
    >
      <fieldset disabled={blocked} className={styles.form}>
        <h2>{revision ? "Plan bearbeiten" : "Dein Trainingsplan"}</h2>
        <p>
          Änderungen erzeugen eine neue Version. Laufende Trainings behalten
          ihren Planstand.
        </p>
        <label>
          Name
          <input
            required
            maxLength={160}
            value={plan.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        <label>
          Ziel / Beschreibung
          <textarea
            maxLength={4000}
            value={plan.description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </label>
        {plan.tricks.map((trick, index) => (
          <div className={styles.card} key={trick.id}>
            <label>
              Übung {index + 1}
              <input
                required
                maxLength={160}
                value={trick.name}
                onChange={(e) =>
                  change({
                    tricks: plan.tricks.map((t) =>
                      t.id === trick.id ? { ...t, name: e.target.value } : t,
                    ),
                  })
                }
              />
            </label>
            <label>
              Ziel
              <input
                maxLength={160}
                value={trick.targetValue ?? ""}
                onChange={(e) =>
                  change({
                    tricks: plan.tricks.map((t) =>
                      t.id === trick.id
                        ? { ...t, targetValue: e.target.value }
                        : t,
                    ),
                  })
                }
              />
            </label>
            <label>
              Hinweis
              <textarea
                maxLength={4000}
                value={trick.trainerNote ?? ""}
                onChange={(e) =>
                  change({
                    tricks: plan.tricks.map((t) =>
                      t.id === trick.id
                        ? { ...t, trainerNote: e.target.value }
                        : t,
                    ),
                  })
                }
              />
            </label>
            <div className={styles.row}>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  const next = [...plan.tricks];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  change({
                    tricks: next.map((t, i) => ({ ...t, sortOrder: i })),
                  });
                }}
              >
                Nach oben
              </button>
              <button
                type="button"
                onClick={() =>
                  change({
                    tricks: plan.tricks.filter((t) => t.id !== trick.id),
                  })
                }
              >
                Übung entfernen
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={plan.tricks.length >= 100}
          onClick={() =>
            change({
              tricks: [
                ...plan.tricks,
                {
                  id: uuid(),
                  name: "",
                  group: "Allgemein",
                  level: 1,
                  targetType: "free",
                  targetValue: "",
                  trainerNote: "",
                  sortOrder: plan.tricks.length,
                  athleteId: "",
                  status: "not_started",
                },
              ],
            })
          }
        >
          + Übung hinzufügen
        </button>
        <div className={styles.row}>
          <button className={styles.primary} disabled={!plan.tricks.length}>
            Version {revision + 1} speichern
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Ungespeicherte Planänderungen verwerfen?"))
                cancel();
            }}
          >
            Abbrechen
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function StartTraining({
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

function SessionView({
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

/** Freigaben verwenden unverändert den bestehenden serverseitigen RLS-Pfad. */
function SharePlan({
  plan,
  people,
}: {
  plan: TrainingPlan;
  people: TrainingWorkspace["sharePeople"];
}) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const guard = useRef(false);
  const [notice, setNotice] = useState("");
  return (
    <details>
      <summary>Plan freigeben</summary>
      <p>Teilt diese feste Version mit bestätigten Kontakten.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (guard.current) return;
          guard.current = true;
          setPending(true);
          try {
            const result = await shareTrainingPlanSnapshot({
              plan,
              recipientUserIds: recipients,
            });
            setNotice(result.message);
          } catch {
            setNotice(
              "Freigabe konnte nicht bestätigt werden. Bitte prüfe die bisherigen Freigaben.",
            );
          } finally {
            guard.current = false;
            setPending(false);
          }
        }}
      >
        <fieldset disabled={pending} className={styles.form}>
          {people.map((person) => (
            <label className={styles.check} key={person.id}>
              <input
                type="checkbox"
                checked={recipients.includes(person.id)}
                onChange={(event) =>
                  setRecipients(
                    event.target.checked
                      ? [...recipients, person.id]
                      : recipients.filter((id) => id !== person.id),
                  )
                }
              />
              {person.name}
            </label>
          ))}
          {!people.length && <p>Keine bestätigten Kontakte vorhanden.</p>}
          <button disabled={!recipients.length}>Version freigeben</button>
        </fieldset>
      </form>
      <p role="status">{notice}</p>
    </details>
  );
}
