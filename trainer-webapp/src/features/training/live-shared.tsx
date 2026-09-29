"use client";

import { useEffect, useState } from "react";
import type { SessionExercise, TrainingSession, TrainingWorkspace } from "@/domain/training";
import { counts, firstName, isLine, isReady, toneOf, type PlanStep } from "@/domain/live-training";
import type { TrainingChannel } from "./use-training-workspace";
import styles from "./training.module.css";

/** Sendet einen idempotenten Trainings-Command; `true` bei Serverbestätigung. */
export type Run = (
  operation: string,
  payload: Record<string, unknown>,
  label?: string,
) => Promise<boolean>;

/** Planstatus eines Athleten für einen Trick samt Freigabe (für „Bereit“). */
export type PlanStepLookup = (
  athleteUserId: string | null,
  trickId: string,
) => { step: PlanStep; shareId: string } | null;

/** Alles, was die Live-Ansicht aus dem Plan-Hub braucht. */
export interface LiveContext {
  channel: TrainingChannel;
  planStep: PlanStepLookup;
  notify: (text: string) => void;
  /** Anrede des Trainers im Nominativ, z. B. „deine Trainerin“. */
  trainerNom: string;
  people: TrainingWorkspace["people"];
  onExit: () => void;
  onReview: () => void;
}

export const modeLabel = (mode: TrainingSession["mode"]) =>
  mode === "self" ? "Selbsttraining" : mode === "group" ? "Gruppe" : "Einzel";

/**
 * Sekundentakt für Dauer und Timer. Startet erst im Browser (0 beim Rendern auf
 * dem Server, damit die Hydration übereinstimmt); abgeschlossene Trainings
 * brauchen nur einen einmaligen Zeitpunkt.
 */
export function useNow(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (!active) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Ergebnis der Bereit-Prüfung als Karte mit genau einer Aktion. */
export interface ReadyEntry {
  key: string;
  title: string;
  pctLabel: string;
  sub: string;
  cta: string;
  action: () => void;
}

export function bridgeAction(
  ready: { person: TrainingSession["participants"][number]; plan: { step: PlanStep; shareId: string }; c: ReturnType<typeof counts> },
  ex: SessionExercise,
  trainer: boolean,
  ctx: LiveContext,
  command: (op: string, payload: Record<string, unknown>, label: string) => Promise<boolean>,
): ReadyEntry {
  const { person, plan, c } = ready;
  const name = ex.content.name;
  const first = firstName(person.athlete.display_name);
  const send = (status: string, label: string, toast: string) => () =>
    void command(
      "progress",
      { participant_id: person.id, exercise_id: ex.id, share_id: plan.shareId, status },
      label,
    ).then((ok) => ok && ctx.notify(toast));
  const base = {
    key: `${person.id}:${ex.id}`,
    title: trainer ? `${name} · ${first}` : name,
    pctLabel: `${c.pct} % · ${c.landed}/${c.attempts} ${isLine(ex) ? "komplett" : "gestanden"}`,
  };
  if (trainer)
    return {
      ...base,
      sub: `${first} · Status im Plan: ${["Offen", "Geübt", "Gemeldet", "Bestätigt"][plan.step]}`,
      cta: "Bestätigen",
      action: send("confirmed", `${name} bestätigen · ${first}`, `${name} für ${first} bestätigt`),
    };
  if (plan.step === 0)
    return {
      ...base,
      sub: "Status im Plan: Offen",
      cta: "Als geübt markieren",
      action: send("in_progress", `${name} geübt`, `${name} als geübt markiert`),
    };
  return {
    ...base,
    sub: `Status: Geübt · ${ctx.trainerNom} bestätigt danach`,
    cta: "Melden",
    action: send("awaiting_confirmation", `${name} melden`, `Gemeldet – ${ctx.trainerNom} wurde benachrichtigt`),
  };
}

/** Balken in Quote-Farben. */
export function Bar({ pct, mini = false, thin = false, desk = false }: { pct: number | null; mini?: boolean; thin?: boolean; desk?: boolean }) {
  return (
    <span
      className={`${styles.bar} ${mini ? styles.barMini : ""} ${thin ? styles.barThin : ""} ${desk ? styles.barDesk : ""}`}
      aria-hidden="true"
    >
      <span data-tone={toneOf(pct)} style={{ width: `${pct ?? 0}%` }} />
    </span>
  );
}

/** Bereit-Prüfung für eine Person und Übung; `null`, wenn (noch) nicht bereit. */
export function readyEntry(
  session: TrainingSession,
  participantId: string,
  ex: SessionExercise,
  trainer: boolean,
  ctx: LiveContext,
  command: (op: string, payload: Record<string, unknown>, label: string) => Promise<boolean>,
) {
  const person = session.participants.find((p) => p.id === participantId);
  const plan = person ? ctx.planStep(person.athlete.user_id, ex.source_trick_id) : null;
  if (!person || !plan) return null;
  const c = counts(session, participantId, ex.id);
  return isReady(c.attempts, c.landed, plan.step, trainer)
    ? bridgeAction({ person, plan, c }, ex, trainer, ctx, command)
    : null;
}
