"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowUp, Check, ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import type { TrainingPlan } from "@/domain/models";
import { Button } from "@/components/ui/button";
import { formatDay, shortName, type HubPlan, type HubRole } from "./plan-hub-model";
import styles from "./plan-hub.module.css";

const categories = ["Street", "Park", "Bowl", "Ramp", "Freestyle"];
const levels = ["Einsteiger", "Fortgeschritten", "Profi"];
const stepNames = ["Grundlagen", "Tricks", "Zuweisen", "Prüfen"];

/** Vorschläge für die Suche im Schritt „Tricks“. */
const trickLibrary = [
  "Ollie", "Pop Shove-it", "Kickflip", "Heelflip", "Boardslide", "50-50 Grind", "Manual", "Drop-in",
  "Rock to Fakie", "Frontside 180", "Backside 180", "Nollie", "Tailslide", "Varial Flip", "360 Flip", "Fakie Ollie",
];

/** Startvorlagen aus dem Design; „Leer starten“ beginnt ohne Tricks. */
const templates = [
  { id: "blank", name: "Leer starten", description: "Eigene Tricks wählen", category: "", level: "", tricks: [] as [string, string][] },
  {
    id: "street",
    name: "Street Basics",
    description: "6 Tricks · Einsteiger",
    category: "Street",
    level: "Einsteiger",
    tricks: [
      ["Ollie", "5× sauber, fahrend"],
      ["Pop Shove-it", "3 von 5, fahrend"],
      ["Kickflip", "3 von 5 sauber"],
      ["Heelflip", "3 von 5 sauber"],
      ["Boardslide", "2× an der Curb"],
      ["360 Flip", "1× sauber"],
    ] as [string, string][],
  },
  {
    id: "ramp",
    name: "Ramp Einstieg",
    description: "4 Tricks · Einsteiger",
    category: "Ramp",
    level: "Einsteiger",
    tricks: [["Drop-in", ""], ["Rock to Fakie", ""], ["50-50 Grind", ""], ["Tailslide", ""]] as [string, string][],
  },
  {
    id: "flip",
    name: "Flip-Tricks",
    description: "4 Tricks · Fortgeschritten",
    category: "Street",
    level: "Fortgeschritten",
    tricks: [["Kickflip", ""], ["Heelflip", ""], ["Varial Flip", ""], ["360 Flip", ""]] as [string, string][],
  },
];

type Due = "keep" | "2" | "4" | "8" | "none";

interface DraftTrick {
  id: string;
  name: string;
  goal: string;
  hint: string;
}

export interface WizardResult {
  content: TrainingPlan;
  /** Bisherige Versionsnummer (0 bei neuen Plänen) für die Konfliktprüfung. */
  revision: number;
  /** Nur neu hinzugekommene Athlet*innen erhalten eine Freigabe. */
  recipients: string[];
  draft: boolean;
}

function blankPlan(): TrainingPlan {
  return {
    id: crypto.randomUUID(),
    title: "",
    category: "",
    version: "1",
    author: "Eigener Plan",
    ownerLevel: "club",
    sharedWith: [],
    updatedAt: "",
    description: "",
    status: "active",
    visibility: "private",
    isTemplate: false,
    assignedGroups: [],
    assignedAthletes: [],
    sharedTrainers: [],
    goals: [],
    tricks: [],
  };
}

function isoInWeeks(weeks: number) {
  const date = new Date(Date.now() + weeks * 7 * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * Ein Flow für alle Rollen: Grundlagen → Tricks → Zuweisen → Prüfen.
 * „Bearbeiten“ öffnet direkt „Prüfen“ und speichert eine neue Version;
 * laufende Trainings und bestehende Freigaben behalten ihren Planstand.
 */
export function PlanWizard({
  role,
  editPlan,
  startStep,
  athletes,
  busy,
  onClose,
  onSubmit,
}: {
  role: HubRole;
  editPlan: HubPlan | null;
  startStep?: number;
  athletes: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (result: WizardResult) => void;
}) {
  const staff = role === "staff";
  const base = editPlan?.editable ?? null;
  const [step, setStep] = useState(startStep ?? (editPlan ? 3 : 0));
  const [template, setTemplate] = useState("blank");
  const [name, setName] = useState(base?.title ?? "");
  const [category, setCategory] = useState(base?.category || "Street");
  const [level, setLevel] = useState(base?.level || "Einsteiger");
  const [goal, setGoal] = useState(base?.description ?? "");
  const [tricks, setTricks] = useState<DraftTrick[]>(
    () => editPlan?.tricks.map((trick) => ({ ...trick })) ?? [],
  );
  const [openTrick, setOpenTrick] = useState(-1);
  const [query, setQuery] = useState("");
  const alreadyAssigned = useMemo(
    () => new Set(editPlan?.assignments.map((entry) => entry.athleteId) ?? []),
    [editPlan],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [due, setDue] = useState<Due>(base?.deadline ? "keep" : editPlan ? "none" : "4");
  const nameId = useId();
  const goalId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasName = name.trim().length > 0;
  const title = editPlan ? "Plan bearbeiten" : "Neuer Plan";
  const dueLabel =
    due === "keep" && base?.deadline
      ? `Bis ${formatDay(`${base.deadline.slice(0, 10)}T12:00:00`).replace(/^\S+ /, "")}`
      : due === "none"
        ? "Ohne Frist"
        : `${due} Wochen`;

  function applyTemplate(id: string) {
    const chosen = templates.find((entry) => entry.id === id)!;
    setTemplate(id);
    if (chosen.category) setCategory(chosen.category);
    if (chosen.level) setLevel(chosen.level);
    if (!name.trim() && id !== "blank") setName(chosen.name);
    setTricks(chosen.tricks.map(([trickName, trickGoal]) => ({ id: crypto.randomUUID(), name: trickName, goal: trickGoal, hint: "" })));
    setOpenTrick(-1);
  }

  function addTrick(trickName: string) {
    const clean = trickName.trim().slice(0, 160);
    if (!clean || tricks.length >= 100) return;
    setTricks((current) => [...current, { id: crypto.randomUUID(), name: clean, goal: "", hint: "" }]);
    setQuery("");
  }

  function patchTrick(index: number, patch: Partial<DraftTrick>) {
    setTricks((current) => current.map((trick, i) => (i === index ? { ...trick, ...patch } : trick)));
  }

  function submit(asDraft: boolean) {
    // Staff-Pläne ohne jede Zuweisung bleiben laut Konzept ein Entwurf.
    const draft =
      asDraft || (staff && selected.length === 0 && !(editPlan?.assignments.length ?? 0));
    const plan = base ? { ...base } : blankPlan();
    const deadline =
      due === "keep" ? base?.deadline : due === "none" ? undefined : isoInWeeks(Number(due));
    const content: TrainingPlan = {
      ...plan,
      title: name.trim().slice(0, 160),
      category,
      level,
      description: goal.trim().slice(0, 4000),
      deadline,
      status: draft ? "draft" : "active",
      tricks: tricks.map((trick, index) => ({
        id: trick.id,
        name: trick.name.trim().slice(0, 160),
        group: category || "Allgemein",
        level: 1,
        targetType: "free",
        targetValue: trick.goal.trim().slice(0, 160),
        trainerNote: trick.hint.trim().slice(0, 4000),
        sortOrder: index,
        athleteId: "",
        status: "not_started",
      })),
    };
    onSubmit({
      content,
      revision: editPlan?.version ?? 0,
      recipients: draft ? [] : selected.filter((id) => !alreadyAssigned.has(id)),
      draft,
    });
  }

  const suggestions = trickLibrary.filter(
    (entry) =>
      !tricks.some((trick) => trick.name.toLowerCase() === entry.toLowerCase()) &&
      entry.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const exactMatch = [...trickLibrary, ...tricks.map((trick) => trick.name)].some(
    (entry) => entry.toLowerCase() === query.trim().toLowerCase(),
  );

  const assignmentSummary = staff
    ? [
        ...editPlan?.assignments.map((entry) => shortName(entry.athleteName)) ?? [],
        ...athletes.filter((athlete) => selected.includes(athlete.id)).map((athlete) => shortName(athlete.name)),
      ].join(", ") || "Noch niemand – wird als Entwurf gespeichert"
    : "Nur für mich";

  const primaryLabel = editPlan
    ? `Version ${(editPlan.version ?? 0) + 1} speichern`
    : staff
      ? "Plan erstellen"
      : "Plan starten";

  return (
    <div className={styles.wizardBackdrop}>
      <section className={styles.wizard} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.wizardHead}>
          <button type="button" className={styles.iconButton} aria-label="Schließen" onClick={onClose}>
            <X size={20} />
          </button>
          <h2>{title}</h2>
          <span className={styles.wizardCount}>
            <span className={styles.desktopOnly}>Schritt </span>
            {step + 1} / 4
          </span>
        </header>
        <ol className={styles.stepper}>
          {stepNames.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={!hasName}
                className={`${index <= step ? styles.stepReached : ""} ${index === step ? styles.stepActive : ""}`}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
              >
                <span />
                {label}
              </button>
            </li>
          ))}
        </ol>

        <div className={styles.wizardBody}>
          {step === 0 ? (
            <>
              {!editPlan ? (
                <fieldset className={styles.templateGrid}>
                  <legend className="sr-only">Womit starten?</legend>
                  {templates.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={template === entry.id}
                      className={`${styles.templateCard} ${template === entry.id ? styles.templateOn : ""}`}
                      onClick={() => applyTemplate(entry.id)}
                    >
                      <strong>{entry.name}</strong>
                      <small>{entry.description}</small>
                    </button>
                  ))}
                </fieldset>
              ) : null}
              <div className={styles.field}>
                <label htmlFor={nameId}>
                  Name des Plans <b className={styles.required}>*</b>
                </label>
                <input
                  id={nameId}
                  className={styles.inputLg}
                  maxLength={160}
                  placeholder="z. B. Street Basics U14"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </div>
              <div className={styles.twoFields}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Kategorie</span>
                  <div className={styles.chips}>
                    {categories.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        aria-pressed={category === entry}
                        className={`${styles.chip} ${category === entry ? styles.chipDark : ""}`}
                        onClick={() => setCategory(entry)}
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Niveau</span>
                  <div className={styles.segmented} role="radiogroup" aria-label="Niveau">
                    {levels.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        role="radio"
                        aria-checked={level === entry}
                        className={level === entry ? styles.segmentOn : undefined}
                        onClick={() => setLevel(entry)}
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor={goalId}>
                  Ziel <span>· optional</span>
                </label>
                <textarea
                  id={goalId}
                  rows={3}
                  maxLength={4000}
                  placeholder="Was soll mit diesem Plan erreicht werden?"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className={styles.rowBetween}>
                <h3 className={styles.blockTitle}>Tricks im Plan</h3>
                <span className={styles.muted}>
                  {tricks.length} {tricks.length === 1 ? "Trick" : "Tricks"}
                </span>
              </div>
              {tricks.length ? (
                <ol className={styles.trickEditor}>
                  {tricks.map((trick, index) => {
                    const open = openTrick === index;
                    return (
                      <li key={trick.id} className={open ? styles.trickOpen : undefined}>
                        <button
                          type="button"
                          className={styles.trickRow}
                          aria-expanded={open}
                          onClick={() => setOpenTrick(open ? -1 : index)}
                        >
                          <span className={styles.trickNumber}>{index + 1}</span>
                          <span>
                            <strong>{trick.name}</strong>
                            <small>{trick.goal ? `Ziel: ${trick.goal}` : "Kein Ziel festgelegt"}</small>
                          </span>
                          {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                        </button>
                        {open ? (
                          <div className={styles.trickFields}>
                            <div className={styles.field}>
                              <label htmlFor={`${trick.id}-goal`}>Ziel</label>
                              <input
                                id={`${trick.id}-goal`}
                                maxLength={160}
                                placeholder="z. B. 3 von 5 sauber"
                                value={trick.goal}
                                onChange={(event) => patchTrick(index, { goal: event.target.value })}
                              />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor={`${trick.id}-hint`}>Hinweis</label>
                              <input
                                id={`${trick.id}-hint`}
                                maxLength={4000}
                                placeholder="z. B. Schultern parallel zum Board"
                                value={trick.hint}
                                onChange={(event) => patchTrick(index, { hint: event.target.value })}
                              />
                            </div>
                            <div className={styles.rowBetween}>
                              <Button
                                variant="secondary"
                                disabled={index === 0}
                                onClick={() => {
                                  setTricks((current) => {
                                    const next = [...current];
                                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                    return next;
                                  });
                                  setOpenTrick(index - 1);
                                }}
                              >
                                <ArrowUp size={16} aria-hidden="true" /> Nach oben
                              </Button>
                              <button
                                type="button"
                                className={styles.removeButton}
                                onClick={() => {
                                  setTricks((current) => current.filter((_, i) => i !== index));
                                  setOpenTrick(-1);
                                }}
                              >
                                Entfernen
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className={styles.emptyCard}>Noch keine Tricks. Füge unten Tricks aus der Bibliothek oder eigene hinzu.</p>
              )}
              <div className={styles.field}>
                <label htmlFor={`${nameId}-search`}>Trick hinzufügen</label>
                <div className={styles.searchInput}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    id={`${nameId}-search`}
                    placeholder="Trick suchen oder eigenen eingeben"
                    value={query}
                    maxLength={160}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTrick(suggestions[0] ?? query);
                      }
                    }}
                  />
                </div>
                <div className={styles.chips}>
                  {query.trim() && !exactMatch ? (
                    <button type="button" className={`${styles.chip} ${styles.chipAdd}`} onClick={() => addTrick(query)}>
                      <Plus size={14} aria-hidden="true" /> „{query.trim()}“ als eigenen Trick
                    </button>
                  ) : null}
                  {suggestions.slice(0, 10).map((entry) => (
                    <button key={entry} type="button" className={styles.chip} onClick={() => addTrick(entry)}>
                      <Plus size={14} aria-hidden="true" /> {entry}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              {staff ? (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Einzelne Athleten</span>
                  {athletes.length ? (
                    <div className={styles.chips}>
                      {athletes.map((athlete) => {
                        const locked = alreadyAssigned.has(athlete.id);
                        const on = locked || selected.includes(athlete.id);
                        return (
                          <button
                            key={athlete.id}
                            type="button"
                            aria-pressed={on}
                            disabled={locked}
                            title={locked ? "Bereits zugewiesen" : undefined}
                            className={`${styles.chip} ${on ? styles.chipBlue : ""}`}
                            onClick={() =>
                              setSelected((current) =>
                                current.includes(athlete.id)
                                  ? current.filter((id) => id !== athlete.id)
                                  : [...current, athlete.id],
                              )
                            }
                          >
                            {on ? <Check size={14} aria-hidden="true" /> : null}
                            {shortName(athlete.name)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={styles.muted}>
                      Keine zugeordneten Athleten. Stelle zuerst unter „Personen“ eine bestätigte Trainer-Athlet-Verbindung her.
                    </p>
                  )}
                </div>
              ) : (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Für wen?</span>
                  <div className={`${styles.checkRow} ${styles.checkRowOn}`}>
                    <span className={styles.radioDot} aria-hidden="true" />
                    <span>Nur für mich</span>
                  </div>
                </div>
              )}
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Frist</span>
                <div className={styles.chips}>
                  {(base?.deadline ? (["keep", "2", "4", "8", "none"] as Due[]) : (["2", "4", "8", "none"] as Due[])).map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      aria-pressed={due === entry}
                      className={`${styles.chip} ${due === entry ? styles.chipDark : ""}`}
                      onClick={() => setDue(entry)}
                    >
                      {entry === "keep" && base?.deadline
                        ? `Bis ${formatDay(`${base.deadline.slice(0, 10)}T12:00:00`).replace(/^\S+ /, "")}`
                        : entry === "none"
                          ? "Ohne Frist"
                          : `${entry} Wochen`}
                    </button>
                  ))}
                </div>
              </div>
              <p className={styles.muted}>
                {staff ? "Optional. Ohne Zuweisung wird der Plan als Entwurf gespeichert." : "Der Plan ist nur für dich sichtbar."}
              </p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              {editPlan ? (
                <p className={styles.infoNote}>
                  Speichern erzeugt Version {(editPlan.version ?? 0) + 1}. Laufende Trainings und bereits zugewiesene Athleten behalten ihren Planstand.
                </p>
              ) : null}
              {[
                { label: "Grundlagen", value: name.trim() || "—", sub: [category, level, goal.trim()].filter(Boolean).join(" · "), step: 0 },
                { label: `Tricks · ${tricks.length}`, value: tricks.length ? tricks.map((trick) => trick.name).join(", ") : "Noch keine Tricks", step: 1 },
                { label: "Zuweisung", value: assignmentSummary, step: 2 },
                { label: "Frist", value: dueLabel, step: 2 },
              ].map((row) => (
                <div key={row.label} className={styles.reviewCard}>
                  <div>
                    <span className={styles.sectionKicker}>{row.label}</span>
                    <strong>{row.value}</strong>
                    {row.sub ? <small>{row.sub}</small> : null}
                  </div>
                  <button type="button" className={styles.linkButton} onClick={() => setStep(row.step)}>
                    Ändern
                  </button>
                </div>
              ))}
            </>
          ) : null}
        </div>

        <footer className={styles.wizardFoot}>
          {step > 0 ? (
            <Button variant="secondary" size="lg" onClick={() => setStep(step - 1)}>
              Zurück
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button size="lg" className={styles.grow} disabled={!hasName} onClick={() => setStep(step + 1)}>
              Weiter: {stepNames[step + 1]}
            </Button>
          ) : (
            <>
              {staff && !editPlan ? (
                <Button variant="secondary" size="lg" disabled={!hasName || !tricks.length || busy} onClick={() => submit(true)}>
                  Entwurf
                </Button>
              ) : null}
              <Button size="lg" className={styles.grow} disabled={!hasName || !tricks.length || busy} onClick={() => submit(false)}>
                {busy ? "Wird gespeichert …" : primaryLabel}
              </Button>
            </>
          )}
        </footer>
        {step === 3 && !tricks.length ? (
          <p className={styles.footHint}>Füge mindestens einen Trick hinzu, um den Plan zu speichern.</p>
        ) : null}
      </section>
    </div>
  );
}
