"use client";

import { Check, ChevronLeft, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrainingSession } from "@/domain/training";
import { NoStartCard, RunningCard, StartCard } from "@/features/training/live-entry";
import {
  archiveLabel,
  cellKey,
  confirmedCount,
  currentTrickIndex,
  deadlineText,
  daysUntil,
  formatDay,
  formatDecimal,
  isLineTrick,
  levelOf,
  myAssignment,
  planPercent,
  shortName,
  trickAggregate,
  type HubAssignment,
  type HubPlan,
  type HubRole,
  type HubTrick,
  type Step,
} from "./plan-hub-model";
import type { HubActions } from "./plan-hub";
import { useWords } from "./hub-words";
import { PlanMenu, type MenuItem } from "./plan-archive";
import styles from "./plan-hub.module.css";

const toneClass = ["toneOpen", "tonePracticed", "toneReported", "toneConfirmed"] as const;

/** Detailkarte eines Plans: Kopf, Level-Leiste, Trick-Pfad, „Jetzt dran“ und Infos. */
export function PlanDetail({
  plan,
  role,
  accountType,
  canCreate,
  openSession,
  busy,
  actions,
  hasEvidence,
  onBack,
}: {
  plan: HubPlan;
  role: HubRole;
  /** Startrecht: Trainer (Start-Screen) und Skater (Selbsttraining). */
  accountType: string;
  /** Erstellrecht (Trainer, Vorstand, Skater mit übertragenem Recht). */
  canCreate: boolean;
  /** Laufendes oder pausiertes Training dieses Plans. */
  openSession?: TrainingSession;
  busy: boolean;
  actions: HubActions;
  hasEvidence: (key: string) => boolean;
  onBack: () => void;
}) {
  const staff = role === "staff";
  const assigned = plan.assignments.length > 0;
  const mine = role !== "staff" ? myAssignment(plan) : null;
  // Erledigte Pläne haben keinen „Jetzt dran“-Schritt mehr.
  const current = plan.lifecycle === "archived" ? -1 : currentTrickIndex(plan, role);
  const days = daysUntil(plan.deadline);
  const w = useWords();

  const sub =
    plan.kind === "template"
      ? `Vereinsvorlage · ${plan.sourceLabel || "vom Vorstand"} · ${plan.tricks.length} Tricks`
      : plan.kind === "athlete"
        ? `Von ${shortName(plan.createdByAthlete)} erstellt · ${plan.tricks.length} Tricks`
        : staff
          ? [assigned ? `${plan.assignments.length} ${plan.assignments.length === 1 ? "Athlet" : "Athleten"}` : "Noch nicht zugewiesen", `${plan.tricks.length} Tricks`].join(" · ")
          : `${mine ? "Dein Pfad" : "Eigener Plan"} · ${plan.tricks.length} Tricks`;

  // Erledigte/archivierte Pläne sind nur lesbar (erst reaktivieren).
  const archived = plan.lifecycle === "archived";
  const editable = Boolean(plan.editable) && !archived;
  // Trainer, Vorstand und Skater mit Erstellrecht; nur eigene (versionierte) Pläne.
  const canCreateLine = canCreate && editable;
  // Teilen mit anderen Trainer*innen: nur eigene gespeicherte Pläne, auch archivierte.
  const canShare = staff && plan.kind === "own" && Boolean(plan.savedPlanId);

  // Menü „…“: nur für verwaltbare Pläne (Ersteller bzw. Vorstand, siehe DB).
  // „Bearbeiten“ steht bei Trainern schon als eigener Button daneben.
  const menu: MenuItem[] = plan.library
    ? archived
      ? [{ label: "Löschen", hint: "30 Tage im Papierkorb", danger: true, onSelect: () => actions.remove(plan) }]
      : [
          ...(editable && !staff ? [{ label: "Bearbeiten", onSelect: () => actions.edit(plan) }] : []),
          {
            label: "Als erledigt markieren",
            hint: staff ? "Kommt ins Archiv, Athleten sehen „Erledigt“" : "Kommt zu „Erledigt“",
            onSelect: () => actions.archive(plan),
          },
          { label: "Löschen", hint: "30 Tage im Papierkorb", danger: true, onSelect: () => actions.remove(plan) },
        ]
    : [];

  // Archivierte Pläne zeigen statt „Jetzt dran“ die Archiv-Karte direkt unter dem Kopf.
  const nowCard = archived ? null : (
    <NowCard plan={plan} role={role} current={current} mine={mine} actions={actions} hasEvidence={hasEvidence} />
  );

  return (
    <article className={styles.detail}>
      <div className={styles.mobileBar}>
        <button type="button" className={styles.back} onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" /> Pläne
        </button>
        <span className={styles.mobileBarActions}>
          {staff && editable ? (
            <Button variant="secondary" onClick={() => actions.edit(plan)}>
              Bearbeiten
            </Button>
          ) : null}
          {canShare ? (
            <Button variant="secondary" onClick={() => actions.share(plan)}>
              <Share2 size={16} aria-hidden="true" /> Teilen
            </Button>
          ) : null}
          <PlanMenu items={menu} />
        </span>
      </div>

      <header className={styles.detailHead}>
        <div>
          <div className={styles.pills}>
            {archived ? (
              <span className={`${styles.pill} ${styles.pillMuted}`}>{staff ? "Archiviert" : "Erledigt"}</span>
            ) : plan.isDraft || plan.lifecycle === "draft" ? (
              <span className={`${styles.pill} ${styles.pillMuted}`}>Entwurf</span>
            ) : plan.kind !== "template" ? (
              <span className={`${styles.pill} ${styles.pillGood}`}>Aktiv</span>
            ) : null}
            {plan.isTemplate ? <span className={`${styles.pill} ${styles.pillTemplate}`}>Vorlage</span> : null}
            {plan.kind === "athlete" ? <span className={`${styles.pill} ${styles.pillBlue}`}>Athlet</span> : null}
            {days !== null && !archived ? (
              <span className={`${styles.pill} ${days <= 7 ? styles.pillWarn : styles.pillMuted}`}>
                {days < 0 ? "Frist abgelaufen" : days === 0 ? "Endet heute" : `Endet in ${days} ${days === 1 ? "Tag" : "Tagen"}`}
              </span>
            ) : null}
          </div>
          <h2 className={styles.planTitle}>{plan.title}</h2>
          <p className={styles.planSub}>{sub}</p>
        </div>
        <div className={styles.detailActions}>
          {canCreateLine ? (
            <button type="button" className={styles.createLineDesk} onClick={() => actions.createLine(plan)}>
              + Line erstellen
            </button>
          ) : null}
          {staff && editable ? (
            <Button variant="secondary" className={styles.desktopOnly} onClick={() => actions.edit(plan)}>
              Bearbeiten
            </Button>
          ) : null}
          {canShare ? (
            <Button variant="secondary" className={styles.desktopOnly} onClick={() => actions.share(plan)}>
              <Share2 size={16} aria-hidden="true" /> Teilen
            </Button>
          ) : null}
          {staff && assigned && !archived ? (
            <Button variant="secondary" className={styles.desktopOnly} onClick={() => actions.showProgress(plan.key)}>
              Freigaben öffnen
            </Button>
          ) : null}
          {mine && !archived ? (
            <Button variant="secondary" className={styles.desktopOnly} onClick={() => actions.showProgress(plan.key)}>
              Mein Fortschritt
            </Button>
          ) : null}
          {menu.length ? (
            <span className={styles.desktopOnly}>
              <PlanMenu items={menu} />
            </span>
          ) : null}
        </div>
      </header>

      {archived ? <ArchivedCard plan={plan} role={role} actions={actions} /> : <LiveEntry
        plan={plan}
        accountType={accountType}
        session={openSession}
        busy={busy}
        actions={actions}
      />}

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
                  className={`${styles.node} ${styles[toneClass[node.tone]]} ${index === current ? styles.nodeCurrent : ""} ${isLineTrick(trick) ? styles.nodeLine : ""}`}
                  aria-hidden="true"
                >
                  <span>{node.label}</span>
                </span>
                <div className={styles.nodeText}>
                  <strong>
                    {trick.name}
                    {isLineTrick(trick) ? <span className={styles.lineBadge}>LINE</span> : null}
                  </strong>
                  {isLineTrick(trick) ? (
                    <span className={styles.lineChain}>{trick.parts?.map((part) => part.name).join(" → ")}</span>
                  ) : null}
                  <small className={node.warn ? styles.textWarn : undefined}>{node.sub}</small>
                </div>
                {index === current && nowCard ? <div className={styles.inlineNow}>{nowCard}</div> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>Dieser Plan enthält noch keine Tricks.</p>
      )}

      {canCreateLine ? (
        <button type="button" className={styles.createLine} onClick={() => actions.createLine(plan)}>
          + Line erstellen <small>Tricks zu Serie verbinden</small>
        </button>
      ) : null}

      <div className={styles.detailGrid}>
        {nowCard ? <div className={styles.desktopNow}>{nowCard}</div> : null}
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
    if (step === 3) {
      const sub =
        trick.id in mine.recapConfirmed
          ? "Bestätigt aus Session-Rückblick"
          : trick.id in (mine.liveConfirmed ?? {})
            ? "Bestätigt aus Live-Training"
            : "Bestätigt";
      return { label: <Check size={18} strokeWidth={3} />, tone: 3, sub, warn: false, lineDone: true };
    }
    if (step === 2) return { label: "…", tone: 2, sub: `Gemeldet · wartet auf ${trainerAcc}`, warn: true, lineDone: false };
    if (index === current) {
      return { label: number, tone: 1, sub: `Jetzt dran${trick.goal ? ` · ${trick.goal}` : ""}`, warn: false, lineDone: false };
    }
    if (step === 1) return { label: number, tone: 1, sub: "Geübt", warn: false, lineDone: false };
    return { label: number, tone: 0, sub: current < 0 ? "Offen" : "Kommt danach", warn: false, lineDone: false };
  }
  return { label: number, tone: 0, sub: trick.goal || "Offen", warn: false, lineDone: false };
}

function LevelBar({ plan, staff, mine }: { plan: HubPlan; staff: boolean; mine: HubAssignment | null }) {
  const w = useWords();
  if (plan.kind === "template") {
    return (
      <div className={styles.levelBar}>
        <div className={styles.levelText}>
          <span>Vereinsvorlage</span>
          <small>Übernimm sie als Grundlage für einen eigenen Plan</small>
        </div>
      </div>
    );
  }
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
    const rank = `${plan.category || "Street"}-${w.rank}`;
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
  const w = useWords();

  if (plan.kind === "template") {
    return (
      <section className={styles.nowCard}>
        <span className={styles.nowKicker}>Vereinsvorlage</span>
        <p className={styles.muted}>
          Freigegeben von {plan.author || "dem Vorstand"}. Übernimm Tricks, Kategorie und Niveau in einen eigenen Plan.
        </p>
        <Button onClick={() => actions.useTemplate(plan)}>Als Vorlage verwenden</Button>
      </section>
    );
  }

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

/**
 * Erledigter/archivierter Plan: nur lesbar. Verwaltbare Pläne bieten als
 * einzige Hauptaktion „Reaktivieren“ (Auswahl der Athleten im Sheet).
 */
function ArchivedCard({ plan, role, actions }: { plan: HubPlan; role: HubRole; actions: HubActions }) {
  const w = useWords();
  return (
    <section className={`${styles.nowCard} ${styles.readOnlyNote}`}>
      <span className={styles.nowKicker}>
        {role === "staff" ? "Archiviert" : "Erledigt"} · {archiveLabel(plan, role)}
      </span>
      <p className={styles.muted}>
        {plan.library
          ? "Dieser Plan ist nur noch lesbar. Reaktiviere ihn, um ihn erneut zuzuweisen oder zu trainieren."
          : `Nur noch lesbar. Dein Fortschritt bleibt erhalten; neue Pläne bekommst du von ${w.dat}.`}
      </p>
      {plan.library ? <Button onClick={() => actions.reactivate(plan)}>Reaktivieren</Button> : null}
    </section>
  );
}

function InfoCard({ plan, staff, mine }: { plan: HubPlan; staff: boolean; mine: HubAssignment | null }) {
  const w = useWords();
  const names = plan.assignments.map((entry) => shortName(entry.athleteName));
  const assignedText = plan.kind === "template"
    ? "Nur als Vorlage"
    : plan.kind === "athlete"
      ? `Von ${shortName(plan.createdByAthlete)} erstellt · mit dir geteilt`
      : staff
    ? names.length
      ? names.length > 3
        ? `${names.slice(0, 3).join(", ")} +${names.length - 3}`
        : names.join(", ")
      : "Noch niemand"
    : plan.kind === "own"
      ? plan.sharedWithTrainer
        ? `Von dir erstellt · geteilt mit ${w.dat}`
        : "Nur für dich"
      : mine
        ? `Von ${plan.author || w.dat}`
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

/** Einstieg ins Live-Training je Rolle; ein offenes Training geht immer vor. */
function LiveEntry({
  plan,
  accountType,
  session,
  busy,
  actions,
}: {
  plan: HubPlan;
  accountType: string;
  session?: TrainingSession;
  busy: boolean;
  actions: HubActions;
}) {
  const canStart = accountType === "trainer" || accountType === "athlete";
  if (session && canStart) {
    return <RunningCard session={session} onResume={(index) => actions.resumeTraining(session.id, index)} />;
  }
  if (canStart) {
    if (!plan.startId) return null;
    return (
      <StartCard
        athlete={accountType === "athlete"}
        disabled={busy || !plan.tricks.length}
        onStart={() => actions.startTraining(plan)}
      />
    );
  }
  return (
    <NoStartCard
      parent={accountType === "guardian"}
      athleteName={plan.assignments.length === 1 ? plan.assignments[0].athleteName : null}
      onReview={actions.showRecap}
    />
  );
}
