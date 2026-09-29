"use client";

import { useState, type ReactNode } from "react";
import type { TrainingSession } from "@/domain/training";
import {
  activeMs,
  counts,
  exerciseTotals,
  isLine,
  minutes,
  percent,
  sessionWhen,
  toneOf,
} from "@/domain/live-training";
import type { SyncState, TrainingChannel } from "./use-training-workspace";
import { Bar, readyEntry, type LiveContext } from "./live-shared";
import styles from "./training.module.css";

const syncLabels: Record<SyncState, string> = {
  idle: "Gespeichert",
  busy: "Speichert …",
  pending: "Nicht bestätigt",
  conflict: "Konflikt",
};

/** Punkt + Text des Schreibwegs; das Label wird nie gekürzt. */
export function SyncDot({ sync }: { sync: SyncState }) {
  return (
    <span className={styles.sync} data-sync={sync} role="status" aria-live="polite">
      <span className={styles.syncDot} aria-hidden="true" />
      <b>{syncLabels[sync]}</b>
    </span>
  );
}

/** Banner für unbestätigte Eingaben und Konflikte mit „Erneut senden“ bzw. „Neu laden“. */
export function SyncBanner({ channel, onReloaded }: { channel: TrainingChannel; onReloaded: () => void }) {
  const label = channel.current?.label ?? "Eingabe";
  if (channel.sync === "conflict") {
    return (
      <div className={styles.banner} data-kind="conflict" role="alert">
        <span>
          <strong>Konflikt: Training wurde geändert</strong>
          <small>Auf einem anderen Gerät. „{label}“ wurde nicht gezählt.</small>
        </span>
        <button type="button" onClick={() => void channel.load().then((ok) => ok && onReloaded())}>
          Neu laden
        </button>
      </div>
    );
  }
  if (channel.sync === "pending") {
    return (
      <div className={styles.banner} data-kind="pending" role="alert">
        <span>
          <strong>Nicht bestätigt: {label}</strong>
          <small>Noch nicht gezählt. Weitere Eingaben warten.</small>
        </span>
        <button type="button" onClick={() => void channel.retry()}>
          Erneut senden
        </button>
      </div>
    );
  }
  return null;
}

/** Mobil Vollbild (navy), Desktop Modal 560 px. */
export function PauseScreen({
  title,
  exerciseLabel,
  since,
  elapsed,
  attempts,
  third,
  dim,
  disabled,
  onResume,
  onLater,
  onEnd,
}: {
  session: TrainingSession;
  title: string;
  exerciseLabel: string;
  since: string;
  elapsed: string;
  attempts: number;
  third: { n: string; l: string };
  dim: boolean;
  disabled: boolean;
  onResume: () => void;
  onLater: () => void;
  onEnd: () => void;
}) {
  return (
    <div className={styles.pauseLayer}>
      <div className={styles.pausePanel} role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div>
          <span className={styles.pauseKicker}>
            <span aria-hidden="true" />
            Training pausiert
          </span>
          <h2 id="pause-title" className={styles.pauseTitle}>
            {title}
          </h2>
          <p className={styles.pauseSub}>
            Seit {since} · {exerciseLabel}
          </p>
        </div>
        <div className={styles.pauseTiles}>
          {[
            { n: elapsed, l: "Aktive Zeit" },
            { n: String(attempts), l: "Versuche" },
            third,
          ].map((tile) => (
            <div key={tile.l}>
              <strong>{tile.n}</strong>
              <small>{tile.l}</small>
            </div>
          ))}
        </div>
        <p className={styles.pauseText}>
          Timer sind gestoppt, die Pausenzeit zählt nicht zur Trainingsdauer. Alles ist gespeichert – du kannst auch
          später oder auf einem anderen Gerät weitermachen.
        </p>
        <div className={styles.pauseActions}>
          <button type="button" className={styles.pauseEnd} onClick={onEnd}>
            Training beenden
          </button>
          <span className={styles.spacer} />
          <button type="button" className={styles.pauseLater} onClick={onLater}>
            Später fortsetzen
          </button>
          <button type="button" className={styles.pauseResume} data-dim={dim} disabled={disabled} onClick={onResume}>
            ▶ Fortsetzen
          </button>
        </div>
      </div>
    </div>
  );
}

/** Rückfrage vor dem Abschluss: mobil Bottom-Sheet, Desktop Modal 460 px. */
export function EndDialog({
  summary,
  blocked,
  paused,
  onEnd,
  onPause,
  onClose,
}: {
  summary: string;
  blocked: string | null;
  paused: boolean;
  onEnd: () => void;
  onPause: () => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="end-title">
        <span className={styles.handle} aria-hidden="true" />
        <h2 id="end-title">Training beenden?</h2>
        <p>{summary} Danach sind die Ergebnisse unveränderlich, laufende Timer werden gestoppt.</p>
        {blocked ? <p className={styles.blockNote}>{blocked}</p> : null}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogBack} onClick={onClose}>
            {paused ? "Zurück" : "Weiter trainieren"}
          </button>
          {!paused ? (
            <button type="button" className={styles.dialogPause} disabled={Boolean(blocked)} onClick={onPause}>
              <span className={styles.mobileInline}>❚❚ Nur pausieren – später weiter</span>
              <span className={styles.deskInline}>❚❚ Nur pausieren</span>
            </button>
          ) : null}
          <button type="button" className={styles.dialogEnd} disabled={Boolean(blocked)} onClick={onEnd}>
            Beenden und speichern
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bottom-Sheet „Anwesenheit“ (mobil); Desktop zeigt die Toggles rechts. */
export function AttendanceSheet({
  present,
  onClose,
  children,
}: {
  present: number;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.dialog} ${styles.attSheet}`} role="dialog" aria-modal="true" aria-labelledby="att-title">
        <span className={styles.handle} aria-hidden="true" />
        <div className={styles.cardHead}>
          <h2 id="att-title">Anwesenheit</h2>
          <small>{present} anwesend</small>
        </div>
        <p>Später gekommen oder früher gegangen? Bisherige Versuche bleiben erhalten.</p>
        <div className={styles.attScroll}>{children}</div>
        <button type="button" className={styles.dialogEnd} onClick={onClose}>
          Fertig
        </button>
      </div>
    </div>
  );
}

/** Abschluss-Screen nach „Beenden und speichern“. */
export function Summary({
  session,
  title,
  ctx,
  now,
}: {
  session: TrainingSession;
  title: string;
  ctx: LiveContext;
  now: number;
}) {
  const [tab, setTab] = useState<"exercise" | "person">("exercise");
  const group = session.mode === "group";
  const trainer = session.mode !== "self";
  const present = session.participants.filter((p) => p.present);
  const scope = group ? present : session.participants.slice(0, 1);
  const command = (op: string, payload: Record<string, unknown>, label: string) =>
    ctx.channel.run(op, { session_id: session.id, revision: session.revision, ...payload }, label);

  let attempts = 0;
  let landed = 0;
  for (const p of scope)
    for (const ex of session.exercises) {
      const c = counts(session, p.id, ex.id);
      attempts += c.attempts;
      landed += c.landed;
    }
  const quote = percent(landed, attempts);
  const tiles = [
    { n: `${minutes(activeMs(session, now || Date.parse(session.completed_at ?? session.started_at)))} Min`, l: "Aktive Zeit" },
    { n: String(attempts), l: "Versuche" },
    { n: quote === null ? "—" : `${quote} %`, l: "Quote" },
  ];
  const ready = session.exercises.flatMap((ex) =>
    scope.map((p) => readyEntry(session, p.id, ex, trainer, ctx, command)).filter((entry) => entry !== null),
  );
  const ids = scope.map((p) => p.id);
  const rows =
    group && tab === "person"
      ? present.map((p) => {
          let a = 0;
          let l = 0;
          for (const ex of session.exercises) {
            const c = counts(session, p.id, ex.id);
            a += c.attempts;
            l += c.landed;
          }
          return { key: p.id, name: p.athlete.display_name, attempts: a, landed: l };
        })
      : session.exercises.map((ex) => {
          const t = exerciseTotals(session, ex.id, ids);
          return {
            key: ex.id,
            name: isLine(ex) ? `${ex.content.name} (komplett)` : ex.content.name,
            attempts: t.attempts,
            landed: t.landed,
          };
        });
  const dim = ctx.channel.sync === "pending" || ctx.channel.sync === "conflict";
  const when = sessionWhen(session, now);

  const readyCard = ready.length ? (
    <div className={styles.readyList}>
      <span className={styles.readyKicker}>Bereit für den Plan · {ready.length}</span>
      {ready.map((entry) => (
        <div key={entry.key} className={styles.readyListRow}>
          <span>
            <strong>{entry.title}</strong>
            <small>{entry.pctLabel}</small>
          </span>
          <button type="button" data-dim={dim} disabled={ctx.channel.blocked} onClick={entry.action}>
            {entry.cta}
          </button>
        </div>
      ))}
    </div>
  ) : null;

  const tabs = group ? (
    <div className={styles.segmented} role="tablist" aria-label="Ergebnisse">
      {(
        [
          ["exercise", "Je Übung"],
          ["person", "Je Person"],
        ] as const
      ).map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
          {label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className={`${styles.live} ${styles.summaryScreen}`}>
      <header className={styles.mobileHead}>
        <button type="button" className={styles.round} aria-label="Zurück zum Plan" onClick={ctx.onExit}>
          ✕
        </button>
        <span className={styles.headText}>
          <strong>Abschluss</strong>
        </span>
      </header>
      <header className={styles.deskHead}>
        <div>
          <span className={styles.savedKicker}>
            <span aria-hidden="true">✓</span>Training gespeichert · {when}
          </span>
          <h1 className={styles.deskTitle}>{title}</h1>
        </div>
        <button type="button" className={styles.ghost} onClick={ctx.onExit}>
          Zurück zum Plan
        </button>
        <button type="button" className={styles.primarySmall} onClick={ctx.onReview}>
          Zum Session-Rückblick
        </button>
      </header>
      <div className={`${styles.scroll} ${styles.summaryBody}`}>
        <div className={styles.mobileOnly}>
          <span className={styles.savedKicker}>
            <span aria-hidden="true">✓</span>Training gespeichert
          </span>
          <h2 className={styles.summaryTitle}>{title}</h2>
          <p className={styles.muted}>{when}</p>
        </div>
        <div className={styles.tiles}>
          {tiles.map((tile) => (
            <div key={tile.l} className={styles.tile}>
              <strong>{tile.n}</strong>
              <small>{tile.l}</small>
            </div>
          ))}
        </div>
        <div className={styles.summaryGrid}>
          <div className={styles.summarySide}>
            {readyCard}
            {!ready.length ? (
              <div className={`${styles.card} ${styles.deskOnly}`}>
                Noch kein Trick über 80 %. Im Session-Rückblick siehst du den Verlauf über mehrere Trainings.
              </div>
            ) : null}
          </div>
          <div className={styles.resultsBlock}>
            <div className={styles.resultsHead}>
              <strong className={styles.deskOnly}>Ergebnisse</strong>
              {tabs}
            </div>
            <div className={`${styles.card} ${styles.results}`}>
              {rows.map((row) => {
                const pct = percent(row.landed, row.attempts);
                return (
                  <div key={row.key} className={styles.resultRow}>
                    <span className={styles.resultName}>
                      <strong>{row.name}</strong>
                      <Bar pct={pct} thin />
                    </span>
                    <Bar pct={pct} desk />
                    <span className={styles.resultLa}>
                      {row.attempts ? `${row.landed} / ${row.attempts}` : "nicht geübt"}
                    </span>
                    <span className={styles.quotePill} data-tone={toneOf(pct)}>
                      {pct === null ? "—" : `${pct} %`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className={`${styles.summaryButtons} ${styles.mobileOnly}`}>
          <button type="button" className={styles.startButton} onClick={ctx.onReview}>
            Zum Session-Rückblick
          </button>
          <button type="button" className={styles.secondaryWide} onClick={ctx.onExit}>
            Zurück zum Plan
          </button>
        </div>
      </div>
    </div>
  );
}
