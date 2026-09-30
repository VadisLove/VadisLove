"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchShareTargets, type ShareTargets } from "@/app/trainingsplaene/actions";
import { formatDay, initialsOf, isLineTrick, shortName, type HubPlan, type SharedPlanOffer } from "./plan-hub-model";
import { Sheet } from "./plan-sheets";
import styles from "./plan-hub.module.css";

/* ------------------------------------------------------------------ */
/* Teilen-Sheet (Ersteller)                                             */
/* ------------------------------------------------------------------ */

type Person = ShareTargets["people"][number];

/**
 * „Plan teilen“: Suche über alle Trainer*innen (Name oder Verein) und
 * Schnellauswahl „Alle Trainer meines Vereins“. Eine Hauptaktion (Senden).
 * Empfänger*innen erhalten den Plan als Vorschlag zum Annehmen/Ablehnen.
 */
export function ShareSheet({
  plan,
  busy,
  onSubmit,
  onClose,
}: {
  plan: HubPlan;
  busy: boolean;
  onSubmit: (input: { recipientIds: string[]; clubIds: string[] }) => void;
  onClose: () => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<ShareTargets | null>(null);
  const [failed, setFailed] = useState(false);
  // Gewählte Personen bleiben sichtbar, auch wenn sie nicht mehr zum Suchbegriff passen.
  const [picked, setPicked] = useState<Map<string, Person>>(() => new Map());
  const [clubIds, setClubIds] = useState<Set<string>>(() => new Set());
  const [clubs, setClubs] = useState<ShareTargets["clubs"]>([]);
  const requestRef = useRef(0);

  // Suche mit kurzer Verzögerung; ältere Antworten werden verworfen.
  useEffect(() => {
    const request = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      const result = await searchShareTargets(query);
      if (request !== requestRef.current) return;
      setFailed(!result);
      setTargets(result);
      if (result && !query.trim()) setClubs(result.clubs);
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  const people = query.trim().length >= 2 ? (targets?.people ?? []) : [];
  const pickedOnly = [...picked.values()].filter((person) => !people.some((entry) => entry.id === person.id));
  const total = picked.size + clubs.filter((club) => clubIds.has(club.id)).reduce((sum, club) => sum + club.count, 0);

  function togglePerson(person: Person) {
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(person.id)) next.delete(person.id);
      else if (next.size < 50) next.set(person.id, person);
      return next;
    });
  }

  function toggleClub(id: string) {
    setClubIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const personRow = (person: Person) => {
    const on = picked.has(person.id);
    return (
      <button
        key={person.id}
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={[person.name, person.organization].filter(Boolean).join(", ")}
        className={`${styles.checkRow} ${on ? styles.checkRowOn : ""}`}
        onClick={() => togglePerson(person)}
      >
        <span className={styles.avatar}>{initialsOf(person.name)}</span>
        <span className={styles.checkText}>
          <strong>{person.name}</strong>
          {person.organization ? <small>{person.organization}</small> : null}
        </span>
        <span className={styles.checkBox} aria-hidden="true">
          {on ? <Check size={14} strokeWidth={3} /> : null}
        </span>
      </button>
    );
  };

  return (
    <Sheet label={`„${plan.title}“ teilen`} onClose={onClose}>
      <h2 className={styles.sheetHeading}>Plan teilen</h2>
      <p className={styles.sheetLead}>
        Andere Trainer erhalten den Plan zur Ansicht. Nach Annahme bekommen sie eine eigene Kopie.
      </p>

      <div className={styles.field}>
        <label htmlFor={searchId} className={styles.srOnly}>
          Trainer suchen
        </label>
        <div className={styles.searchInput}>
          <Search size={16} aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            placeholder="Name oder Verein"
            autoComplete="off"
            value={query}
            maxLength={80}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.shareRows}>
        {clubs.map((club) => {
          const on = clubIds.has(club.id);
          return (
            <button
              key={club.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={`Alle Trainer meines Vereins, ${club.name}`}
              disabled={!club.count}
              className={`${styles.checkRow} ${on ? styles.checkRowOn : ""}`}
              onClick={() => toggleClub(club.id)}
            >
              <span className={`${styles.entryIcon} ${styles.entryBlue}`} aria-hidden="true">
                <Users size={18} />
              </span>
              <span className={styles.checkText}>
                <strong>Alle Trainer meines Vereins</strong>
                <small>
                  {club.name} · {club.count ? `${club.count} ${club.count === 1 ? "Person" : "Personen"}` : "keine weiteren"}
                </small>
              </span>
              <span className={styles.checkBox} aria-hidden="true">
                {on ? <Check size={14} strokeWidth={3} /> : null}
              </span>
            </button>
          );
        })}
        {pickedOnly.map(personRow)}
        {people.map(personRow)}
      </div>

      {failed ? (
        <p className={styles.errorBox}>Die Suche ist gerade nicht verfügbar. Bitte später erneut versuchen.</p>
      ) : query.trim().length === 1 ? (
        <p className={styles.fieldHint}>Mindestens zwei Zeichen eingeben.</p>
      ) : query.trim().length >= 2 && targets && !people.length ? (
        <p className={styles.fieldHint}>Keine Trainer gefunden.</p>
      ) : null}

      <Button
        size="lg"
        className={styles.sheetSubmit}
        disabled={busy || total === 0}
        onClick={() => onSubmit({ recipientIds: [...picked.keys()], clubIds: [...clubIds] })}
      >
        {total ? `An ${total} Trainer senden` : "Empfänger auswählen"}
      </Button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Geteilte Pläne (Empfänger)                                           */
/* ------------------------------------------------------------------ */

/** Einstieg in der Planübersicht; erscheint nur bei offenen geteilten Plänen. */
export function SharedPlansEntry({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (!count) return null;
  return (
    <button type="button" className={`${styles.entryCard} ${styles.entryShared}`} onClick={onOpen}>
      <span className={`${styles.entryIcon} ${styles.entryPurple}`}>{count}</span>
      <span>
        <strong>
          {count === 1 ? "1 geteilter Plan" : `${count} geteilte Pläne`} für dich
        </strong>
        <small>Ansehen, annehmen oder ablehnen</small>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}

function senderLine(offer: SharedPlanOffer) {
  return [`Von ${shortName(offer.senderName || "Unbekannt")}`, offer.senderOrganization, offer.sharedAt ? formatDay(offer.sharedAt) : ""]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Liste und Vorschau geteilter Pläne. Annehmen legt einen eigenen Entwurf an,
 * Ablehnen entfernt den Vorschlag (der Absender erfährt davon nichts).
 */
export function SharedPlansView({
  offers,
  busyKey,
  onAccept,
  onDecline,
  onBack,
}: {
  offers: SharedPlanOffer[];
  busyKey: string;
  onAccept: (offer: SharedPlanOffer) => void;
  onDecline: (offer: SharedPlanOffer) => void;
  onBack: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(offers.length === 1 ? offers[0].id : null);
  const open = offers.find((offer) => offer.id === openId) ?? null;

  if (open) {
    const busy = busyKey === open.id;
    return (
      <section className={styles.archivePanel}>
        <button
          type="button"
          className={styles.back}
          onClick={() => (offers.length > 1 ? setOpenId(null) : onBack())}
        >
          <ChevronLeft size={18} aria-hidden="true" /> {offers.length > 1 ? "Geteilte Pläne" : "Pläne"}
        </button>
        <div>
          <div className={styles.pills}>
            <span className={`${styles.pill} ${styles.pillTemplate}`}>Geteilt</span>
          </div>
          <h2 className={styles.planTitle}>{open.title}</h2>
          <p className={styles.planSub}>{senderLine(open)}</p>
        </div>
        {open.category || open.level ? (
          <p className={styles.muted}>{[open.category, open.level, `${open.tricks.length} Tricks`].filter(Boolean).join(" · ")}</p>
        ) : null}
        {open.description ? <p>{open.description}</p> : null}
        <ol className={styles.shareTricks} aria-label="Tricks im Plan">
          {open.tricks.map((trick, index) => (
            <li key={trick.id} className={styles.archiveRow}>
              <span className={styles.shareIndex}>{index + 1}</span>
              <span className={styles.rightsText}>
                <strong>
                  {trick.name}
                  {isLineTrick(trick) ? <span className={styles.lineBadge}>LINE</span> : null}
                </strong>
                {trick.hint ? <small>{trick.hint}</small> : null}
              </span>
              {trick.goal ? <span className={styles.muted}>{trick.goal}</span> : null}
            </li>
          ))}
        </ol>
        <p className={styles.fieldHint}>Annehmen legt den Plan als Entwurf in deine Pläne. Du kannst ihn frei bearbeiten.</p>
        <Button size="lg" className={styles.sheetSubmit} disabled={busy} onClick={() => onAccept(open)}>
          Annehmen
        </Button>
        <button type="button" className={styles.dangerLink} disabled={busy} onClick={() => onDecline(open)}>
          Ablehnen
        </button>
      </section>
    );
  }

  return (
    <section className={styles.archivePanel}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ChevronLeft size={18} aria-hidden="true" /> Pläne
      </button>
      <h2 className={styles.sheetHeading}>Geteilte Pläne</h2>
      <p className={styles.muted}>Andere Trainer haben diese Pläne mit dir geteilt. Nach Annahme erhältst du eine eigene Kopie.</p>
      {offers.length ? (
        <ul className={styles.rowList}>
          {offers.map((offer) => (
            <li key={offer.id}>
              <button type="button" className={`${styles.archiveRow} ${styles.shareRow}`} onClick={() => setOpenId(offer.id)}>
                <span className={styles.rightsText}>
                  <strong>{offer.title}</strong>
                  <small>
                    {senderLine(offer)} · {offer.tricks.length} Tricks
                  </small>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyCard}>Keine offenen geteilten Pläne.</p>
      )}
    </section>
  );
}
