"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrainingPlan } from "@/domain/models";
import type { SessionExercise, TrainingSession, TrainingWorkspace } from "@/domain/training";
import {
  activeMs,
  attemptLabel,
  clock,
  counts,
  exerciseTotals,
  firstName,
  hm,
  initials,
  isLine,
  lineStats,
  lineTricks,
  minutes,
  mostBrokenAt,
  toneOf,
} from "@/domain/live-training";
import { timerMilliseconds } from "@/domain/training";
import { useNoteChannel, type NoteStatus } from "./use-training-workspace";
import { AttendanceSheet, EndDialog, PauseScreen, Summary, SyncBanner, SyncDot } from "./live-parts";
import { Bar, modeLabel, readyEntry, useNow, type LiveContext, type Run } from "./live-shared";
import styles from "./training.module.css";

export type { LiveContext, PlanStepLookup, Run } from "./live-shared";

/* ------------------------------------------------------------------ */
/* Start                                                                */
/* ------------------------------------------------------------------ */

/** Auswahl der Anwesenden vor dem Start eines Live-Trainings (nur Trainer). */
export function StartTraining({
  plan,
  data,
  assigned,
  blocked,
  run,
  cancel,
}: {
  plan: TrainingPlan;
  data: TrainingWorkspace;
  /** Athleten, denen der Plan zugewiesen ist – zuerst und vorausgewählt. */
  assigned: string[];
  blocked: boolean;
  run: Run;
  cancel: () => void;
}) {
  const people = data.people;
  const [mode, setMode] = useState<"individual" | "group">(
    assigned.length === 1 ? "individual" : "group",
  );
  const preselected = people.filter((p) => assigned.includes(p.id)).map((p) => p.id);
  const [selected, setSelected] = useState<string[]>(preselected);
  const [one, setOne] = useState<string | null>(preselected[0] ?? null);
  const [query, setQuery] = useState("");
  const version = data.plans.find((p) => p.id === plan.id)?.versions[0];
  const group = mode === "group";
  const chosen = group ? selected : one ? [one] : [];
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";

  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const map = new Map<string, typeof people>();
    for (const person of people) {
      const key = person.group || "Athleten";
      map.set(key, [...(map.get(key) ?? []), person]);
    }
    return [...map.entries()]
      .map(([name, members]) => ({
        name,
        members,
        rows: members
          .filter((p) => !needle || p.name.toLowerCase().includes(needle))
          .sort((a, b) => Number(assigned.includes(b.id)) - Number(assigned.includes(a.id)) || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) =>
        Number(b.members.some((p) => assigned.includes(p.id))) - Number(a.members.some((p) => assigned.includes(p.id))) ||
        a.name.localeCompare(b.name),
      );
  }, [people, needle, assigned]);
  const visible = groups.filter((g) => g.rows.length);

  const start = () => {
    if (!chosen.length || blocked) return;
    void run(
      "session_start",
      {
        source: plan.id.startsWith("shared-") ? "share" : "plan",
        plan_id: plan.id.startsWith("shared-") ? undefined : plan.id,
        share_id: plan.id.startsWith("shared-") ? plan.id.slice(7) : undefined,
        version_id: version?.id,
        mode,
        users: chosen,
      },
      "Training starten",
    );
  };
  const startLabel = chosen.length
    ? group
      ? `Training starten · ${chosen.length} Anwesende`
      : `Training mit ${firstName(nameOf(chosen[0]))} starten`
    : "Mindestens eine Person wählen";
  const versionLabel = `${plan.title} · Version ${version?.version_number ?? plan.version}`;

  const modes = (
    <div className={styles.modes}>
      {(
        [
          ["individual", "Einzel", "Eine Person · große Buttons"],
          ["group", "Gruppe", "Liste mit ✓ / ✗ je Person"],
        ] as const
      ).map(([key, label, sub]) => (
        <button
          key={key}
          type="button"
          className={styles.modeCard}
          aria-pressed={mode === key}
          onClick={() => setMode(key)}
        >
          <strong>{label}</strong>
          <small>{sub}</small>
        </button>
      ))}
    </div>
  );
  const startButton = (
    <button type="button" className={styles.startButton} disabled={!chosen.length || blocked} onClick={start}>
      {startLabel}
    </button>
  );

  return (
    <div className={`${styles.live} ${styles.startScreen}`}>
      <header className={styles.mobileHead}>
        <button type="button" className={styles.round} aria-label="Abbrechen" onClick={cancel}>
          ✕
        </button>
        <span className={styles.headText}>
          <strong>Training starten</strong>
          <small>{versionLabel}</small>
        </span>
      </header>
      <header className={styles.deskHead}>
        <div>
          <span className={styles.kicker}>{versionLabel}</span>
          <h1 className={styles.deskTitle}>Training starten</h1>
        </div>
        <button type="button" className={styles.ghost} onClick={cancel}>
          Abbrechen
        </button>
      </header>
      <div className={styles.startGrid}>
        <section className={`${styles.scroll} ${styles.whoCard}`}>
          <div className={styles.mobileOnly}>{modes}</div>
          <div className={styles.whoHead}>
            <div>
              <strong>Wer ist da?</strong>
              <small>
                {group
                  ? "Nur wer wirklich da ist. Kalender-Zusagen zählen nicht als Anwesenheit."
                  : "Wähle die Person, die du trainierst. Kalender-Zusagen zählen nicht als Anwesenheit."}
              </small>
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name suchen"
              aria-label="Name suchen"
            />
          </div>
          {visible.map((g) => {
            const allOn = g.members.every((p) => selected.includes(p.id));
            const count = g.members.filter((p) => selected.includes(p.id)).length;
            return (
              <div key={g.name} className={styles.pickGroup}>
                <div className={styles.pickGroupHead}>
                  <span>
                    {g.name}{" "}
                    <small>· {group ? `${count} von ${g.members.length} gewählt` : `${g.members.length} Athleten`}</small>
                  </span>
                  {group ? (
                    <button
                      type="button"
                      className={styles.smallButton}
                      onClick={() =>
                        setSelected((current) =>
                          allOn
                            ? current.filter((id) => !g.members.some((p) => p.id === id))
                            : [...new Set([...current, ...g.members.map((p) => p.id)])],
                        )
                      }
                    >
                      {allOn ? "Keine der Gruppe" : "Alle der Gruppe"}
                    </button>
                  ) : null}
                </div>
                <div className={styles.pickList} role={group ? "group" : "radiogroup"} aria-label={g.name}>
                  {g.rows.map((p) => {
                    const on = group ? selected.includes(p.id) : one === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role={group ? "checkbox" : "radio"}
                        aria-checked={on}
                        className={styles.pickRow}
                        onClick={() =>
                          group
                            ? setSelected((current) =>
                                current.includes(p.id) ? current.filter((id) => id !== p.id) : [...current, p.id],
                              )
                            : setOne(p.id)
                        }
                      >
                        <span className={group ? styles.checkBox : styles.radioBox} aria-hidden="true">
                          {on ? (group ? "✓" : "") : ""}
                        </span>
                        <span className={styles.pickName}>
                          {p.name}
                          {assigned.includes(p.id) ? <span className={styles.assignedBadge}>Zugewiesen</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!people.length ? (
            <p className={styles.muted}>
              Keine aktiv zugeordneten Athleten vorhanden. Stelle zuerst eine bestätigte Trainer-Athlet-Verbindung her.
            </p>
          ) : !visible.length ? (
            <p className={styles.empty}>Niemand gefunden.</p>
          ) : null}
        </section>
        <aside className={`${styles.card} ${styles.startSide}`}>
          <span className={styles.sideLabel}>Art des Trainings</span>
          {modes}
          <div className={styles.chosen}>
            <span className={styles.sideLabel}>Ausgewählt</span>
            <strong>{chosen.length ? chosen.map((id) => firstName(nameOf(id))).join(", ") : "Noch niemand"}</strong>
          </div>
          {startButton}
        </aside>
      </div>
      <footer className={styles.mobileFoot}>{startButton}</footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Session                                                              */
/* ------------------------------------------------------------------ */

function setExerciseParam(index: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("exercise", String(index));
  window.history.replaceState(null, "", url);
}

/** Live-Training: Versuche, Timer, Anwesenheit, Notizen, Pause und Abschluss. */
export function SessionView({
  session,
  title,
  initialExercise,
  ctx,
}: {
  session: TrainingSession;
  title: string;
  initialExercise: number;
  ctx: LiveContext;
}) {
  const { channel, notify } = ctx;
  const completed = session.status === "completed";
  const paused = Boolean(session.paused_at) && !completed;
  const now = useNow(!completed);
  const [index, setIndex] = useState(
    Math.max(0, Math.min(session.exercises.length - 1, initialExercise)),
  );
  const [sheet, setSheet] = useState<"end" | "attendance" | null>(null);
  const [lineMiss, setLineMiss] = useState<string | null>(null);
  const notes = useNoteChannel(session.id, channel.accept);

  const exercise = session.exercises[index];
  const trainer = session.mode !== "self";
  const group = session.mode === "group";
  const present = session.participants.filter((p) => p.present);
  const absent = session.participants.filter((p) => !p.present);
  const sync = channel.sync;
  const dim = sync === "pending" || sync === "conflict";
  const locked = channel.blocked || paused || completed;

  const command = useCallback(
    (op: string, payload: Record<string, unknown>, label: string) =>
      channel.run(op, { session_id: session.id, revision: session.revision, ...payload }, label),
    [channel, session.id, session.revision],
  );

  const goTo = useCallback(
    (next: number) => {
      const n = Math.max(0, Math.min(session.exercises.length - 1, next));
      setIndex(n);
      setLineMiss(null);
      setExerciseParam(n);
    },
    [session.exercises.length],
  );

  const attempt = useCallback(
    (participantId: string, landed: boolean, brokeAt: number | null = null) => {
      if (!exercise) return;
      const person = session.participants.find((p) => p.id === participantId);
      setLineMiss(null);
      void command(
        "attempt",
        {
          participant_id: participantId,
          exercise_id: exercise.id,
          landed,
          ...(isLine(exercise) ? { broke_at: landed ? null : brokeAt } : {}),
        },
        attemptLabel(exercise, landed, brokeAt, trainer && person ? firstName(person.athlete.display_name) : null),
      );
    },
    [command, exercise, session.participants, trainer],
  );

  // Desktop-Einzeltraining: Taste G = gestanden, N = nicht gestanden.
  useEffect(() => {
    if (group || !exercise || isLine(exercise) || completed) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || target?.closest("input, textarea, select, [contenteditable]")) return;
      if (locked || sheet) return;
      const key = event.key.toLowerCase();
      if (key === "g") attempt(session.participants[0].id, true);
      if (key === "n") attempt(session.participants[0].id, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, exercise, completed, locked, sheet, attempt, session.participants]);

  if (completed) {
    return <Summary session={session} title={title} ctx={ctx} now={now} />;
  }
  if (!exercise) return <p className={styles.empty}>Keine Übungen in diesem Training.</p>;

  const line = isLine(exercise);
  const chain = lineTricks(exercise);
  const total = exerciseTotals(session, exercise.id);
  const elapsed = clock(activeMs(session, now));
  const isLast = index === session.exercises.length - 1;
  const current = channel.current;
  const inflightFor = (participantId: string) =>
    current &&
    sync !== "idle" &&
    current.payload.participant_id === participantId &&
    current.payload.exercise_id === exercise.id &&
    ["attempt", "undo", "progress"].includes(current.operation);
  const pendingText = () => {
    const action = (current?.label ?? "").split(" · ")[0];
    return sync === "busy"
      ? `${action} · speichert …`
      : sync === "pending"
        ? `${action} · nicht bestätigt`
        : `${action} · Konflikt`;
  };

  /* Timer */
  const timerMs = timerMilliseconds(exercise, now);
  const running = Boolean(exercise.timer_started_at);
  const timerLabel = running ? "❚❚ Pause" : timerMs >= 1000 ? "▶ Weiter" : "▶ Timer starten";
  const toggleTimer = () =>
    void command(
      "timer",
      { exercise_id: exercise.id, action: running ? "pause" : "start" },
      running ? "Timer pausieren" : "Timer starten",
    );
  const timer = (compact: boolean) => (
    <div className={compact ? styles.timerInline : `${styles.card} ${styles.timerCard}`}>
      <span className={styles.timerValue} data-running={running}>
        {clock(timerMs)}
        {compact ? null : <small>Übungszeit</small>}
      </span>
      <button
        type="button"
        className={styles.timerButton}
        data-running={running}
        data-dim={dim}
        disabled={locked}
        onClick={toggleTimer}
      >
        {timerLabel}
      </button>
    </div>
  );

  /* Rückgängig: letzte bestätigte Eingabe der aktuellen Übung */
  const recent = session.recent?.find((entry) => entry.exercise_id === exercise.id);
  const recentPerson = recent ? session.participants.find((p) => p.id === recent.participant_id) : null;
  const undoLabel = recent
    ? `Rückgängig: ${attemptLabel(exercise, recent.landed, recent.broke_at, group && recentPerson ? firstName(recentPerson.athlete.display_name) : null)}`
    : "Rückgängig";
  const undo = (
    <button
      type="button"
      className={styles.undo}
      disabled={!recent || locked}
      onClick={() =>
        recent &&
        void command(
          "undo",
          { participant_id: recent.participant_id, exercise_id: exercise.id },
          `Rückgängig${recentPerson && trainer ? ` · ${firstName(recentPerson.athlete.display_name)}` : ""}`,
        )
      }
    >
      ↶ {undoLabel}
    </button>
  );

  /* Bereit für den Plan */
  const readyFor = (participantId: string, ex: SessionExercise) =>
    readyEntry(session, participantId, ex, trainer, ctx, command);
  const scope = group ? present.map((p) => p.id) : [session.participants[0].id];
  const readyNow = scope.map((id) => readyFor(id, exercise)).filter((entry) => entry !== null);

  /* Einzel / Selbst */
  const me = session.participants[0];
  const mine = counts(session, me.id, exercise.id);
  const quoteCard = (
    <div className={`${styles.card} ${styles.quoteCard}`}>
      <div className={styles.quoteTop}>
        <span>{session.mode === "self" ? "Deine Versuche" : me.athlete.display_name}</span>
        <span className={styles.quotePill} data-tone={toneOf(mine.pct)}>
          {mine.pct === null ? "Quote —" : `${mine.pct} %`}
        </span>
      </div>
      <div className={styles.quoteBig} aria-live="polite">
        <strong>{mine.landed}</strong>
        <span>/ {mine.attempts}</span>
        <small>{line ? "Lines komplett" : "gestanden"}</small>
      </div>
      <Bar pct={mine.pct} />
      {inflightFor(me.id) ? (
        <div className={styles.rowPending} data-sync={sync}>
          {pendingText()}
        </div>
      ) : null}
    </div>
  );
  const single = (
    <div className={styles.single}>
      {quoteCard}
      {line ? (
        <div className={styles.lineInputs}>
          <button
            type="button"
            className={styles.bigYes}
            data-line
            data-dim={dim}
            disabled={locked || !me.present}
            onClick={() => attempt(me.id, true)}
          >
            <span aria-hidden="true">✓</span> Line komplett gestanden
          </button>
          <span className={styles.missLabel}>Rausgefallen bei …</span>
          <div className={styles.missGrid}>
            {chain.map((name, k) => (
              <button
                type="button"
                key={`${name}-${k}`}
                className={styles.missButton}
                data-dim={dim}
                disabled={locked || !me.present}
                onClick={() => attempt(me.id, false, k)}
              >
                <small>✗ {k + 1}</small>
                <strong>{name}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.bigButtons}>
          <button
            type="button"
            className={styles.bigNo}
            data-dim={dim}
            disabled={locked || !me.present}
            onClick={() => attempt(me.id, false)}
          >
            <span aria-hidden="true">✗</span>
            <strong>Nicht gestanden</strong>
            <small className={styles.deskOnly}>Taste N</small>
          </button>
          <button
            type="button"
            className={styles.bigYes}
            data-dim={dim}
            disabled={locked || !me.present}
            onClick={() => attempt(me.id, true)}
          >
            <span aria-hidden="true">✓</span>
            <strong>Gestanden</strong>
            <small className={styles.deskOnly}>Taste G</small>
          </button>
        </div>
      )}
    </div>
  );

  /* Gruppe */
  const groupList = (
    <div className={styles.groupBlock}>
      <div className={styles.groupHead}>
        <span>{present.length} anwesend</span>
        <button type="button" className={styles.linkButton} onClick={() => setSheet("attendance")}>
          Anwesenheit ändern
        </button>
      </div>
      <div className={styles.groupList}>
        <div className={styles.groupCols} aria-hidden="true">
          <span>{present.length} anwesend</span>
          <span>Quote</span>
          <span>Gestanden</span>
          <span />
          <span>Eingabe</span>
        </div>
        {present.map((p) => {
          const c = counts(session, p.id, exercise.id);
          const name = p.athlete.display_name;
          const hint = line ? mostBrokenAt(session, exercise, p.id) : "";
          const pend = inflightFor(p.id);
          return (
            <div key={p.id} className={styles.groupItem}>
              <div className={styles.groupRow} data-sync={pend ? sync : undefined}>
                <span className={styles.person}>
                  <span className={styles.avatar} aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className={styles.personText}>
                    <span className={styles.personName}>
                      <strong>{name}</strong>
                      {readyFor(p.id, exercise) ? <span className={styles.readyBadge}>bereit</span> : null}
                    </span>
                    <span className={styles.personStats}>
                      <Bar pct={c.pct} mini />
                      <span>
                        {c.landed}/{c.attempts} · <b className={styles.tone} data-tone={toneOf(c.pct)}>{c.pct === null ? "—" : `${c.pct} %`}</b>
                      </span>
                    </span>
                    {hint ? <span className={styles.hint}>{hint}</span> : null}
                    {pend ? (
                      <span className={styles.rowPending} data-sync={sync}>
                        {pendingText()}
                      </span>
                    ) : null}
                  </span>
                </span>
                <Bar pct={c.pct} desk />
                <span className={styles.deskLa}>
                  {c.landed}/{c.attempts}
                </span>
                <span className={`${styles.quotePill} ${styles.deskOnly}`} data-tone={toneOf(c.pct)}>
                  {c.pct === null ? "—" : `${c.pct} %`}
                </span>
                <span className={styles.rowButtons}>
                  <button
                    type="button"
                    className={styles.rowNo}
                    aria-label={`${line ? "Line nicht komplett" : "Nicht gestanden"} · ${name}`}
                    aria-expanded={line ? lineMiss === p.id : undefined}
                    data-dim={dim}
                    disabled={locked}
                    onClick={() => (line ? setLineMiss(lineMiss === p.id ? null : p.id) : attempt(p.id, false))}
                  >
                    ✗
                  </button>
                  <button
                    type="button"
                    className={styles.rowYes}
                    aria-label={`${line ? "Line komplett" : "Gestanden"} · ${name}`}
                    data-dim={dim}
                    disabled={locked}
                    onClick={() => attempt(p.id, true)}
                  >
                    ✓
                  </button>
                </span>
              </div>
              {line && lineMiss === p.id ? (
                <div className={styles.missRow}>
                  <span>{firstName(name)} raus bei …</span>
                  {chain.map((trick, k) => (
                    <button type="button" key={`${trick}-${k}`} disabled={locked} onClick={() => attempt(p.id, false, k)}>
                      {trick}
                    </button>
                  ))}
                  <button type="button" data-muted disabled={locked} onClick={() => attempt(p.id, false, null)}>
                    Ohne Angabe
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {absent.map((p) => (
          <div key={p.id} className={styles.absentRow}>
            <span>{p.athlete.display_name} · nicht da</span>
            <button
              type="button"
              className={styles.smallButton}
              data-dim={dim}
              disabled={locked}
              onClick={() =>
                void command(
                  "attendance",
                  { participant_id: p.id, present: true },
                  `${firstName(p.athlete.display_name)} anwesend`,
                )
              }
            >
              + Anwesend
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  /* Wo bricht die Line? */
  const stats = line ? lineStats(session, exercise, scope) : [];
  const lineCard = line ? (
    <div className={`${styles.card} ${styles.lineCard}`}>
      <div>
        <strong>Wo bricht die Line?</strong>
        <small>{group ? "Alle Anwesenden · gestanden / erreicht" : "Gestanden / erreicht, pro Trick in der Line"}</small>
      </div>
      {stats.map((t) => (
        <div key={t.index} className={styles.lineStat}>
          <span>
            <span className={styles.lineStatName}>
              {t.index + 1}. {t.name}
              {t.weak ? <span className={styles.weakBadge}>Schwachstelle</span> : null}
            </span>
            <Bar pct={t.pct} thin />
          </span>
          <span className={styles.lineStatLa}>{t.reached ? `${t.landed} / ${t.reached}` : "—"}</span>
          <b className={styles.tone} data-tone={toneOf(t.pct)}>{t.pct === null ? "—" : `${t.pct} %`}</b>
        </div>
      ))}
    </div>
  ) : null;

  const readyCards = readyNow.map((entry) => (
    <div key={entry.key} className={styles.readyCard}>
      <span className={styles.readyText}>
        <span className={styles.readyKicker}>Bereit für den Plan</span>
        <strong>
          {entry.title} · {entry.pctLabel}
        </strong>
        <small>{entry.sub}</small>
      </span>
      <button type="button" data-dim={dim} disabled={locked} onClick={entry.action}>
        {entry.cta}
      </button>
    </div>
  ));

  const noteKeyEx = exercise.id;
  const exNote = notes.drafts[noteKeyEx] ?? exercise.note;
  const sesNote = notes.drafts.session ?? session.note;
  const noteBlocks = (
    <>
      <NoteEditor
        key={exercise.id}
        label={`Notiz zu ${exercise.content.name}`}
        value={exNote}
        status={notes.status[noteKeyEx] ?? "idle"}
        placeholder={group ? "z. B. Mia: Tail-Kontakt jetzt sauber" : "Beobachtungen zur Übung"}
        onChange={(value) => notes.change(noteKeyEx, value)}
        retry={() => void notes.save(noteKeyEx)}
      />
      <NoteEditor
        label="Trainingsnotiz"
        value={sesNote}
        status={notes.status.session ?? "idle"}
        placeholder="Wetter, Park, Stimmung …"
        onChange={(value) => notes.change("session", value)}
        retry={() => void notes.save("session")}
      />
    </>
  );

  const attendanceSide = group ? (
    <div className={`${styles.card} ${styles.attendanceSide}`}>
      <div className={styles.cardHead}>
        <strong>Anwesenheit</strong>
        <small>{present.length} anwesend</small>
      </div>
      <AttendanceToggles session={session} people={ctx.people} disabled={locked} dim={dim} command={command} flat />
    </div>
  ) : null;

  const pauseLabel = "Training pausieren";
  const pause = () => void command("session_pause", {}, pauseLabel).then((ok) => ok && setSheet(null));
  const resume = () => void command("session_resume", {}, "Training fortsetzen");
  const totalsAll = present.reduce(
    (sum, p) => {
      for (const ex of session.exercises) {
        const c = counts(session, p.id, ex.id);
        sum.attempts += c.attempts;
        sum.landed += c.landed;
      }
      return sum;
    },
    { attempts: 0, landed: 0 },
  );
  const activeMinutes = minutes(activeMs(session, now));
  const noteProblem = notes.failed ? "failed" : notes.busy ? "busy" : null;

  const nextLabel = isLast ? "Training beenden" : `Nächste Übung · ${session.exercises[index + 1].content.name} ›`;
  const next = () => (isLast ? setSheet("end") : goTo(index + 1));

  return (
    <div className={`${styles.live} ${styles.sessionScreen}`} data-paused={paused}>
      {/* Mobile Kopfzeile: Sync-Label zuerst und nie gekürzt */}
      <header className={styles.mobileHead}>
        <button type="button" className={styles.round} aria-label="Zurück zum Plan" onClick={ctx.onExit}>
          ‹
        </button>
        <span className={styles.headText}>
          <strong>{title}</strong>
          <span className={styles.syncLine}>
            <SyncDot sync={sync} />
            <span className={styles.syncMeta}>
              · {elapsed} · {modeLabel(session.mode)}
            </span>
          </span>
        </span>
        <button
          type="button"
          className={styles.pauseSquare}
          aria-label="Pausieren"
          data-dim={dim}
          disabled={locked}
          onClick={pause}
        >
          ❚❚
        </button>
        <button type="button" className={styles.endButton} onClick={() => setSheet("end")}>
          Beenden
        </button>
      </header>
      <header className={styles.deskHead}>
        <div>
          <span className={styles.kicker}>Live-Training · {modeLabel(session.mode)}</span>
          <h1 className={styles.deskTitle}>{title}</h1>
        </div>
        <span className={styles.syncPill}>
          <SyncDot sync={sync} />
        </span>
        <span className={styles.durationPill}>
          Dauer <b>{elapsed}</b>
        </span>
        <button type="button" className={styles.ghostStrong} data-dim={dim} disabled={locked} onClick={pause}>
          ❚❚ Pausieren
        </button>
        <button type="button" className={styles.endButtonLarge} onClick={() => setSheet("end")}>
          Training beenden
        </button>
      </header>

      <SyncBanner channel={channel} onReloaded={() => {
          channel.clearMessage();
          notify("Aktueller Stand geladen – bitte Eingabe erneut machen");
        }} />

      <div className={`${styles.scroll} ${styles.sessionGrid}`}>
        <nav className={`${styles.card} ${styles.exList}`} aria-label="Übungen">
          <div className={styles.exListHead}>
            Übungen · {index + 1} / {session.exercises.length}
          </div>
          {session.exercises.map((ex, i) => {
            const t = exerciseTotals(session, ex.id);
            return (
              <button
                type="button"
                key={ex.id}
                className={styles.exItem}
                aria-current={i === index ? "step" : undefined}
                onClick={() => goTo(i)}
              >
                <span className={styles.exNum}>{i + 1}</span>
                <span className={styles.exName}>
                  {ex.content.name}
                  {isLine(ex) ? <span className={styles.lineBadge}>LINE</span> : null}
                </span>
                <span className={styles.quotePill} data-tone={toneOf(t.pct)}>
                  {t.pct === null ? "—" : `${t.pct} %`}
                </span>
              </button>
            );
          })}
        </nav>

        <section className={styles.center}>
          <div className={styles.exHead}>
            <div className={styles.exHeadMain}>
              <div className={styles.progressLine}>
                <span className={styles.kicker}>
                  Übung {index + 1} / {session.exercises.length}
                  {line ? " · Line" : ""}
                </span>
                <span className={`${styles.exQuote} ${styles.mobileOnly}`}>
                  {total.attempts ? `${total.landed}/${total.attempts} · ${total.pct} %` : "Noch keine Versuche"}
                </span>
              </div>
              <div
                className={`${styles.segments} ${styles.mobileOnly}`}
                style={{ gridTemplateColumns: `repeat(${session.exercises.length}, 1fr)` }}
              >
                {session.exercises.map((ex, i) => (
                  <button
                    type="button"
                    key={ex.id}
                    aria-label={`${i + 1}. ${ex.content.name}`}
                    aria-current={i === index ? "step" : undefined}
                    data-done={exerciseTotals(session, ex.id).attempts > 0}
                    onClick={() => goTo(i)}
                  >
                    <span />
                  </button>
                ))}
              </div>
              <h2 className={styles.exTitle}>{exercise.content.name}</h2>
              {line ? (
                <div className={styles.chain}>
                  {chain.map((name, k) => (
                    <span key={`${name}-${k}`} className={styles.chainItem}>
                      <span className={styles.chainChip}>
                        <b>{k + 1}</b>
                        {name}
                      </span>
                      {k < chain.length - 1 ? <span className={styles.chainArrow}>→</span> : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={styles.deskOnly}>{timer(true)}</div>
          </div>

          <div className={styles.goalCard}>
            <div>
              <span className={styles.label}>Ziel</span>
              <strong>{exercise.content.targetValue || "—"}</strong>
            </div>
            <div>
              <span className={styles.label}>Hinweis</span>
              <span>{exercise.content.trainerNote || "—"}</span>
            </div>
          </div>

          <div className={styles.mobileOnly}>{timer(false)}</div>

          {group ? groupList : single}

          <div className={styles.centerFoot}>
            {undo}
            <span className={styles.spacer} />
            <button
              type="button"
              className={`${styles.ghost} ${styles.deskOnly}`}
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
            >
              ‹ Zurück
            </button>
            <button type="button" className={`${styles.nextButton} ${styles.deskOnly}`} data-last={isLast} onClick={next}>
              {nextLabel}
            </button>
          </div>
        </section>

        <aside className={styles.side}>
          {lineCard}
          {readyCards}
          {attendanceSide}
          {noteBlocks}
        </aside>
      </div>

      <footer className={styles.mobileFoot} data-nav>
        <button
          type="button"
          className={styles.prevButton}
          aria-label="Vorherige Übung"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        >
          ‹
        </button>
        <button type="button" className={styles.nextButton} data-last={isLast} onClick={next}>
          {nextLabel}
        </button>
      </footer>

      {paused ? (
        <PauseScreen
          session={session}
          title={title}
          exerciseLabel={(() => {
            const id = session.resume_exercise_id;
            const i = id ? session.exercises.findIndex((e) => e.id === id) : index;
            const at = i >= 0 ? i : index;
            return `Übung ${at + 1}/${session.exercises.length} · ${session.exercises[at].content.name}`;
          })()}
          since={hm(session.paused_at!)}
          elapsed={elapsed}
          attempts={totalsAll.attempts}
          third={
            group
              ? { n: String(present.length), l: "Anwesende" }
              : {
                  n: totalsAll.attempts ? `${Math.round((totalsAll.landed / totalsAll.attempts) * 100)} %` : "—",
                  l: "Quote",
                }
          }
          dim={dim}
          disabled={channel.blocked}
          onResume={resume}
          onLater={ctx.onExit}
          onEnd={() => setSheet("end")}
        />
      ) : null}

      {sheet === "end" ? (
        <EndDialog
          summary={`${totalsAll.attempts} Versuche in ${activeMinutes} Min aktiver Zeit${group ? ` · ${present.length} Anwesende` : ""}.`}
          blocked={
            sync === "pending" || sync === "conflict"
              ? `„${current?.label ?? "Eingabe"}“ ist noch nicht bestätigt. Erst erneut senden bzw. neu laden.`
              : noteProblem === "failed"
                ? "Eine Notiz ist nicht gespeichert. Bitte erneut speichern."
                : noteProblem === "busy"
                  ? "Notiz wird noch gespeichert …"
                  : sync === "busy"
                    ? "Eingabe wird noch gespeichert …"
                    : null
          }
          paused={paused}
          onEnd={() => void command("complete", {}, "Training abschließen").then((ok) => ok && setSheet(null))}
          onPause={pause}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === "attendance" ? (
        <AttendanceSheet onClose={() => setSheet(null)} present={present.length}>
          <AttendanceToggles session={session} people={ctx.people} disabled={locked} dim={dim} command={command} />
        </AttendanceSheet>
      ) : null}
    </div>
  );
}


/** Toggles je Gruppe; Nicht-Teilnehmer lassen sich nachträglich hinzufügen. */
function AttendanceToggles({
  session,
  people,
  disabled,
  dim,
  command,
  flat = false,
}: {
  session: TrainingSession;
  people: TrainingWorkspace["people"];
  disabled: boolean;
  dim: boolean;
  command: (op: string, payload: Record<string, unknown>, label: string) => Promise<boolean>;
  flat?: boolean;
}) {
  const rows = [
    ...session.participants.map((p) => {
      const known = people.find((person) => person.id === p.athlete.user_id);
      return { key: p.id, name: p.athlete.display_name, group: known?.group || "Athleten", participant: p, userId: null as string | null };
    }),
    ...people
      .filter((person) => !session.participants.some((p) => p.athlete.user_id === person.id))
      .map((person) => ({ key: person.id, name: person.name, group: person.group || "Athleten", participant: null, userId: person.id })),
  ];
  const toggle = (row: (typeof rows)[number]) => {
    const on = row.participant?.present ?? false;
    const first = firstName(row.name);
    if (row.participant)
      void command("attendance", { participant_id: row.participant.id, present: !on }, `${first} ${on ? "abwesend" : "anwesend"}`);
    else void command("participant_add", { user_id: row.userId }, `${first} anwesend`);
  };
  const toggleButton = (row: (typeof rows)[number]) => {
    const on = row.participant?.present ?? false;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${row.name} anwesend`}
        className={styles.switch}
        data-dim={dim}
        disabled={disabled || (session.mode !== "group" && !row.participant)}
        onClick={() => toggle(row)}
      >
        <span />
      </button>
    );
  };
  if (flat) {
    return (
      <div className={styles.attList}>
        {rows.map((row) => (
          <div key={row.key} className={styles.attRow} data-on={row.participant?.present ?? false}>
            <span>{row.name}</span>
            {toggleButton(row)}
          </div>
        ))}
      </div>
    );
  }
  const groups = [...new Set(rows.map((row) => row.group))];
  return (
    <div className={styles.attGroups}>
      {groups.map((name) => (
        <div key={name} className={styles.attGroup}>
          <span className={styles.attGroupName}>{name}</span>
          <div className={styles.attBox}>
            {rows
              .filter((row) => row.group === name)
              .map((row) => (
                <div key={row.key} className={styles.attRowLarge}>
                  <span>{row.name}</span>
                  {toggleButton(row)}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}


const noteLabels: Record<NoteStatus, string> = {
  idle: "Speichert automatisch",
  dirty: "Wird gleich gespeichert",
  saving: "Speichert …",
  saved: "✓ Gespeichert",
  failed: "Nicht gespeichert",
};

/** Notiz mit automatischem Speichern im eigenen Kanal; der Entwurf bleibt bei Fehlern erhalten. */
export function NoteEditor({
  label,
  value,
  status,
  placeholder,
  onChange,
  retry,
}: {
  label: string;
  value: string;
  status: NoteStatus;
  placeholder: string;
  onChange: (value: string) => void;
  retry: () => void;
}) {
  return (
    <div className={`${styles.card} ${styles.noteCard}`}>
      <label className={styles.noteHead}>
        <strong>{label}</strong>
        <small data-status={status} aria-live="polite">
          {noteLabels[status]}
        </small>
      </label>
      <textarea
        aria-label={label}
        maxLength={4000}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {status === "failed" ? (
        <button type="button" className={styles.linkButton} onClick={retry}>
          Erneut speichern
        </button>
      ) : null}
    </div>
  );
}
