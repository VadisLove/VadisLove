"use client";

import { Check, ChevronLeft, Play } from "lucide-react";
import type { TrainingVideoEvidence } from "@/domain/models";
import { Button } from "@/components/ui/button";
import { buildYoutubeVideoUrl } from "@/lib/youtube-video";
import {
  cellKey,
  formatDay,
  formatRelative,
  shortName,
  stepLabels,
  words,
  type HubPlan,
  type Step,
  type WaitingReport,
} from "./plan-hub-model";
import type { HubActions } from "./plan-hub";
import styles from "./plan-hub.module.css";

const cellTone = ["cellOpen", "cellPracticed", "cellReported", "cellConfirmed"] as const;

/** Plan-Auswahl als Chips, sobald es mehr als einen Plan gibt. */
function PlanChips({
  plans,
  selectedKey,
  onSelect,
}: {
  plans: HubPlan[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  if (plans.length < 2) return null;
  return (
    <div className={styles.chips} role="tablist" aria-label="Plan auswählen">
      {plans.map((plan) => (
        <button
          key={plan.key}
          type="button"
          role="tab"
          aria-selected={plan.key === selectedKey}
          className={`${styles.chip} ${plan.key === selectedKey ? styles.chipOn : ""}`}
          onClick={() => onSelect(plan.key)}
        >
          {plan.title}
        </button>
      ))}
    </div>
  );
}

/** Trainer*innen & Vorstand: Matrix Athleten × Tricks plus Warteschlange. */
export function StaffProgress({
  plans,
  plan,
  onSelect,
  reports,
  hasEvidence,
  actions,
  onBack,
}: {
  plans: HubPlan[];
  plan: HubPlan | null;
  onSelect: (key: string) => void;
  reports: WaitingReport[];
  hasEvidence: (key: string) => boolean;
  actions: HubActions;
  onBack: () => void;
}) {
  return (
    <div className={styles.progressLayout}>
      <div className={styles.progressMain}>
        <button type="button" className={`${styles.back} ${styles.mobileOnly}`} onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" /> Pläne
        </button>
        <div className={styles.mobileOnly}>
          <h2 className={styles.screenTitle}>Fortschritte</h2>
          {plan ? (
            <p className={styles.planSub}>
              {plan.title} · tippe auf <b className={styles.textWarn}>!</b> / <Play size={12} fill="currentColor" className={styles.textWarn} />
            </p>
          ) : null}
        </div>
        <PlanChips plans={plans} selectedKey={plan?.key ?? ""} onSelect={onSelect} />
        {plan ? (
          <section className={styles.matrixCard}>
            <header className={styles.matrixHead}>
              <h3>
                {plan.title} · {plan.assignments.length} {plan.assignments.length === 1 ? "Athlet" : "Athleten"}
              </h3>
              <small>
                Klicke auf ! oder <Play size={11} fill="currentColor" /> zum Prüfen
              </small>
            </header>
            <div className={styles.matrixScroll}>
              <table className={styles.matrix}>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Athlet</span>
                    </th>
                    {plan.tricks.map((trick) => (
                      <th scope="col" key={trick.id} title={trick.name}>
                        <span>{trick.name}</span>
                      </th>
                    ))}
                    <th scope="col" className={styles.matrixSum}>
                      Bestätigt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.assignments.map((assignment) => {
                    const confirmed = plan.tricks.filter((trick) => assignment.steps[trick.id] === 3).length;
                    return (
                      <tr key={assignment.shareId}>
                        <th scope="row">{shortName(assignment.athleteName)}</th>
                        {plan.tricks.map((trick) => {
                          const step = assignment.steps[trick.id];
                          const label = `${assignment.athleteName} · ${trick.name}: ${step === undefined ? "nicht im Plan" : stepLabels[step]}`;
                          if (step === undefined) {
                            return (
                              <td key={trick.id}>
                                <span className={`${styles.cell} ${styles.cellMissing}`} title={label}>
                                  –
                                </span>
                              </td>
                            );
                          }
                          const video = step === 2 && hasEvidence(cellKey(assignment.shareId, trick.id));
                          const content = step === 3 ? <Check size={16} strokeWidth={3} /> : step === 2 ? video ? <Play size={13} fill="currentColor" /> : "!" : null;
                          return (
                            <td key={trick.id}>
                              {step === 2 ? (
                                <button
                                  type="button"
                                  className={`${styles.cell} ${styles.cellReported}`}
                                  aria-label={`${label} – prüfen`}
                                  onClick={() => actions.openReview(plan, assignment, trick)}
                                >
                                  {content}
                                </button>
                              ) : (
                                <span className={`${styles.cell} ${styles[cellTone[step]]}`} title={label} aria-label={label} role="img">
                                  {content}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className={styles.matrixSum}>
                          {confirmed}/{plan.tricks.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Legend />
          </section>
        ) : (
          <p className={styles.empty}>Noch kein Plan ist Athleten zugewiesen. Weise einen Plan zu, um Fortschritte zu sehen.</p>
        )}
      </div>

      <aside className={styles.queue} aria-label="Warteschlange">
        <h3 className={styles.sectionLabel}>Wartet auf dich · {reports.length}</h3>
        {reports.length ? (
          reports.map((report) => (
            <QueueCard key={cellKey(report.assignment.shareId, report.trick.id)} report={report} actions={actions} />
          ))
        ) : (
          <p className={styles.emptyCard}>Keine offenen Meldungen. Alles geprüft!</p>
        )}
      </aside>
    </div>
  );
}

function Legend() {
  return (
    <ul className={styles.legend}>
      {stepLabels.map((label, step) => (
        <li key={label}>
          <span className={`${styles.legendDot} ${styles[cellTone[step as Step]]}`} />
          {label}
        </li>
      ))}
      <li>
        <Play size={10} fill="currentColor" /> mit Video
      </li>
    </ul>
  );
}

function QueueCard({ report, actions }: { report: WaitingReport; actions: HubActions }) {
  const { plan, assignment, trick, evidence } = report;
  const busy = actions.busyKey === cellKey(assignment.shareId, trick.id);
  return (
    <article className={styles.queueCard}>
      <button type="button" className={styles.queueHead} onClick={() => actions.openReview(plan, assignment, trick)}>
        <span className={`${styles.thumb} ${evidence ? "" : styles.thumbNote}`}>
          {evidence ? <Play size={14} fill="currentColor" aria-label="Video ansehen" /> : "Notiz"}
        </span>
        <span>
          <strong>
            {shortName(assignment.athleteName)} · {trick.name}
          </strong>
          <small>{evidence ? `Gemeldet ${formatRelative(evidence.submittedAt)}` : `Gemeldet · ${plan.title}`}</small>
        </span>
      </button>
      <p className={styles.queueNote}>
        {evidence?.athleteComment ? `„${evidence.athleteComment}“` : evidence ? "Keine Notiz" : "Ohne Video gemeldet"}
      </p>
      <div className={styles.decision}>
        <Button variant="secondary" disabled={busy} onClick={() => actions.practiceAgain(report, "")}>
          Nochmal üben
        </Button>
        <Button variant="success" disabled={busy} onClick={() => actions.confirm(report, "")}>
          <Check size={16} aria-hidden="true" /> Bestätigen
        </Button>
      </div>
    </article>
  );
}

/** Skater*innen: nur eigene Daten – Kacheln, Trickliste und eigene Meldungen. */
export function AthleteProgress({
  plans,
  plan,
  onSelect,
  evidence,
  onBack,
}: {
  plans: HubPlan[];
  plan: HubPlan | null;
  onSelect: (key: string) => void;
  evidence: TrainingVideoEvidence[];
  onBack: () => void;
}) {
  const w = words();
  const mine = plan?.assignments[0];
  const steps = plan && mine ? plan.tricks.map((trick) => mine.steps[trick.id] ?? 0) : [];
  const confirmed = steps.filter((step) => step === 3).length;
  const waiting = steps.filter((step) => step === 2).length;
  const open = steps.length - confirmed - waiting;

  // Meldungen aus allen erhaltenen Plänen; Meldungen ohne Video tauchen nur als Status auf.
  const trickName = (planId: string, trickId: string) =>
    plans.find((entry) => entry.key === planId)?.tricks.find((trick) => trick.id === trickId)?.name ?? "Trick";
  const withoutVideo = plans.flatMap((entry) =>
    entry.tricks
      .filter((trick) => entry.assignments[0]?.steps[trick.id] === 2)
      .filter((trick) => !evidence.some((item) => item.planId === entry.key && item.trickId === trick.id && item.reviewStatus === "pending"))
      .map((trick) => ({ plan: entry, trick })),
  );

  return (
    <div className={styles.progressLayout}>
      <div className={styles.progressMain}>
        <button type="button" className={`${styles.back} ${styles.mobileOnly}`} onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" /> Pläne
        </button>
        <h2 className={`${styles.screenTitle} ${styles.mobileOnly}`}>Mein Fortschritt</h2>
        <p className={styles.muted}>Nur du und {w.nom} sehen das.</p>
        <PlanChips plans={plans} selectedKey={plan?.key ?? ""} onSelect={onSelect} />
        {plan && mine ? (
          <>
            <div className={styles.tiles}>
              <div className={`${styles.tile} ${styles.tileGood}`}>
                <strong>{confirmed}</strong>
                <span>Bestätigt</span>
              </div>
              <div className={`${styles.tile} ${styles.tileWarn}`}>
                <strong>{waiting}</strong>
                <span>Wartet</span>
              </div>
              <div className={styles.tile}>
                <strong>{open}</strong>
                <span>Offen</span>
              </div>
            </div>
            <ul className={styles.trickList}>
              {plan.tricks.map((trick, index) => {
                const step = steps[index];
                const text = step === 3 ? "Bestätigt" : step === 2 ? `Wartet auf ${w.acc}` : step === 1 ? "Geübt" : "Offen";
                return (
                  <li key={trick.id}>
                    <div>
                      <strong>{trick.name}</strong>
                      <small className={step === 3 ? styles.textGood : step === 2 ? styles.textWarn : undefined}>{text}</small>
                    </div>
                    <span className={styles.segments} aria-label={text}>
                      <span className={step >= 1 ? styles.segPracticed : undefined} />
                      <span className={step >= 2 ? styles.segReported : undefined} />
                      <span className={step >= 3 ? styles.segConfirmed : undefined} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className={styles.empty}>Sobald dir ein Plan zugewiesen ist, siehst du hier deinen Fortschritt.</p>
        )}
      </div>

      <aside className={styles.queue} aria-label="Meine Meldungen">
        <h3 className={styles.sectionLabel}>Meine Meldungen</h3>
        {evidence.length || withoutVideo.length ? (
          <ul className={styles.reportList}>
            {withoutVideo.map(({ plan: entry, trick }) => (
              <li key={`${entry.key}:${trick.id}`}>
                <span className={`${styles.thumb} ${styles.thumbNote}`}>Notiz</span>
                <div>
                  <strong>{trick.name}</strong>
                  <small>Ohne Video gemeldet</small>
                </div>
                <span className={`${styles.pill} ${styles.pillWarn}`}>Wartet</span>
              </li>
            ))}
            {evidence.map((item) => {
              const url = buildYoutubeVideoUrl(item.videoId);
              const status =
                item.reviewStatus === "approved"
                  ? { label: "Bestätigt", tone: styles.pillGood, when: `Bestätigt ${formatDay(item.reviewedAt ?? item.submittedAt)}` }
                  : item.reviewStatus === "changes_requested"
                    ? { label: "Nochmal üben", tone: styles.pillBlue, when: item.trainerFeedback || "Bitte nochmal üben" }
                    : { label: "Wartet", tone: styles.pillWarn, when: `Gemeldet ${formatRelative(item.submittedAt)}` };
              return (
                <li key={item.id}>
                  {url ? (
                    <a className={styles.thumb} href={url} target="_blank" rel="noreferrer" aria-label="Video öffnen">
                      <Play size={14} fill="currentColor" />
                    </a>
                  ) : (
                    <span className={styles.thumb} />
                  )}
                  <div>
                    <strong>{trickName(item.planId, item.trickId)}</strong>
                    <small>{status.when}</small>
                  </div>
                  <span className={`${styles.pill} ${status.tone}`}>{status.label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.emptyCard}>Noch keine Meldungen. Melde einen geübten Trick aus deinem Pfad.</p>
        )}
      </aside>
    </div>
  );
}
