"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveLabel,
  daysLeft,
  initialsOf,
  shortName,
  type HubGroup,
  type LibraryEntry,
} from "./plan-hub-model";
import { Sheet } from "./plan-sheets";
import styles from "./plan-hub.module.css";

/*
 * Archiv & Papierkorb der Trainingspläne (Review 08.09., Punkt 7).
 * Regeln und Rechte prüft die Datenbank (Migration 20260930100000); diese
 * Bausteine zeigen nur, was `training_plan_library` für die Person liefert.
 */

/* ------------------------------------------------------------------ */
/* Umschalter Aktiv · Entwürfe · Archiv (· Verein)                       */
/* ------------------------------------------------------------------ */

export type PlanSegment = "aktiv" | "entwuerfe" | "archiv" | "verein";

export function PlanSegments({
  value,
  options,
  onChange,
}: {
  value: PlanSegment;
  options: { id: PlanSegment; label: string; count: number }[];
  onChange: (next: PlanSegment) => void;
}) {
  return (
    <div className={styles.segments} role="tablist" aria-label="Pläne filtern">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? styles.segmentOn : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          <span>{option.count}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Menü „…“                                                              */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  onSelect: () => void;
}

/** Kleines Aufklappmenü; Escape und Klick daneben schließen es. */
export function PlanMenu({ items, label = "Weitere Aktionen" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div className={styles.menuRoot} ref={root}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {open ? (
        <ul className={styles.menu} role="menu">
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={item.danger ? styles.menuDanger : undefined}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <strong>{item.label}</strong>
                {item.hint ? <small>{item.hint}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reaktivieren: Wem zuweisen?                                          */
/* ------------------------------------------------------------------ */

export interface ReactivateInput {
  athleteIds: string[];
  groupIds: string[];
  club: boolean;
}

/**
 * Bisherige Athlet*innen sind vorausgewählt; Abgewählte behalten den Plan
 * unter „Erledigt“. Neue Athlet*innen und Gruppen nur beim eigenen,
 * gespeicherten Plan. Ohne Auswahl wird der Plan zum Entwurf.
 */
export function ReactivateSheet({
  entry,
  candidates,
  groups,
  clubs,
  busy,
  onSubmit,
  onClose,
}: {
  entry: LibraryEntry;
  /** Weitere zuweisbare Athlet*innen (leer, wenn nur bisherige erlaubt sind). */
  candidates: { id: string; name: string }[];
  groups: HubGroup[];
  /** Vorstand: „Alle Gruppen im Verein“ (leer für Trainer*innen). */
  clubs: HubGroup[];
  busy: boolean;
  onSubmit: (input: ReactivateInput) => void;
  onClose: () => void;
}) {
  const previous = entry.athletes;
  const [athletes, setAthletes] = useState<Set<string>>(() => new Set(previous.map((athlete) => athlete.id)));
  const [groupIds, setGroupIds] = useState<Set<string>>(() => new Set());
  const [club, setClub] = useState(false);
  const canAssignNew = entry.own && !entry.legacy;
  const others = canAssignNew ? candidates.filter((person) => !previous.some((athlete) => athlete.id === person.id)) : [];

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const count = athletes.size;
  const nothing = count === 0 && groupIds.size === 0 && !club;

  const row = (id: string, name: string, on: boolean, sub: string, onClick: () => void) => (
    <button key={id} type="button" className={`${styles.checkRow} ${on ? styles.checkRowOn : ""}`} aria-pressed={on} onClick={onClick}>
      <span className={styles.checkBox} aria-hidden="true">
        {on ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      <span className={styles.checkText}>
        <strong>{name}</strong>
        {sub ? <small>{sub}</small> : null}
      </span>
    </button>
  );

  return (
    <Sheet label="Plan reaktivieren" onClose={onClose}>
      <h2 className={styles.sheetHeading}>Wem zuweisen?</h2>
      <p className={styles.sheetLead}>
        „{entry.title}“ wird wieder aktiv. Abgewählte Athleten behalten den Plan unter „Erledigt“.
      </p>
      {previous.length ? (
        <section className={styles.groupRows}>
          <h3 className={styles.rightsGroup}>Bisher</h3>
          {previous.map((athlete) =>
            row(
              athlete.id,
              shortName(athlete.name),
              athletes.has(athlete.id),
              athlete.history ? "Fortschritt bleibt erhalten" : "",
              () => setAthletes((current) => toggle(current, athlete.id)),
            ),
          )}
        </section>
      ) : null}
      {others.length || (canAssignNew && (groups.length || clubs.length)) ? (
        <section className={styles.groupRows}>
          <h3 className={styles.rightsGroup}>Weitere</h3>
          {clubs.length
            ? row("club", "Alle Gruppen im Verein", club, "Neue Vereinsathleten erhalten den Plan automatisch", () => setClub((current) => !current))
            : null}
          {groups.map((group) =>
            row(group.id, group.name, groupIds.has(group.id), `${group.athleteIds.length} Athleten`, () =>
              setGroupIds((current) => toggle(current, group.id)),
            ),
          )}
          {others.map((person) =>
            row(person.id, shortName(person.name), athletes.has(person.id), "", () =>
              setAthletes((current) => toggle(current, person.id)),
            ),
          )}
        </section>
      ) : null}
      {!canAssignNew ? (
        <p className={styles.fieldHint}>
          {entry.legacy
            ? "Älterer Plan ohne gespeicherte Vorlage: nur bisherige Athleten möglich."
            : `Neue Athleten weist nur ${shortName(entry.ownerName)} zu.`}
        </p>
      ) : null}
      <Button
        size="lg"
        className={styles.sheetSubmit}
        disabled={busy}
        onClick={() => onSubmit({ athleteIds: [...athletes], groupIds: [...groupIds], club })}
      >
        {nothing
          ? "Als Entwurf reaktivieren"
          : `Reaktivieren${count ? ` · ${count} ${count === 1 ? "Athlet" : "Athleten"}` : ""}`}
      </Button>
      <p className={styles.fieldHint}>Ohne Auswahl landet der Plan bei den Entwürfen.</p>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Löschen: Rückfrage                                                   */
/* ------------------------------------------------------------------ */

/** Rückfrage mit Wirkung je Athlet*in: mit Verlauf bleibt, ohne verschwindet. */
export function DeleteSheet({
  entry,
  busy,
  onConfirm,
  onClose,
}: {
  entry: LibraryEntry;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const kept = entry.athletes.filter((athlete) => athlete.history).length;
  const removed = entry.athletes.length - kept;
  const people = (n: number) => `${n} ${n === 1 ? "Athlet" : "Athleten"}`;
  return (
    <Sheet label="Plan löschen" onClose={onClose}>
      <h2 className={styles.sheetHeading}>„{entry.title}“ löschen?</h2>
      <p className={styles.sheetLead}>30 Tage im Papierkorb, danach endgültig.</p>
      <ul className={styles.rightsList}>
        {kept ? (
          <li>
            <span className={styles.rightsText}>
              <strong>{people(kept)} mit Verlauf</strong>
              <small>Behalten den Plan unter „Erledigt“: Tricks, Nachweise, Sessions und Rückblicke bleiben nachvollziehbar.</small>
            </span>
          </li>
        ) : null}
        {removed ? (
          <li>
            <span className={styles.rightsText}>
              <strong>{people(removed)} ohne Verlauf</strong>
              <small>Der Plan verschwindet bei {removed === 1 ? "ihm" : "ihnen"} vollständig.</small>
            </span>
          </li>
        ) : null}
        {!entry.athletes.length ? (
          <li>
            <span className={styles.rightsText}>
              <strong>Keinem Athleten zugewiesen</strong>
              <small>Der Plan wird nach der Frist vollständig entfernt.</small>
            </span>
          </li>
        ) : null}
      </ul>
      <Button variant="danger" size="lg" className={styles.sheetSubmit} disabled={busy} onClick={onConfirm}>
        In den Papierkorb
      </Button>
      <Button variant="secondary" size="lg" className={styles.sheetSubmit} onClick={onClose}>
        Abbrechen
      </Button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Papierkorb und Vereinspläne                                          */
/* ------------------------------------------------------------------ */

/** Gelöschte Pläne mit Restfrist; eine Aktion je Zeile: Wiederherstellen. */
export function TrashView({
  entries,
  busyKey,
  onRestore,
  onBack,
}: {
  entries: LibraryEntry[];
  busyKey: string;
  onRestore: (entry: LibraryEntry) => void;
  onBack: () => void;
}) {
  return (
    <section className={styles.archivePanel}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ChevronLeft size={18} aria-hidden="true" /> Pläne
      </button>
      <h2 className={styles.sheetHeading}>Papierkorb</h2>
      <p className={styles.muted}>
        Nach 30 Tagen endgültig gelöscht. Fortschritt, Nachweise und Rückblicke der Athleten mit Verlauf bleiben immer erhalten.
      </p>
      {entries.length ? (
        <ul className={styles.rowList}>
          {entries.map((entry) => {
            const days = daysLeft(entry.purgeAt);
            return (
              <li key={`${entry.ownerId}:${entry.key}`} className={styles.archiveRow}>
                <span className={styles.rightsText}>
                  <strong>{entry.title}</strong>
                  <small>
                    {days === 0 ? "Wird heute bereinigt" : `Noch ${days} ${days === 1 ? "Tag" : "Tage"}`}
                    {entry.own ? "" : ` · von ${shortName(entry.ownerName)}`}
                  </small>
                </span>
                <Button
                  variant="secondary"
                  disabled={busyKey === entry.key || days === 0}
                  onClick={() => onRestore(entry)}
                >
                  Wiederherstellen
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.emptyCard}>Der Papierkorb ist leer.</p>
      )}
    </section>
  );
}

/**
 * Vorstand: Pläne der Trainer*innen verwalteter Vereine, z. B. wenn jemand
 * ausscheidet. Aktionen im Menü je Zeile.
 */
export function ClubPlansView({
  entries,
  onArchive,
  onReactivate,
  onDelete,
}: {
  entries: LibraryEntry[];
  onArchive: (entry: LibraryEntry) => void;
  onReactivate: (entry: LibraryEntry) => void;
  onDelete: (entry: LibraryEntry) => void;
}) {
  if (!entries.length) return <p className={styles.emptyCard}>Keine Pläne anderer Trainer in deinem Verein.</p>;
  return (
    <ul className={styles.rowList}>
      {entries.map((entry) => {
        const archived = Boolean(entry.archivedAt);
        const active = entry.athletes.filter((athlete) => !athlete.archived).length;
        return (
          <li key={`${entry.ownerId}:${entry.key}`} className={styles.archiveRow}>
            <span className={styles.avatar}>{initialsOf(entry.ownerName)}</span>
            <span className={styles.rightsText}>
              <strong>{entry.title}</strong>
              <small>
                {shortName(entry.ownerName)} ·{" "}
                {archived
                  ? archiveLabel({ archivedAt: entry.archivedAt ?? undefined, archivedReason: entry.archivedReason ?? undefined }, "staff")
                  : active
                    ? `${active} ${active === 1 ? "Athlet" : "Athleten"}`
                    : "Entwurf"}
              </small>
            </span>
            <PlanMenu
              label={`Aktionen für ${entry.title}`}
              items={[
                archived
                  ? { label: "Reaktivieren", hint: "Nur bisherige Athleten", onSelect: () => onReactivate(entry) }
                  : { label: "Als erledigt markieren", hint: "Kommt ins Archiv", onSelect: () => onArchive(entry) },
                { label: "Löschen", hint: "30 Tage im Papierkorb", danger: true, onSelect: () => onDelete(entry) },
              ]}
            />
          </li>
        );
      })}
    </ul>
  );
}
