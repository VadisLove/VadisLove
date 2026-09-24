"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import {
  TRICK_CATEGORY_LABELS,
  emptyParkContent,
  formatScore,
  type ParkDirectory,
} from "@/domain/parks";
import { useParkCommand } from "./use-park-command";
import styles from "./parks.module.css";

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

/**
 * Übersicht: alle öffentlichen Parks, eigene bzw. betreute Runs und – nur für
 * Trainer/Funktionäre – offene Trick-Vorschläge zur Freigabe.
 */
export function ParkDirectoryView({ initial }: { initial: ParkDirectory | null }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const command = useParkCommand<ParkDirectory>();

  if (!data)
    return (
      <div className={styles.page}>
        <h1>Skateparks</h1>
        <p className={styles.message}>Parks konnten nicht geladen werden. Bitte Seite neu laden.</p>
      </div>
    );

  const q = query.trim().toLowerCase();
  const parks = data.parks.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q),
  );

  async function createPark(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return command.setMessage("Bitte einen Namen angeben.");
    const parkId = crypto.randomUUID();
    const outcome = await command.run("park_create", {
      park_id: parkId,
      name: name.trim(),
      location: location.trim(),
      content: emptyParkContent(),
    });
    // Neue Parks öffnen direkt im Bearbeitungsmodus, damit sie nachgebaut werden können.
    if (outcome.ok) router.push(`/skateparks/${parkId}?bearbeiten=1`);
  }

  async function review(trickId: string, decision: "approved" | "rejected") {
    const outcome = await command.run("trick_review", { trick_id: trickId, decision }, null);
    if (outcome.ok && outcome.state) setData(outcome.state);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Skateparks</h1>
          <p>Parks nachbauen und Runs mit Trickfolge, Richtung und Scores planen.</p>
        </div>
        <button type="button" className={styles.primary} onClick={() => dialog.current?.showModal()}>
          <Plus size={18} /> Park anlegen
        </button>
      </div>

      {command.message ? (
        <div className={styles.message} role="status">
          <span>{command.message}</span>
          {command.canRetry ? (
            <button type="button" className={styles.button} onClick={() => command.retry()}>
              Erneut versuchen
            </button>
          ) : null}
        </div>
      ) : null}

      {data.runs.length > 0 ? (
        <section className={styles.section}>
          <h2>Runs</h2>
          <ul className={styles.list}>
            {data.runs.slice(0, 12).map((run) => (
              <li key={run.id}>
                <Link href={`/skateparks/${run.park_id}?run=${run.id}`} className={styles.listItem}>
                  <div>
                    <strong>{run.title}</strong>
                    <span className={styles.muted}>
                      {run.park_name} · {run.athlete.display_name} · {run.steps.length} Tricks
                      {run.event
                        ? ` · ${run.event.title}, ${dateFormat.format(new Date(run.event.starts_at))}`
                        : ""}
                    </span>
                  </div>
                  {run.actual_score !== null ? (
                    <span className={styles.badge}>{formatScore(run.actual_score)}</span>
                  ) : run.target_score !== null ? (
                    <span className={styles.badge}>Ziel {formatScore(run.target_score)}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.section}>
        <h2>Alle Parks</h2>
        <input
          className={styles.search}
          type="search"
          placeholder="Park oder Ort suchen"
          aria-label="Park oder Ort suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {parks.length === 0 ? (
          <p className={styles.muted}>
            {data.parks.length === 0
              ? "Noch keine Parks. Lege den ersten an und baue ihn aus der Obstacle-Bibliothek nach."
              : "Kein Park passt zur Suche."}
          </p>
        ) : (
          <div className={styles.grid}>
            {parks.map((park) => (
              <Link key={park.id} href={`/skateparks/${park.id}`} className={styles.parkCard}>
                <strong>{park.name}</strong>
                <span className={styles.muted}>{park.location || "Ohne Ortsangabe"}</span>
                <span className={styles.muted}>
                  {park.obstacle_count ?? 0} Obstacles
                  {park.run_count ? ` · ${park.run_count} Runs` : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {data.is_curator && data.pending_tricks.length > 0 ? (
        <section className={styles.section}>
          <h2>Trick-Vorschläge</h2>
          <p className={styles.muted} style={{ marginBottom: 10 }}>
            Freigegebene Tricks stehen allen im Katalog zur Verfügung.
          </p>
          <ul className={styles.list}>
            {data.pending_tricks.map((trick) => (
              <li key={trick.id} className={styles.listItem}>
                <div>
                  <strong>{trick.name}</strong>
                  <span className={styles.muted}>{TRICK_CATEGORY_LABELS[trick.category]}</span>
                </div>
                <div className={styles.row}>
                  <button type="button" className={styles.button} disabled={command.busy} onClick={() => review(trick.id, "rejected")}>
                    Ablehnen
                  </button>
                  <button type="button" className={styles.primary} disabled={command.busy} onClick={() => review(trick.id, "approved")}>
                    Freigeben
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <dialog ref={dialog} className={styles.dialog} aria-labelledby="create-park-title">
        <form className={styles.form} onSubmit={createPark}>
          <h2 id="create-park-title">Park anlegen</h2>
          <p className={styles.muted}>
            Parks sind für alle angemeldeten Nutzer sichtbar. Danach baust du ihn aus der
            Obstacle-Bibliothek nach.
          </p>
          <label className={styles.field}>
            Name
            <input value={name} maxLength={120} required autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={styles.field}>
            Ort (optional)
            <input value={location} maxLength={200} placeholder="z. B. München, Olympiapark" onChange={(e) => setLocation(e.target.value)} />
          </label>
          <div className={styles.row} style={{ justifyContent: "flex-end" }}>
            <button type="button" className={styles.button} onClick={() => dialog.current?.close()}>
              Abbrechen
            </button>
            <button type="submit" className={styles.primary} disabled={command.busy}>
              {command.busy ? "Legt an …" : "Anlegen und nachbauen"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
