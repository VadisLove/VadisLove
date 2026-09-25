"use client";

import { Check, ChevronLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cellKey,
  confirmedCount,
  currentTrickIndex,
  deadlineText,
  daysUntil,
  formatDay,
  formatDecimal,
  levelOf,
  planPercent,
  shortName,
  trickAggregate,
  words,
  type HubAssignment,
  type HubPlan,
  type HubRole,
  type HubTrick,
  type Step,
} from "./plan-hub-model";
import type { HubActions } from "./plan-hub";
import styles from "./plan-hub.module.css";

const toneClass = ["toneOpen", "tonePracticed", "toneReported", "toneConfirmed"] as const;

/** Detailkarte eines Plans: Kopf, Level-Leiste, Trick-Pfad, „Jetzt dran“ und Infos. */
export function PlanDetail({
  plan,
  role,
  actions,
  hasEvidence,
  onBack,
}: {
  plan: HubPlan;
  role: HubRole;
  actions: HubActions;
  hasEvidence: (key: string) => boolean;
  onBack: () => void;
}) {
  const staff = role === "staff";
  const assigned = plan.assignments.length > 0;
  const mine = role !== "staff" && plan.kind === "received" ? plan.assignments[0] : null;
  const current = currentTrickIndex(plan, role);
  const days = daysUntil(plan.deadline);
  const w = words();

  const sub = staff
    ? [assigned ? `${plan.assignments.length} ${plan.assignments.length === 1 ? "Athlet" : "Athleten"}` : "Noch nicht zugewiesen", `${plan.tricks.length} Tricks`].join(" · ")
    : `${mine ? "Dein Pfad" : "Eigener Plan"} · ${plan.tricks.length} Tricks`;

  const nowCard = (
    <NowCard plan={plan} role={role} current={current} mine={mine} actions={actions} hasEvidence={hasEvidence} />
  );

  return (
    <article className={styles.detail}>
      <div className={styles.mobileBar}>
        <button type="button" className={styles.back} onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" /> Pläne
        </button>
        {staff && plan.editable ? (
          <Button variant="secondary" onClick={() => actions.edit(plan)}>
            Bearbeiten
          </Button>
        ) : null}
      </div>

      <header className={styles.detailHead}>
        <div>
          <div className={styles.pills}>
            {plan.isDraft ? (
              <span className={`${styles.pill} ${styles.pillMuted}`}>Entwurf</span>
            ) : (
              <span className={`${styles.pill} ${styles.pillGood}`}>Aktiv</span>
            )}
            {days !== null ? (
              <span className={`${styles.pill} ${days <= 7 ? styles.pillWarn : styles.pillMuted}`}>
                {days < 0 ? "Frist abgelaufen" : days === 0 ? "Endet heute" : `Endet in ${days} ${days === 1 ? "Tag" : "Tagen"}`}
              </span>
            ) : null}
          </div>
          <h2 className={styles.planTitle}>{plan.title}</h2>
          <p className={styles.planSub}>{sub}</p>
        </div>
        <div className={styles.detailActions}>
          {staff && plan.editable ? (
            <Button variant="secondary" className={styles.desktopOnly} onClick={() => actions.edit(plan)}>
              Bearbeiten
            </Button>
          ) : null}
          {staff && assigned ? (
            <Button variant="secondary" className={styles.desktopOnly} onClick={() => actions.showProgress(plan.key)}>
              Freigaben öffnen
            </Button>
          ) : null}
          {mine ? (
            <Button variant="secondary" className={styles.desktopOnly} onClick={() => actions.showProgress(plan.key)}>
              Mein Fortschritt
            </Button>
          ) : null}
          {plan.startId && role !== "viewer" ? (
            <Button onClick={() => actions.startTraining(plan)} disabled={!plan.tricks.length}>
              <Play size={16} aria-hidden="true" /> Training starten
            </Button>
          ) : null}
        </div>
      </header>

      <LevelBar plan={plan} staff={staff} mine={mine} />

      {plan.tricks.length ? (
        <ol className={styles.path} aria-label="Trick-Pfad">
          {plan.tricks.map((trick, index) => {
            const node = nodeOf(plan, trick, index, current, staff, mine, w.acc);
            return (
              <li
                key={trick.id}
                className={`${styles.pathItem} ${node.lineDone ? styles.lineDone : ""}`}
                aria-current={index === current ? "step" : undefined}
              >
                <span
                  className={`${styles.node} ${styles[toneClass[node.tone]]} ${index === current ? styles.nodeCurrent : ""}`}
                  aria-hidden="true"
                >
                  {node.label}
                </span>
                <div className={styles.nodeText}>
                  <strong>{trick.name}</strong>
                  <small className={node.warn ? styles.textWarn : undefined}>{node.sub}</small>
                </div>
                {index === current ? <div className={styles.inlineNow}>{nowCard}</div> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>Dieser Plan enthält noch keine Tricks.</p>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.desktopNow}>{nowCard}</div>
        <InfoCard plan={plan} staff={staff} mine={mine} />
      </div>
    </article>
  );
}

function nodeOf(
  plan: HubPlan,
  trick: HubTrick,
  index: number,
  current: number,
  staff: boolean,
  mine: HubAssignment | null,
  trainerAcc: string,
): { label: string | React.ReactNode; tone: Step; sub: string; warn: boolean; lineDone: boolean } {
  const number = String(index + 1);
  if (staff && plan.assignments.length) {
    const agg = trickAggregate(plan, trick.id);
    const allDone = agg.step === 3;
    return {
      label: allDone ? <Check size={18} strokeWidth={3} /> : `${agg.confirmed}/${agg.total}`,
      tone: allDone ? 3 : agg.waiting ? 2 : 0,
      sub: `${agg.confirmed} von ${agg.total} bestätigt${agg.waiting ? ` · ${agg.waiting} wartet` : ""}`,
      warn: agg.waiting > 0,
      lineDone: allDone,
    };
  }
  if (mine) {
    const step = mine.steps[trick.id] ?? 0;
    if (step === 3) return { label: <Check size={18} strokeWidth={3} />, tone: 3, sub: "Bestätigt", warn: false, lineDone: true };
    if (step === 2) return { label: "…", tone: 2, sub: `Gemeldet · wartet auf ${trainerAcc}`, warn: true, lineDone: false };
    if (index === current) {
      return { label: number, tone: 1, sub: `Jetzt dran${trick.goal ? ` · ${trick.goal}` : ""}`, warn: false, lineDone: false };
    }
    if (step === 1) return { label: number, tone: 1, sub: "Geübt", warn: false, lineDone: false };
    return { label: number, tone: 0, sub: "Kommt danach", warn: false, lineDone: false };
  }
  return { label: number, tone: 0, sub: trick.goal || "Offen", warn: false, lineDone: false };
}

function LevelBar({ plan, staff, mine }: { plan: HubPlan; staff: boolean; mine: HubAssignment | null }) {
  if (staff && plan.assignments.length) {
    const confirmed = confirmedCount(plan);
    const total = plan.assignments.length * plan.tricks.length;
    return (
      <div className={styles.levelBar}>
        <div className={styles.levelText}>
          <span>Gruppe · {confirmed} von {total} bestätigt</span>
          <small>Ø {formatDecimal(confirmed / plan.assignments.length)} Tricks pro Athlet</small>
        </div>
        <Progress value={planPercent(plan)} />
      </div>
    );
  }
  if (mine) {
    const confirmed = plan.tricks.filter((trick) => mine.steps[trick.id] === 3).length;
    const rank = `${plan.category || "Street"}-${words().rank}`;
    return (
      <div className={styles.levelBar}>
        <div className={styles.levelText}>
          <span>Level {levelOf(confirmed)} · {rank}</span>
          <small>
            {confirmed} von {plan.tricks.length} Tricks bestätigt
          </small>
        </div>
        <Progress value={plan.tricks.length ? (confirmed / plan.tricks.length) * 100 : 0} />
      </div>
    );
  }
  return (
    <div className={styles.levelBar}>
      <div className={styles.levelText}>
        <span>{staff ? "Noch nicht zugewiesen" : "Eigener Plan"}</span>
        <small>{staff ? "Über „Bearbeiten“ Athleten zuweisen" : "Starte ein Training, um Landungen zu zählen"}</small>
      </div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <span className={styles.levelTrack} aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

function NowCard({
  plan,
  role,
  current,
  mine,
  actions,
  hasEvidence,
}: {
  plan: HubPlan;
  role: HubRole;
  current: number;
  mine: HubAssignment | null;
  actions: HubActions;
  hasEvidence: (key: string) => boolean;
}) {
  const trick = current >= 0 ? plan.tricks[current] : null;
  const w = words();

  if (role === "staff" && plan.assignments.length) {
    const waiting = trick ? plan.assignments.filter((entry) => entry.steps[trick.id] === 2) : [];
    return (
      <section className={styles.nowCard}>
        <span className={styles.nowKicker}>{trick ? `Wartet · ${trick.name}` : "Keine offenen Meldungen"}</span>
        {trick ? (
          <div className={styles.waitList}>
            {waiting.map((assignment) => {
              const video = hasEvidence(cellKey(assignment.shareId, trick.id));
              return (
                <button
                  type="button"
                  key={assignment.shareId}
                  className={styles.waitRow}
                  onClick={() => actions.openReview(plan, assignment, trick)}
                >
                  <span className={styles.avatar}>{assignment.initials}</span>
                  <span>{shortName(assignment.athleteName)}</span>
                  <small>{video ? "mit Video" : "ohne Video"}</small>
                </button>
              );
            })}
          </div>
        ) : (
          <p className={styles.muted}>Sobald jemand einen Trick meldet, erscheint die Meldung hier.</p>
        )}
        <Button onClick={() => actions.showProgress(plan.key)}>Alle Fortschritte</Button>
      </section>
    );
  }

  if (mine) {
    if (!trick) {
      return (
        <section className={styles.nowCard}>
          <span className={styles.nowKicker}>Alles gemeldet</span>
          <p className={styles.muted}>Alle Tricks sind gemeldet oder bestätigt. Stark!</p>
        </section>
      );
    }
    const step = mine.steps[trick.id] ?? 0;
    const busy = actions.busyKey === cellKey(mine.shareId, trick.id);
    return (
      <section className={styles.nowCard}>
        <span className={styles.nowKicker}>Jetzt dran · {trick.name}</span>
        <ul className={styles.stepList}>
          {[
            { label: "Geübt", done: step >= 1 },
            { label: "Gemeldet (mit Video)", done: step >= 2 },
            { label: "Bestätigt", done: step >= 3, note: `durch ${w.acc}` },
          ].map((item) => (
            <li key={item.label} className={item.done ? styles.stepDone : undefined}>
              <span className={styles.stepCheck} aria-hidden="true">
                {item.done ? <Check size={14} strokeWidth={3} /> : null}
              </span>
              <span>{item.label}</span>
              {item.note ? <small>{item.note}</small> : null}
            </li>
          ))}
        </ul>
        {step === 0 ? (
          <Button size="lg" disabled={busy} onClick={() => actions.markPracticed(plan, mine, trick)}>
            Als geübt markieren
          </Button>
        ) : (
          <Button size="lg" disabled={busy} onClick={() => actions.openReport(plan, mine, trick)}>
            {trick.name} melden
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className={styles.nowCard}>
      <span className={styles.nowKicker}>{role === "staff" ? "Noch nicht zugewiesen" : "Eigener Plan"}</span>
      <p className={styles.muted}>
        {role === "staff"
          ? "Weise den Plan über „Bearbeiten“ einzelnen Athleten zu, um ihren Fortschritt zu sehen."
          : "Dieser Plan ist nur für dich. Starte ein Training, um Versuche und Landungen zu zählen."}
      </p>
    </section>
  );
}

function InfoCard({ plan, staff, mine }: { plan: HubPlan; staff: boolean; mine: HubAssignment | null }) {
  const names = plan.assignments.map((entry) => shortName(entry.athleteName));
  const assignedText = staff
    ? names.length
      ? names.length > 3
        ? `${names.slice(0, 3).join(", ")} +${names.length - 3}`
        : names.join(", ")
      : "Noch niemand"
    : mine
      ? `Von ${plan.author || words().dat}`
      : "Nur für dich";
  const rows = [
    { label: "Kategorie", value: [plan.category, plan.level].filter(Boolean).join(" · ") || "—" },
    { label: "Frist", value: deadlineText(plan.deadline) ?? "Ohne Frist" },
    { label: "Zugewiesen", value: assignedText },
    { label: "Ziel", value: plan.goal || "—" },
    {
      label: "Version",
      value: `${plan.version ?? 1}${plan.createdAt ? ` · erstellt ${formatDay(plan.createdAt).replace(/^\S+ /, "")}` : ""}`,
    },
  ];
  return (
    <dl className={styles.infoCard}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
