import type {
  AthletePersonalGoal,
  CalendarEvent,
  EvaluationContestOverride,
  EvaluationSkillRating,
  Person,
} from "@/domain/models";
import {
  formatAverage,
  formatDate,
  ratingDelta,
  skillCategoryMeta,
  type AthleteMetrics,
  type CategorySummary,
  type TrickGoal,
} from "./evaluation-model";
import styles from "./evaluation-print.module.css";

/**
 * Druckansicht fürs Auswertungsgespräch. Sie wird nur während des Druckens
 * direkt unter <body> eingehängt; globals.css blendet dann den App-Rahmen aus.
 * „Als PDF sichern“ im Druckdialog erzeugt das PDF für den Athleten.
 */
export function EvaluationPrint({
  athlete,
  from,
  to,
  squad,
  conversationOn,
  dalidStatus,
  metrics,
  summaries,
  ratings,
  previousRatings,
  previousDate,
  contests,
  contestOverrides,
  trickGoals,
  personalGoals,
  personalNotes,
  measures,
  fontClassName,
}: {
  athlete: Person;
  from: string;
  to: string;
  squad: string;
  conversationOn: string;
  dalidStatus: string;
  metrics: AthleteMetrics | null;
  summaries: CategorySummary[];
  ratings: Record<string, EvaluationSkillRating>;
  previousRatings: Record<string, number>;
  previousDate: string;
  contests: CalendarEvent[];
  contestOverrides: Record<string, EvaluationContestOverride>;
  trickGoals: TrickGoal[];
  personalGoals: AthletePersonalGoal[];
  personalNotes: string;
  measures: string;
  fontClassName: string;
}) {
  const reached = trickGoals.filter((goal) => goal.done);
  const open = trickGoals.filter((goal) => !goal.done);

  return (
    <div data-print-root className={`${fontClassName} ${styles.sheet}`}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>Trainer Hub · Auswertungsgespräch</span>
          <h1>{athlete.name}</h1>
          <p>
            Zeitraum {formatDate(from)} – {formatDate(to)}
            {squad ? ` · Kader ${squad}` : ""}
            {conversationOn ? ` · Gespräch am ${formatDate(conversationOn)}` : ""}
            {dalidStatus ? ` · Status: ${dalidStatus}` : ""}
          </p>
        </div>
        <dl className={styles.kpis}>
          <div><dt>Anwesenheit</dt><dd>{metrics?.attendance ?? 0} %</dd></div>
          <div><dt>Contests</dt><dd>{metrics?.contestCount ?? 0}</dd></div>
          <div><dt>Trickziele</dt><dd>{reached.length}/{trickGoals.length}</dd></div>
          <div><dt>Score</dt><dd>{metrics?.overall ?? 0}</dd></div>
        </dl>
      </header>

      <section>
        <h2>Bewertung {previousDate ? <small>· Vergleich mit {formatDate(previousDate)}</small> : null}</h2>
        <table className={styles.table}>
          <thead>
            <tr><th>Kriterium</th><th>Jetzt</th><th>Zuvor</th><th>Δ</th><th>Notiz</th></tr>
          </thead>
          {summaries.map((summary) => (
            <tbody key={summary.category}>
              <tr className={styles.groupRow}>
                <td colSpan={5}>
                  {skillCategoryMeta[summary.category].number} {skillCategoryMeta[summary.category].title}
                  <span>Ø {formatAverage(summary.average)}{previousDate ? ` · zuvor ${formatAverage(summary.previousAverage)}` : ""}</span>
                </td>
              </tr>
              {summary.skills.map((skill) => {
                const current = ratings[skill.key]?.rating || undefined;
                const previous = previousRatings[skill.key];
                const delta = ratingDelta(current, previous);
                return (
                  <tr key={skill.key}>
                    <td>{skill.label}</td>
                    <td className={styles.value}>{current ?? "–"}</td>
                    <td className={styles.value}>{previous ?? "–"}</td>
                    <td className={styles.value}>{delta.tone === "open" || delta.tone === "new" ? "" : delta.label}</td>
                    <td className={styles.note}>{ratings[skill.key]?.note || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
        <p className={styles.legend}>Skala: 1 Einstieg · 2 Grundlagen · 3 Sicher · 4 Stark · 5 Top-Niveau</p>
      </section>

      <div className={styles.columns}>
        <section>
          <h2>Trickziele aus Trainingsplänen</h2>
          <p className={styles.listTitle}>Erreicht ({reached.length})</p>
          <p>{reached.map((goal) => goal.title).join(" · ") || "–"}</p>
          <p className={styles.listTitle}>Offen ({open.length})</p>
          <p>{open.map((goal) => goal.title).join(" · ") || "–"}</p>
        </section>
        <section>
          <h2>Persönliche Ziele</h2>
          {personalGoals.length ? (
            <ul className={styles.goals}>
              {personalGoals.map((goal) => <li key={goal.id}>{goal.completed ? "✓" : "○"} {goal.title}</li>)}
            </ul>
          ) : <p>–</p>}
          {contests.length ? (
            <>
              <h2>Contests</h2>
              <ul className={styles.goals}>
                {contests.map((contest) => {
                  const override = contestOverrides[contest.id];
                  return (
                    <li key={contest.id}>
                      {formatDate(contest.date)} · {contest.title}
                      {override?.placement ? ` · Platz ${override.placement}` : ""}
                      {override?.category ? ` (${override.category})` : ""}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>
      </div>

      <section className={styles.textBlock}>
        <h2>Persönliche Bemerkung</h2>
        <p>{personalNotes || "–"}</p>
      </section>
      <section className={styles.textBlock}>
        <h2>Vereinbarte Maßnahmen</h2>
        <p>{measures || "–"}</p>
      </section>

      <footer className={styles.signatures}>
        <div><span />Athlet*in</div>
        <div><span />Trainer*in</div>
        <div><span />Datum</div>
      </footer>
    </div>
  );
}
