import Link from "next/link";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { recapQuota, reviewLabels, type SessionRecap } from "@/domain/training-recap";
import { ReviewForm } from "./review-form";
import styles from "@/features/training/training.module.css";

const date = (value: string) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
const duration = (ms: number) => `${Math.floor(ms / 60000)} min ${Math.floor(ms / 1000) % 60} s`;

/** Rechtefilterung erfolgt in der DB, bevor Daten an Seite und Formular gelangen. */
export default async function ProgressPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("training_recaps");
  const recaps = (data ?? []) as SessionRecap[];
  // Derselbe stabile Skill-Schlüssel verbindet gespeicherte Sessions eines Athleten.
  // Quoten werden gewichtet aus Summen berechnet, niemals aus Prozentmitteln.
  const skills = new Map<string, { athlete: string; name: string; attempts: number; landed: number; sessions: number }>();
  if (!error) for (const r of recaps) for (const e of r.exercises) {
    if (!e.attempts) continue;
    const key = `${r.athlete_id}:${e.skill_id}`;
    const item = skills.get(key) ?? { athlete: r.athlete_name, name: e.name, attempts: 0, landed: 0, sessions: 0 };
    item.attempts += e.attempts; item.landed += e.landed; item.sessions += 1; skills.set(key, item);
  }
  return <div className={`${styles.workspace} ${styles.recap}`}>
    <header className={styles.header}><div><span className={styles.eyebrow}>TRAINING</span><h1>Session-Rückblick & Fortschritt</h1></div><Link href="/trainingsplaene">Zu den Trainings</Link></header>
    {error ? <p role="alert" className={styles.error}>Die Ergebnisse konnten nicht geladen werden. Bitte die Seite erneut laden.</p> : <>
      <p>Deine gespeicherten Ergebnisse im Verlauf. Landungen sind keine Skill-Bestätigung. Allgemeine Notizen aus betreutem Training sind nur für berechtigte Trainer sichtbar.</p>
      {recaps.length === 0 && <p>Noch keine abgeschlossenen Sessions für deinen aktuellen Zugriff vorhanden.</p>}
      {skills.size > 0 && <section><h2>Skills aus deinen Trainingsdaten</h2><div className={styles.grid}>{[...skills].map(([key, s]) => <article key={key} className={styles.card}><h3>{s.name}</h3><p>{s.athlete} · {s.sessions} Sessions mit Versuchen</p><p>{s.landed} Landungen / {s.attempts} Versuche · {recapQuota(s.attempts, s.landed)}</p></article>)}</div></section>}
      <section><h2>Persönlicher Verlauf · neueste Session zuerst</h2>
        {recaps.map(r => {
          const attempts = r.exercises.reduce((n, e) => n + e.attempts, 0);
          const landed = r.exercises.reduce((n, e) => n + e.landed, 0);
          const measured = r.exercises.reduce((n, e) => n + Number(e.elapsed_ms), 0);
          const confirmed = r.reviews.filter(v => v.kind === "confirmation" && !r.reviews.some(n => n.supersedes === v.id));
          return <article key={r.participant_id} className={styles.card}>
            <h3>{r.title} · {r.athlete_name}</h3>
            <p>Abgeschlossen: {date(r.completed_at)} · {r.present ? "Als anwesend erfasst" : "Als abwesend erfasst"}</p>
            <p>{landed} Landungen / {attempts} Versuche · {recapQuota(attempts, landed)}</p>
            <p>Session-Zeitraum: {date(r.started_at)} bis {date(r.completed_at)} ({duration(Math.max(0, Date.parse(r.completed_at) - Date.parse(r.started_at)))} einschließlich Pausen).</p>
            <p>Gemessene Übungszeit: {duration(measured)}{r.mode === "group" ? " · gemeinsame Gruppenzeit, keine individuelle Trainingsdauer" : " · Summe der Übungstimer"}.</p>
            <p>{confirmed.length ? `${confirmed.length} ausdrückliche Fortschrittsbestätigung(en), siehe Ergänzungen.` : "Keine ausdrücklich bestätigten Fortschritte in dieser Session."}</p>
            <details><summary>Übungen, Skills und vorhandene Notizen</summary>
              {r.note && <p className={styles.savedNote}>Session-Notiz: {r.note}</p>}
              {r.exercises.map(e => <div key={e.id} className={styles.card}><h4>{e.name}</h4>
                <p>{e.attempts ? `${e.landed} Landungen / ${e.attempts} Versuche` : "Keine persönlichen Versuche erfasst"} · {recapQuota(e.attempts, e.landed)}</p>
                <p>Übungstimer: {duration(Number(e.elapsed_ms))}{r.mode === "group" ? " (Gruppe)" : ""}. {!e.attempts && "Kein persönlicher Bearbeitungsnachweis aus Versuchen."}</p>
                {e.note && <p className={styles.savedNote}>Übungsnotiz: {e.note}</p>}{e.trainer_note && <p className={styles.savedNote}>Hinweis aus dem Plan: {e.trainer_note}</p>}
              </div>)}
            </details>
            <details open={r.reviews.length > 0}><summary>Persönliche Hinweise, Ziele und Bestätigungen ({r.reviews.length})</summary>
              {!r.reviews.length && <p>Noch keine Ergänzungen.</p>}
              {r.reviews.map(v => <div key={v.id} id={`review-${v.id}`} className={styles.card}>
                <strong>{reviewLabels[v.kind]}{v.exercise_id ? ` · ${r.exercises.find(e => e.id === v.exercise_id)?.name ?? "Übung"}` : ""}</strong>
                <p className={styles.savedNote}>{v.body}</p><p>{v.author_name} · {v.author_role === "self" ? "Selbsteinschätzung" : "Trainer"} · {date(v.created_at)}</p>
                {v.supersedes && <p>Korrektur zu <a href={`#review-${v.supersedes}`}>vorherigem Eintrag</a>.</p>}
                {r.reviews.some(n => n.supersedes === v.id) && <p>Durch spätere Korrektur ersetzt; als Nachweis erhalten.</p>}
              </div>)}
            </details>
            {(r.is_self || r.can_review) && <ReviewForm key={r.reviews.length} recap={r} requestId={randomUUID()} />}
          </article>;
        })}
      </section>
    </>}
  </div>;
}
