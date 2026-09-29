"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowUp, Check, ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import type { TrainingPlan } from "@/domain/models";
import { Button } from "@/components/ui/button";
import {
  formatDay,
  shortName,
  type HubGroup,
  type HubPersona,
  type HubPlan,
  type HubRole,
  type HubTemplate,
} from "./plan-hub-model";
import { useWords } from "./hub-words";
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
  /** Line = Serie aus 2–5 Tricks am Stück. */
  type?: "line";
  parts?: { id: string; name: string }[];
}

type Kind = "trick" | "line";
const kindOf = (trick: DraftTrick): Kind => (trick.type === "line" ? "line" : "trick");
const MAX_LINE_PARTS = 5;

/** Stabile ID für Bibliothekstricks, die nur als Glied einer Line vorkommen. */
const libraryId = (name: string) =>
  `bibliothek-${name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "")}`;

function newLine(first?: { id: string; name: string }): DraftTrick {
  return {
    id: crypto.randomUUID(),
    name: first ? `${first.name}-Line` : "Neue Line",
    goal: "",
    hint: "",
    type: "line",
    parts: first ? [first] : [],
  };
}

export function lineChain(parts: { name: string }[] | undefined) {
  return parts && parts.length >= 2 ? parts.map((part) => part.name).join(" → ") : "mind. 2 Tricks";
}

export interface WizardResult {
  content: TrainingPlan;
  /** Bisherige Versionsnummer (0 bei neuen Plänen) für die Konfliktprüfung. */
  revision: number;
  /** Nur neu hinzugekommene Athlet*innen erhalten eine Freigabe. */
  recipients: string[];
  /** Neu gewählte Gruppen; ihre Mitglieder (auch künftige) erhalten den Plan. */
  groups: string[];
  /** Vorstand: „Alle Gruppen im Verein“. */
  club: boolean;
  /** Vorstand: als Vereinsvorlage für alle Trainer freigeben. */
  clubTemplate: boolean;
  /** Skater*innen: „Mit deinem Trainer teilen“. */
  shareWithTrainer: boolean;
  draft: boolean;
}

type StartTemplate = { id: string; name: string; description: string; category: string; level: string; tricks: [string, string][] };

/** Vereinsvorlage (Plan-Inhalt) in das Format der Startvorlagen übertragen. */
function fromClubTemplate(id: string, title: string, content: TrainingPlan): StartTemplate {
  const tricks = [...content.tricks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return {
    id: `club:${id}`,
    name: title || content.title,
    description: `Vereinsvorlage · ${tricks.length} ${tricks.length === 1 ? "Trick" : "Tricks"}`,
    category: content.category ?? "",
    level: content.level ?? "",
    tricks: tricks.map((trick) => [trick.name, trick.targetValue ?? ""]),
  };
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
  persona,
  editPlan,
  startTemplate,
  startStep,
  startWithLine = false,
  athletes,
  groups,
  clubs,
  templates: clubTemplates,
  hasTrainer,
  busy,
  onClose,
  onSubmit,
}: {
  role: HubRole;
  persona: HubPersona;
  editPlan: HubPlan | null;
  /** „Als Vorlage verwenden“ aus einer Vereinsvorlage. */
  startTemplate: HubPlan | null;
  startStep?: number;
  /** „+ Line erstellen“ aus dem Plan-Detail: neue, aufgeklappte Line-Karte. */
  startWithLine?: boolean;
  athletes: { id: string; name: string }[];
  groups: HubGroup[];
  clubs: HubGroup[];
  templates: HubTemplate[];
  hasTrainer: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (result: WizardResult) => void;
}) {
  const staff = role === "staff";
  const board = persona === "board";
  const w = useWords();
  const base = editPlan?.editable ?? null;
  const [step, setStep] = useState(startStep ?? (editPlan ? 3 : 0));
  // Vereinsvorlagen erscheinen für alle Trainer*innen des Vereins unter den Startvorlagen.
  const allTemplates = useMemo<StartTemplate[]>(
    () => [...templates, ...clubTemplates.map((entry) => fromClubTemplate(entry.id, entry.title, entry.content))],
    [clubTemplates],
  );
  const initialTemplate =
    startTemplate?.templateContent ? fromClubTemplate(startTemplate.key.replace(/^template:/, ""), startTemplate.title, startTemplate.templateContent) : null;
  const [template, setTemplate] = useState(initialTemplate?.id ?? "blank");
  const [name, setName] = useState(base?.title ?? initialTemplate?.name ?? "");
  const [category, setCategory] = useState(base?.category || initialTemplate?.category || "Street");
  const [level, setLevel] = useState(base?.level || initialTemplate?.level || "Einsteiger");
  const [goal, setGoal] = useState(base?.description ?? "");
  const [tricks, setTricks] = useState<DraftTrick[]>(() => {
    const existing: DraftTrick[] =
      editPlan?.tricks.map((trick) => ({ ...trick, parts: trick.parts?.map((part) => ({ ...part })) })) ??
      initialTemplate?.tricks.map(([trickName, trickGoal]) => ({ id: crypto.randomUUID(), name: trickName, goal: trickGoal, hint: "" })) ??
      [];
    return startWithLine ? [...existing, newLine()] : existing;
  });
  const [openTrick, setOpenTrick] = useState(() => (startWithLine ? tricks.length - 1 : -1));
  const [kind, setKind] = useState<Kind>(startWithLine ? "line" : "trick");
  const [lineError, setLineError] = useState(false);
  const [query, setQuery] = useState("");
  const alreadyAssigned = useMemo(
    () => new Set(editPlan?.assignments.map((entry) => entry.athleteId) ?? []),
    [editPlan],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const lockedGroups = useMemo(() => new Set(editPlan?.groupIds ?? []), [editPlan]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const clubLocked = Boolean(editPlan?.clubAssigned);
  const [club, setClub] = useState(false);
  const [clubTemplate, setClubTemplate] = useState(Boolean(editPlan?.isTemplate));
  const [shareWithTrainer, setShareWithTrainer] = useState(Boolean(editPlan?.sharedWithTrainer));
  const [due, setDue] = useState<Due>(base?.deadline ? "keep" : editPlan ? "none" : "4");
  // „Alle Gruppen im Verein“ als eine Zeile mit allen Vereinsathlet*innen.
  const clubMembers = useMemo(() => [...new Set(clubs.flatMap((entry) => entry.athleteIds))], [clubs]);
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
  const title = editPlan ? "Plan bearbeiten" : board ? "Neuer Plan · Verein" : "Neuer Plan";
  const isOn = (id: string) => alreadyAssigned.has(id) || selected.includes(id);
  const groupOn = (group: HubGroup) => lockedGroups.has(group.id) || selectedGroups.includes(group.id);

  /** Gruppe wählen = alle Mitglieder wählen; abwählen entfernt sie wieder. */
  function toggleGroup(group: HubGroup) {
    if (lockedGroups.has(group.id)) return;
    const on = selectedGroups.includes(group.id);
    setSelectedGroups((current) => (on ? current.filter((id) => id !== group.id) : [...current, group.id]));
    setSelected((current) =>
      on
        ? current.filter((id) => !group.athleteIds.includes(id))
        : [...new Set([...current, ...group.athleteIds.filter((id) => !alreadyAssigned.has(id))])],
    );
  }

  function toggleClub() {
    if (clubLocked) return;
    setClub(!club);
    setSelected((current) =>
      club ? current.filter((id) => !clubMembers.includes(id)) : [...new Set([...current, ...clubMembers.filter((id) => !alreadyAssigned.has(id))])],
    );
  }

  /** Einzelne Athlet*innen bleiben ab-/zuwählbar; eine unvollständige Gruppe gilt nicht mehr als gewählt. */
  function toggleAthlete(id: string) {
    const on = selected.includes(id);
    setSelected((current) => (on ? current.filter((entry) => entry !== id) : [...current, id]));
    if (on) {
      setSelectedGroups((current) => current.filter((groupId) => !groups.find((group) => group.id === groupId)?.athleteIds.includes(id)));
      if (clubMembers.includes(id)) setClub(false);
    }
  }
  const dueLabel =
    due === "keep" && base?.deadline
      ? `Bis ${formatDay(`${base.deadline.slice(0, 10)}T12:00:00`).replace(/^\S+ /, "")}`
      : due === "none"
        ? "Ohne Frist"
        : `${due} Wochen`;

  function applyTemplate(id: string) {
    const chosen = allTemplates.find((entry) => entry.id === id)!;
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

  /** „↑ Nach oben“ tauscht nur mit dem vorherigen Eintrag derselben Art. */
  function moveUp(index: number) {
    const own = kindOf(tricks[index]);
    let previous = index - 1;
    while (previous >= 0 && kindOf(tricks[previous]) !== own) previous -= 1;
    if (previous < 0) return;
    setTricks((current) => {
      const next = [...current];
      [next[previous], next[index]] = [next[index], next[previous]];
      return next;
    });
    setOpenTrick(previous);
  }

  function addLine(first?: { id: string; name: string }, after = tricks.length - 1) {
    if (tricks.length >= 100) return;
    const line = newLine(first);
    setTricks((current) => [...current.slice(0, after + 1), line, ...current.slice(after + 1)]);
    setOpenTrick(after + 1);
    setKind("line");
  }

  function patchParts(index: number, update: (parts: { id: string; name: string }[]) => { id: string; name: string }[]) {
    setTricks((current) =>
      current.map((trick, i) => (i === index ? { ...trick, parts: update(trick.parts ?? []) } : trick)),
    );
  }

  const invalidLines = tricks.filter((trick) => trick.type === "line" && ((trick.parts?.length ?? 0) < 2 || (trick.parts?.length ?? 0) > MAX_LINE_PARTS));

  function submit(asDraft: boolean) {
    // Jede Line braucht 2–5 Tricks; der Hinweis erscheint an der Karte.
    if (invalidLines.length) {
      setLineError(true);
      setKind("line");
      setStep(1);
      setOpenTrick(tricks.indexOf(invalidLines[0]));
      return;
    }
    // Staff-Pläne ohne jede Zuweisung (und ohne Vereinsvorlage) bleiben laut Konzept ein Entwurf.
    const draft =
      asDraft ||
      (staff && selected.length === 0 && !selectedGroups.length && !club && !clubTemplate && !(editPlan?.assignments.length ?? 0));
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
        name: trick.name.trim().slice(0, 160) || (trick.type === "line" ? "Line" : trick.name),
        group: category || "Allgemein",
        level: 1,
        targetType: "free",
        targetValue: trick.goal.trim().slice(0, 160),
        trainerNote: trick.hint.trim().slice(0, 4000),
        sortOrder: index,
        athleteId: "",
        status: "not_started",
        ...(trick.type === "line"
          ? {
              type: "line" as const,
              trickIds: (trick.parts ?? []).map((part) => part.id),
              trickNames: (trick.parts ?? []).map((part) => part.name),
            }
          : {}),
      })),
    };
    onSubmit({
      content,
      revision: editPlan?.version ?? 0,
      recipients: draft ? [] : selected.filter((id) => !alreadyAssigned.has(id)),
      groups: draft ? [] : selectedGroups.filter((id) => !lockedGroups.has(id)),
      club: !draft && club && !clubLocked,
      clubTemplate: board && clubTemplate,
      shareWithTrainer: !staff && shareWithTrainer,
      draft,
    });
  }

  const trickCount = tricks.filter((trick) => trick.type !== "line").length;
  const lineCount = tricks.length - trickCount;
  const suggestions = trickLibrary.filter(
    (entry) =>
      !tricks.some((trick) => trick.type !== "line" && trick.name.toLowerCase() === entry.toLowerCase()) &&
      entry.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const exactMatch = [...trickLibrary, ...tricks.map((trick) => trick.name)].some(
    (entry) => entry.toLowerCase() === query.trim().toLowerCase(),
  );

  // Zusammenfassung: gewählte Gruppen zuerst, danach Einzelpersonen außerhalb dieser Gruppen.
  const chosenGroups = groups.filter((group) => lockedGroups.has(group.id) || selectedGroups.includes(group.id));
  const inGroups = new Set([...chosenGroups.flatMap((group) => group.athleteIds), ...(club || clubLocked ? clubMembers : [])]);
  const assignmentSummary = staff
    ? [
        ...(club || clubLocked ? ["Alle Gruppen im Verein"] : []),
        ...chosenGroups.map((group) => group.name),
        ...(editPlan?.assignments.filter((entry) => !inGroups.has(entry.athleteId)).map((entry) => shortName(entry.athleteName)) ?? []),
        ...athletes
          .filter((athlete) => selected.includes(athlete.id) && !inGroups.has(athlete.id))
          .map((athlete) => shortName(athlete.name)),
      ].join(", ") || (clubTemplate ? "Noch niemand – nur als Vereinsvorlage" : "Noch niemand – wird als Entwurf gespeichert")
    : shareWithTrainer
      ? `Mit ${w.dat} geteilt`
      : "Nur für mich";

  const primaryLabel = editPlan
    ? `Version ${(editPlan.version ?? 0) + 1} speichern`
    : staff
      ? board && clubTemplate
        ? "Erstellen & freigeben"
        : "Plan erstellen"
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
                  {allTemplates.map((entry) => (
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
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Was wird geübt?</span>
                <div className={styles.kindSwitch} role="tablist" aria-label="Was wird geübt?">
                  {(
                    [
                      ["trick", "Einzeltricks", trickCount],
                      ["line", "Lines", lineCount],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={kind === key}
                      data-kind={key}
                      onClick={() => {
                        setKind(key);
                        setOpenTrick(-1);
                      }}
                    >
                      {label}
                      <span className={styles.kindCount}>{count}</span>
                    </button>
                  ))}
                </div>
                <small className={styles.muted}>
                  {kind === "trick"
                    ? "Jeder Trick wird einzeln geübt, gemeldet und bestätigt."
                    : "Serien am Stück – die Quote zählt nur komplette Lines."}
                </small>
              </div>
              <div className={styles.rowBetween}>
                <h3 className={styles.blockTitle}>{kind === "trick" ? "Einzeltricks im Plan" : "Lines im Plan"}</h3>
                <span className={styles.muted}>
                  {trickCount} {trickCount === 1 ? "Trick" : "Tricks"}
                  {lineCount ? ` · ${lineCount} ${lineCount === 1 ? "Line" : "Lines"}` : ""}
                </span>
              </div>
              {tricks.some((trick) => kindOf(trick) === kind) ? (
                <ol className={styles.trickEditor}>
                  {tricks.map((trick, index) => {
                    if (kindOf(trick) !== kind) return null;
                    const open = openTrick === index;
                    const line = trick.type === "line";
                    const parts = trick.parts ?? [];
                    const invalid = line && lineError && (parts.length < 2 || parts.length > MAX_LINE_PARTS);
                    const firstOfKind = tricks.findIndex((entry) => kindOf(entry) === kind) === index;
                    const planOptions = line
                      ? tricks.filter((entry) => entry.type !== "line" && !parts.some((part) => part.id === entry.id))
                      : [];
                    const libraryOptions = line
                      ? trickLibrary.filter(
                          (name) =>
                            !parts.some((part) => part.name.toLowerCase() === name.toLowerCase()) &&
                            !planOptions.some((entry) => entry.name.toLowerCase() === name.toLowerCase()),
                        )
                      : [];
                    return (
                      <li
                        key={trick.id}
                        className={`${open ? styles.trickOpen : ""} ${line ? styles.lineItem : ""}`}
                        data-invalid={invalid || undefined}
                      >
                        <button
                          type="button"
                          className={styles.trickRow}
                          aria-expanded={open}
                          onClick={() => setOpenTrick(open ? -1 : index)}
                        >
                          <span className={styles.trickNumber}>{index + 1}</span>
                          <span>
                            <strong>
                              {trick.name || (line ? "Neue Line" : "")}
                              {line ? <span className={styles.lineBadge}>LINE</span> : null}
                            </strong>
                            <small className={invalid ? styles.textDanger : undefined}>
                              {line
                                ? lineChain(parts)
                                : trick.goal
                                  ? `Ziel: ${trick.goal}`
                                  : "Kein Ziel festgelegt"}
                            </small>
                          </span>
                          {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                        </button>
                        {open ? (
                          <div className={styles.trickFields}>
                            {line ? (
                              <>
                                <div className={styles.field}>
                                  <label htmlFor={`${trick.id}-name`}>Name der Line</label>
                                  <input
                                    id={`${trick.id}-name`}
                                    maxLength={160}
                                    placeholder="z. B. Curb-Line"
                                    value={trick.name}
                                    onChange={(event) => patchTrick(index, { name: event.target.value })}
                                  />
                                </div>
                                <div className={styles.field}>
                                  <span className={styles.fieldLabel}>
                                    Reihenfolge <span>· 2–5 Tricks</span>
                                  </span>
                                  {parts.length ? (
                                    <>
                                      <ol className={styles.lineParts}>
                                        {parts.map((part, k) => (
                                          <li key={`${part.id}-${k}`}>
                                            <span className={styles.linePartNumber}>{k + 1}</span>
                                            <span className={styles.linePartName}>{part.name}</span>
                                            <button
                                              type="button"
                                              aria-label={`${part.name} nach oben`}
                                              disabled={k === 0}
                                              onClick={() =>
                                                patchParts(index, (current) => {
                                                  const next = [...current];
                                                  [next[k - 1], next[k]] = [next[k], next[k - 1]];
                                                  return next;
                                                })
                                              }
                                            >
                                              ↑
                                            </button>
                                            <button
                                              type="button"
                                              aria-label={`${part.name} entfernen`}
                                              data-remove
                                              onClick={() => patchParts(index, (current) => current.filter((_, i) => i !== k))}
                                            >
                                              ✕
                                            </button>
                                          </li>
                                        ))}
                                      </ol>
                                      <div className={styles.lineChips}>
                                        {parts.map((part, k) => (
                                          <span key={`${part.id}-${k}`} className={styles.lineChip}>
                                            <b>{k + 1}</b>
                                            {part.name}
                                            <button
                                              type="button"
                                              aria-label={`${part.name} entfernen`}
                                              onClick={() => patchParts(index, (current) => current.filter((_, i) => i !== k))}
                                            >
                                              ✕
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    </>
                                  ) : (
                                    <p className={styles.lineEmpty}>Tippe unten die Tricks in der Reihenfolge der Line an.</p>
                                  )}
                                  {invalid ? (
                                    <p className={styles.textDanger}>Eine Line braucht 2–5 Tricks.</p>
                                  ) : null}
                                  {parts.length < MAX_LINE_PARTS ? (
                                    <div className={styles.chips}>
                                      {planOptions.map((entry) => (
                                        <button
                                          key={entry.id}
                                          type="button"
                                          className={`${styles.chip} ${styles.chipLine}`}
                                          onClick={() => patchParts(index, (current) => [...current, { id: entry.id, name: entry.name }])}
                                        >
                                          + {entry.name}
                                        </button>
                                      ))}
                                      {libraryOptions.slice(0, 8).map((name) => (
                                        <button
                                          key={name}
                                          type="button"
                                          className={`${styles.chip} ${styles.chipLibrary}`}
                                          onClick={() => patchParts(index, (current) => [...current, { id: libraryId(name), name }])}
                                        >
                                          + {name}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <small className={styles.muted}>Maximal 5 Tricks pro Line.</small>
                                  )}
                                </div>
                              </>
                            ) : null}
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
                              <span className={styles.trickActions}>
                                <Button variant="secondary" disabled={firstOfKind} onClick={() => moveUp(index)}>
                                  <ArrowUp size={16} aria-hidden="true" /> Nach oben
                                </Button>
                                {!line ? (
                                  <button
                                    type="button"
                                    className={styles.toLineButton}
                                    onClick={() => addLine({ id: trick.id, name: trick.name }, index)}
                                  >
                                    ⛓ Zu Line verbinden
                                  </button>
                                ) : null}
                              </span>
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
                <p className={styles.emptyCard}>
                  {kind === "trick"
                    ? "Noch keine Einzeltricks. Füge unten Tricks aus der Bibliothek oder eigene hinzu."
                    : "Noch keine Lines. Verbinde mehrere Tricks zu einer Serie am Stück."}
                </p>
              )}
              {kind === "line" ? (
                <button type="button" className={styles.addLineButton} onClick={() => addLine()}>
                  <span aria-hidden="true">+</span>
                  <span>
                    <strong>Line hinzufügen</strong>
                    <small>Tricks als Serie · mehrere Tricks am Stück</small>
                  </span>
                </button>
              ) : null}
              {kind === "trick" ? (
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
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              {staff ? (
                <>
                  {groups.length || (board && clubs.length) ? (
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Gruppen</span>
                      <div className={styles.groupRows}>
                        {groups.map((group) => {
                          const on = groupOn(group);
                          const locked = lockedGroups.has(group.id);
                          return (
                            <button
                              key={group.id}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              disabled={locked}
                              title={locked ? "Bereits zugewiesen" : undefined}
                              className={`${styles.checkRow} ${on ? styles.checkRowOn : ""}`}
                              onClick={() => toggleGroup(group)}
                            >
                              <span className={styles.checkBox} aria-hidden="true">
                                {on ? <Check size={14} strokeWidth={3} /> : null}
                              </span>
                              <span>{group.name}</span>
                              <small>
                                {group.athleteIds.length} {group.athleteIds.length === 1 ? "Athlet" : "Athleten"}
                              </small>
                            </button>
                          );
                        })}
                        {board && clubs.length ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={club || clubLocked}
                            disabled={clubLocked}
                            title={clubLocked ? "Bereits zugewiesen" : undefined}
                            className={`${styles.checkRow} ${club || clubLocked ? styles.checkRowOn : ""}`}
                            onClick={toggleClub}
                          >
                            <span className={styles.checkBox} aria-hidden="true">
                              {club || clubLocked ? <Check size={14} strokeWidth={3} /> : null}
                            </span>
                            <span>Alle Gruppen im Verein</span>
                            <small>
                              {clubMembers.length} {clubMembers.length === 1 ? "Athlet" : "Athleten"}
                            </small>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Einzelne Athleten</span>
                    {athletes.length ? (
                      <div className={styles.chips}>
                        {athletes.map((athlete) => {
                          const locked = alreadyAssigned.has(athlete.id);
                          const on = isOn(athlete.id);
                          return (
                            <button
                              key={athlete.id}
                              type="button"
                              aria-pressed={on}
                              disabled={locked}
                              title={locked ? "Bereits zugewiesen" : undefined}
                              className={`${styles.chip} ${on ? styles.chipBlue : ""}`}
                              onClick={() => toggleAthlete(athlete.id)}
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
                  {board ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={clubTemplate}
                      className={`${styles.templateToggle} ${clubTemplate ? styles.templateToggleOn : ""}`}
                      onClick={() => setClubTemplate(!clubTemplate)}
                    >
                      <span>
                        <strong>Als Vereinsvorlage freigeben</strong>
                        <small>Alle Trainer im Verein können den Plan übernehmen</small>
                      </span>
                      <span className={`${styles.toggle} ${styles.togglePurple} ${clubTemplate ? styles.toggleOn : ""}`} aria-hidden="true">
                        <span />
                      </span>
                    </button>
                  ) : null}
                </>
              ) : (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Für wen ist der Plan?</span>
                  <div className={styles.groupRows} role="radiogroup" aria-label="Für wen ist der Plan?">
                    {[
                      { value: false, label: "Nur für mich", sub: "Niemand sonst sieht den Plan" },
                      {
                        value: true,
                        label: `Mit ${w.dat} teilen`,
                        sub: hasTrainer ? `${w.nom[0].toUpperCase()}${w.nom.slice(1)} sieht den Plan und kann bestätigen` : "Verbinde dich zuerst mit einem Trainer",
                      },
                    ].map((option) => {
                      // Einmal geteilte Pläne bleiben geteilt; der Fortschritt hängt daran.
                      const locked = Boolean(editPlan?.sharedWithTrainer) || (option.value && !hasTrainer);
                      const on = shareWithTrainer === option.value;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={locked && !on}
                          className={`${styles.checkRow} ${on ? styles.checkRowOn : ""}`}
                          onClick={() => setShareWithTrainer(option.value)}
                        >
                          <span className={styles.radioDot} aria-hidden="true" />
                          <span className={styles.checkText}>
                            <strong>{option.label}</strong>
                            <small>{option.sub}</small>
                          </span>
                        </button>
                      );
                    })}
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
                {staff
                  ? "Optional. Ohne Zuweisung wird der Plan als Entwurf gespeichert."
                  : shareWithTrainer
                    ? `${w.nom[0].toUpperCase()}${w.nom.slice(1)} sieht deinen Fortschritt und kann Tricks bestätigen.`
                    : "Der Plan ist nur für dich sichtbar."}
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
                {
                  label: lineCount ? `Tricks · ${trickCount} · Lines · ${lineCount}` : `Tricks · ${trickCount}`,
                  value: tricks.length
                    ? tricks.map((trick) => (trick.type === "line" ? `${trick.name} (Line)` : trick.name)).join(", ")
                    : "Noch keine Tricks",
                  step: 1,
                },
                {
                  label: "Zuweisung",
                  value: assignmentSummary,
                  sub: board && clubTemplate ? "+ Vereinsvorlage für alle Trainer" : "",
                  step: 2,
                },
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
        ) : step === 3 && invalidLines.length ? (
          <p className={styles.footHint}>Jede Line braucht 2–5 Tricks. Speichern zeigt die betroffene Line.</p>
        ) : null}
      </section>
    </div>
  );
}
