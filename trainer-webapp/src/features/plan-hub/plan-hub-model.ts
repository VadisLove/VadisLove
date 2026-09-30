/**
 * Reine Fachlogik des Trainingsplan-Bereichs (ohne React).
 *
 * Führt die drei vorhandenen Datenquellen zu einer einheitlichen Sicht zusammen:
 * - eigene, versionierte Pläne (`training_plans`),
 * - persönliche Freigaben mit Trick-Fortschritt (`training_plan_snapshot_shares`),
 * - Videonachweise (`training_video_evidence`).
 *
 * Alle Imports sind relativ bzw. reine Typ-Imports, damit die Funktionen auch
 * ohne Next.js-Build in `node --test` geprüft werden können.
 */
import type {
  TrainingPlan,
  TrainingVideoEvidence,
  TrickProgressStatus,
} from "../../domain/models";
import type { SavedPlan } from "../../domain/training";
import type { SessionRecap } from "../../domain/training-recap";

/** Status pro Athlet × Trick: 0 Offen → 1 Geübt → 2 Gemeldet → 3 Bestätigt. */
export type Step = 0 | 1 | 2 | 3;

export const stepOf: Record<TrickProgressStatus, Step> = {
  not_started: 0,
  in_progress: 1,
  awaiting_confirmation: 2,
  confirmed: 3,
};

export const stepLabels = ["Offen", "Geübt", "Gemeldet", "Bestätigt"] as const;

/**
 * Trainer und Vereins-/Verbandsmitarbeitende („Vorstand“) verwalten Pläne,
 * Athleten melden Fortschritt. Alle übrigen Konten sehen nur lesend zu.
 * `HubRole` steuert Rechte, die für Trainer und Vorstand gleich sind.
 */
export type HubRole = "staff" | "athlete" | "viewer";

/**
 * Feinere Unterscheidung für Texte und Zusatzrechte: Der Vorstand darf
 * zusätzlich „Alle Gruppen im Verein“ zuweisen und Vereinsvorlagen freigeben.
 */
export type HubPersona = "trainer" | "board" | "athlete" | "viewer";

export function personaOf(accountType: string | undefined, isBoard = false): HubPersona {
  if (isBoard || accountType === "organization_staff") return "board";
  if (accountType === "trainer") return "trainer";
  if (accountType === "athlete") return "athlete";
  return "viewer";
}

export function hubRoleOf(accountType: string | undefined, isBoard = false): HubRole {
  const persona = personaOf(accountType, isBoard);
  return persona === "trainer" || persona === "board" ? "staff" : persona;
}

/* ------------------------------------------------------------------ */
/* Anrede (m/w/d)                                                       */
/* ------------------------------------------------------------------ */

export type Salutation = "m" | "w" | "d";

export function isSalutation(value: unknown): value is Salutation {
  return value === "m" || value === "w" || value === "d";
}

/** Wort-Tabelle aus dem Handoff (Genderstern für „d“). */
const salutationWords = {
  m: { sk: "Skater", tr: "Trainer", acc: "deinen Trainer", nom: "dein Trainer", dat: "deinem Trainer", rank: "Starter" },
  w: { sk: "Skaterin", tr: "Trainerin", acc: "deine Trainerin", nom: "deine Trainerin", dat: "deiner Trainerin", rank: "Starterin" },
  d: { sk: "Skater*in", tr: "Trainer*in", acc: "dein*e Trainer*in", nom: "dein*e Trainer*in", dat: "deine*m Trainer*in", rank: "Starter*in" },
} as const;

export type HubWords = {
  sk: string;
  tr: string;
  acc: string;
  nom: string;
  dat: string;
  rank: string;
};

/**
 * Eigene Anrede steuert Rollenbezeichnung und Level-Titel (`sk`, `tr`, `rank`),
 * die Anrede der Trainer*in die Texte über sie (`acc`, `nom`, `dat`).
 * Fehlt eine Angabe, gilt die neutrale Form „d“.
 */
export function words(own: Salutation | null | undefined = "d", trainer: Salutation | null | undefined = own): HubWords {
  const self = salutationWords[own ?? "d"];
  const coach = salutationWords[trainer ?? "d"];
  return { sk: self.sk, tr: self.tr, rank: self.rank, acc: coach.acc, nom: coach.nom, dat: coach.dat };
}

/** Optionen der Anrede-Abfrage; Skater*innen und Staff sehen jeweils ihre Form. */
export function salutationOptions(role: HubRole) {
  const athlete = role !== "staff";
  return [
    { value: "w" as const, label: athlete ? "Skaterin" : "Trainerin", sub: "weiblich" },
    { value: "m" as const, label: athlete ? "Skater" : "Trainer", sub: "männlich" },
    { value: "d" as const, label: athlete ? "Skater*in" : "Trainer*in", sub: "divers / keine Angabe" },
  ];
}

/* ------------------------------------------------------------------ */
/* Kontext aus `training_plan_hub_context`                              */
/* ------------------------------------------------------------------ */

export interface HubGroup {
  id: string;
  name: string;
  /** Nur verbundene Athlet*innen bzw. Vereinsathlet*innen (Zähler im Wizard). */
  athleteIds: string[];
}

export interface HubTemplate {
  id: string;
  title: string;
  organizationName: string;
  authorName: string;
  own: boolean;
  content: TrainingPlan;
}

export interface HubContext {
  isBoard: boolean;
  canCreatePlans: boolean;
  salutation: Salutation | null;
  trainerSalutation: Salutation;
  hasTrainer: boolean;
  athletes: { id: string; name: string; canCreatePlans: boolean }[];
  groups: HubGroup[];
  clubs: HubGroup[];
  clubTemplateIds: string[];
  groupAssignments: { planId: string; groupId: string | null; organizationId: string | null }[];
  templates: HubTemplate[];
}

/** Standard ohne Datenbankkontext: keine Zusatzrechte, neutrale Anrede. */
export const emptyHubContext: HubContext = {
  isBoard: false,
  canCreatePlans: false,
  salutation: "d",
  trainerSalutation: "d",
  hasTrainer: false,
  athletes: [],
  groups: [],
  clubs: [],
  clubTemplateIds: [],
  groupAssignments: [],
  templates: [],
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) => (Array.isArray(value) ? value : []);
const ids = (value: unknown) => list(value).filter((entry): entry is string => typeof entry === "string");

/** Liest die RPC-Antwort defensiv ein; unbekannte Felder werden ignoriert. */
export function parseHubContext(raw: unknown): HubContext {
  if (!raw || typeof raw !== "object") return emptyHubContext;
  const data = raw as Record<string, unknown>;
  const groupsOf = (value: unknown): HubGroup[] =>
    list(value).map((entry) => ({ id: text(entry.id), name: text(entry.name), athleteIds: ids(entry.athlete_ids) }));
  return {
    isBoard: data.is_board === true,
    canCreatePlans: data.can_create_plans === true,
    salutation: isSalutation(data.salutation) ? data.salutation : null,
    trainerSalutation: isSalutation(data.trainer_salutation) ? data.trainer_salutation : "d",
    hasTrainer: data.has_trainer === true,
    athletes: list(data.athletes).map((entry) => ({
      id: text(entry.id),
      name: text(entry.name),
      canCreatePlans: entry.can_create_plans === true,
    })),
    groups: groupsOf(data.groups),
    clubs: groupsOf(data.clubs),
    clubTemplateIds: ids(data.club_template_ids),
    groupAssignments: list(data.group_assignments).map((entry) => ({
      planId: text(entry.plan_id),
      groupId: typeof entry.group_id === "string" ? entry.group_id : null,
      organizationId: typeof entry.organization_id === "string" ? entry.organization_id : null,
    })),
    templates: list(data.templates)
      .filter((entry) => entry?.content && Array.isArray(entry.content.tricks))
      .map((entry) => ({
        id: text(entry.id),
        title: text(entry.title),
        organizationName: text(entry.organization_name),
        authorName: text(entry.author_name),
        own: entry.own === true,
        content: entry.content as TrainingPlan,
      })),
  };
}

/* ------------------------------------------------------------------ */
/* Archiv & Papierkorb aus `training_plan_library`                      */
/* ------------------------------------------------------------------ */

export type PlanLifecycle = "active" | "draft" | "archived";

/** Bisherige Athletin/bisheriger Athlet eines Plans (neueste Kopie). */
export interface LibraryAthlete {
  id: string;
  name: string;
  shareId: string;
  archived: boolean;
  /** Verlauf vorhanden: Kopie bleibt beim Löschen unter „Erledigt“ erhalten. */
  history: boolean;
}

/** Verwaltbarer Plan (eigener oder – Vorstand – eines Vereinstrainers). */
export interface LibraryEntry {
  /** Plan-ID (bzw. Snapshot-ID bei Altfreigaben) für die Lebenszyklus-RPCs. */
  key: string;
  ownerId: string;
  ownerName: string;
  own: boolean;
  title: string;
  /** Altfreigabe ohne gespeicherten Plan: keine neuen Athlet*innen möglich. */
  legacy: boolean;
  archivedAt: string | null;
  archivedReason: "completed" | "manual" | null;
  deletedAt: string | null;
  purgeAt: string | null;
  athletes: LibraryAthlete[];
}

const date = (value: unknown) => (typeof value === "string" && value ? value : null);
const reason = (value: unknown) => (value === "completed" || value === "manual" ? value : null);

/** Liest die RPC-Antwort defensiv ein; null = Migration fehlt oder Abruf fehlgeschlagen. */
export function parseLibrary(raw: unknown): LibraryEntry[] | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  return [...list(data.plans), ...list(data.legacy)]
    .filter((entry) => entry && typeof entry.key === "string")
    .map((entry) => ({
      key: text(entry.key),
      ownerId: text(entry.owner_id),
      ownerName: text(entry.owner_name),
      own: entry.own === true,
      title: text(entry.title),
      legacy: entry.legacy === true,
      archivedAt: date(entry.archived_at),
      archivedReason: reason(entry.archived_reason),
      deletedAt: date(entry.deleted_at),
      purgeAt: date(entry.purge_at),
      athletes: list(entry.athletes).map((athlete) => ({
        id: text(athlete.id),
        name: text(athlete.name),
        shareId: text(athlete.share_id),
        archived: athlete.archived === true,
        history: athlete.history === true,
      })),
    }));
}

/* ------------------------------------------------------------------ */
/* Geteilte Pläne anderer Trainer*innen (Migration 20260930120000)      */
/* ------------------------------------------------------------------ */

/**
 * Offener Vorschlag einer anderen Trainerin/eines anderen Trainers. Er enthält
 * nur Planinhalt; erst „Annehmen“ legt einen eigenen Plan (Entwurf) an.
 */
export interface SharedPlanOffer {
  id: string;
  title: string;
  sharedAt: string;
  senderName: string;
  senderOrganization: string;
  category: string;
  level: string;
  description: string;
  tricks: HubTrick[];
}

/** Liest `training_shared_plans` defensiv ein; null = Migration fehlt oder Abruf fehlgeschlagen. */
export function parseSharedPlans(raw: unknown): SharedPlanOffer[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((entry) => entry && typeof entry.id === "string" && entry.content && Array.isArray(entry.content.tricks))
    .map((entry) => {
      const content = entry.content as TrainingPlan;
      return {
        id: text(entry.id),
        title: text(entry.title) || text(content.title),
        sharedAt: text(entry.shared_at),
        senderName: text(entry.sender_name),
        senderOrganization: text(entry.sender_organization),
        category: text(content.category),
        level: text(content.level),
        description: text(content.description),
        tricks: tricksOf({ ...content, tricks: content.tricks.filter((trick) => trick && typeof trick.id === "string") }),
      };
    });
}

/** Resttage bis zur endgültigen Bereinigung (mindestens 0). */
export function daysLeft(purgeAt: string | null, now = Date.now()) {
  if (!purgeAt) return 0;
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - now) / 86_400_000));
}

/** Untertitel im Archiv: Grund und Datum. */
export function archiveLabel(plan: Pick<HubPlan, "archivedReason" | "archivedAt">, role: HubRole) {
  const why = plan.archivedReason === "completed"
    ? role === "staff" ? "Alle bestätigt" : "Alle Tricks bestätigt"
    : role === "staff" ? "Manuell erledigt" : "Abgeschlossen";
  return plan.archivedAt ? `${why} · ${formatShortDate(plan.archivedAt)}` : why;
}

function formatShortDate(value: string) {
  // „12.09.“ – toLocaleDateString liefert den Schlusspunkt bereits mit.
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

export interface PermissionSection {
  label: string;
  athletes: { id: string; name: string; canCreatePlans: boolean }[];
}

/**
 * „Wer darf erstellen?“: Athlet*innen nach Gruppe, Personen ohne Gruppe am
 * Ende. Wer in mehreren Gruppen ist, erscheint in jeder dieser Gruppen.
 */
export function permissionSections(context: HubContext): PermissionSection[] {
  const byId = new Map(context.athletes.map((athlete) => [athlete.id, athlete]));
  const grouped = new Set<string>();
  const sections: PermissionSection[] = [];
  for (const group of context.groups) {
    const members = group.athleteIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    if (!members.length) continue;
    members.forEach((member) => grouped.add(member.id));
    sections.push({ label: group.name, athletes: members });
  }
  const rest = context.athletes.filter((athlete) => !grouped.has(athlete.id));
  if (rest.length) sections.push({ label: sections.length ? "Ohne Gruppe" : "Alle", athletes: rest });
  return sections;
}

/* ------------------------------------------------------------------ */
/* Zusammengeführte Pläne                                               */
/* ------------------------------------------------------------------ */

export interface HubTrick {
  id: string;
  name: string;
  goal: string;
  hint: string;
  /** Line = Serie aus 2–5 Tricks am Stück; eigener Status wie ein Trick. */
  type?: "line";
  /** Geordnete Glieder einer Line (Trick-ID und Name). */
  parts?: { id: string; name: string }[];
}

export const isLineTrick = (trick: HubTrick) => trick.type === "line";

/** Eine persönliche Freigabe = ein Athlet mit eigenem Fortschritt. */
export interface HubAssignment {
  /** Plan-ID der Freigabe im Format `shared-<uuid>` (für Server Actions). */
  shareId: string;
  athleteId: string;
  athleteName: string;
  initials: string;
  /** Fehlt ein Trick in einer älteren Planversion, bleibt der Eintrag leer. */
  steps: Record<string, Step | undefined>;
  /** Tricks, die direkt aus dem Session-Rückblick bestätigt wurden (Zeitpunkt). */
  recapConfirmed: Record<string, string>;
  /** Tricks/Lines, die im Live-Training bestätigt wurden (Zeitpunkt). */
  liveConfirmed?: Record<string, string>;
  /** Kopie erledigt (alle Tricks bestätigt oder als erledigt markiert). */
  archived?: boolean;
  /** completed = alle Tricks bestätigt, manual = vom Trainer abgeschlossen/abgewählt. */
  archivedReason?: "completed" | "manual";
}

export interface HubPlan {
  key: string;
  title: string;
  category: string;
  level: string;
  goal: string;
  deadline?: string;
  version: number | null;
  createdAt?: string;
  /**
   * own = eigener Plan, sent = nur als Freigabe versendet, received = erhalten,
   * athlete = von einer Athletin/einem Athleten erstellt und mit mir geteilt,
   * template = Vereinsvorlage einer anderen Person (nur als Vorlage nutzbar).
   */
  kind: "own" | "sent" | "received" | "athlete" | "template";
  isDraft: boolean;
  tricks: HubTrick[];
  assignments: HubAssignment[];
  /** Inhalt für „Bearbeiten“ (nur eigene Pläne, speichert eine neue Version). */
  editable: TrainingPlan | null;
  savedPlanId?: string;
  /** ID für den Trainingsstart: gespeicherter Plan oder `shared-<uuid>`. */
  startId: string | null;
  /** Kurzer Herkunftstext unter dem Plannamen. */
  sourceLabel: string;
  /** Autor laut Snapshot, z. B. für „Von <Name> erstellt“. */
  author: string;
  /** Name der Athletin/des Athleten, wenn der Plan von ihr/ihm stammt (Trainer-Sicht). */
  createdByAthlete: string;
  /** Eigene Vereinsvorlage (Vorstand) oder Vereinsvorlage anderer (kind „template“). */
  isTemplate: boolean;
  /** Eigener Plan einer Athletin/eines Athleten, der mit den Trainer*innen geteilt ist. */
  sharedWithTrainer: boolean;
  /** Gespeicherte Gruppenzuweisungen (neue Mitglieder erben den Plan). */
  groupIds: string[];
  /** Zuweisung „Alle Gruppen im Verein“ (Vorstand). */
  clubAssigned: boolean;
  /** Inhalt einer Vereinsvorlage zum Übernehmen in den Wizard. */
  templateContent?: TrainingPlan;
  /**
   * Bereich in der Planliste: aktiv, Entwurf (eigener Plan ohne aktive
   * Zuweisung) oder archiviert/erledigt (nur lesbar, siehe Migration
   * 20260930100000_plan_archive_trash).
   */
  lifecycle: PlanLifecycle;
  archivedAt?: string;
  archivedReason?: "completed" | "manual";
  /** Eintrag aus `training_plan_library`, wenn ich den Plan verwalten darf. */
  library?: LibraryEntry;
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TH";
}

/** Kurzname für enge Stellen: „Mia Kaiser“ → „Mia K.“ */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

function tricksOf(plan: TrainingPlan): HubTrick[] {
  return [...plan.tricks]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((trick) =>
      trick.type === "line"
        ? {
            id: trick.id,
            name: trick.name,
            goal: trick.targetValue ?? "",
            hint: trick.trainerNote ?? "",
            type: "line" as const,
            parts: (trick.trickIds ?? []).map((id, index) => ({ id, name: trick.trickNames?.[index] ?? id })),
          }
        : {
            id: trick.id,
            name: trick.name,
            goal: trick.targetValue ?? "",
            hint: trick.trainerNote ?? "",
          },
    );
}

/**
 * Lines stehen in Pfad und Matrix hinter den Einzeltricks; die Reihenfolge
 * innerhalb der beiden Arten bleibt erhalten.
 */
export function tricksThenLines<T extends { type?: string }>(items: T[]) {
  return [...items.filter((item) => item.type !== "line"), ...items.filter((item) => item.type === "line")];
}

function stepsOf(plan: TrainingPlan): Record<string, Step> {
  return Object.fromEntries(plan.tricks.map((trick) => [trick.id, stepOf[trick.status] ?? 0]));
}

function liveConfirmedOf(plan: TrainingPlan): Record<string, string> {
  return Object.fromEntries(
    plan.tricks.flatMap((trick) =>
      trick.status === "confirmed" && trick.confirmedSource === "live" ? [[trick.id, trick.confirmedAt ?? ""]] : [],
    ),
  );
}

function recapConfirmedOf(plan: TrainingPlan): Record<string, string> {
  return Object.fromEntries(
    plan.tricks.flatMap((trick) =>
      trick.status === "confirmed" && trick.confirmedSource === "recap" ? [[trick.id, trick.confirmedAt ?? ""]] : [],
    ),
  );
}

function assignmentOf(share: TrainingPlan, athleteId: string, athleteName: string): HubAssignment {
  return {
    shareId: share.id,
    athleteId,
    athleteName,
    initials: initialsOf(athleteName),
    steps: stepsOf(share),
    recapConfirmed: recapConfirmedOf(share),
    liveConfirmed: liveConfirmedOf(share),
    archived: Boolean(share.shareArchivedAt),
    archivedReason: share.shareArchivedReason,
  };
}

/** Zusatzfelder mit Standardwerten, damit alle Plan-Arten vollständig sind. */
const planDefaults = {
  createdByAthlete: "",
  isTemplate: false,
  sharedWithTrainer: false,
  groupIds: [] as string[],
  clubAssigned: false,
  lifecycle: "active" as PlanLifecycle,
};

function authorName(plan: TrainingPlan) {
  // Das Repository ergänzt „ · empfangen“ bzw. „ · versendet“ am Autor.
  return plan.author.replace(/ · (empfangen|versendet)$/, "");
}

export function buildHubPlans({
  savedPlans,
  shares,
  userId,
  names,
  context = emptyHubContext,
  library = null,
  staff = false,
}: {
  savedPlans: SavedPlan[];
  shares: TrainingPlan[];
  userId: string;
  names: Map<string, string>;
  context?: HubContext;
  /** Archiv-/Papierkorbstatus; null, solange die Migration fehlt (dann alles aktiv). */
  library?: LibraryEntry[] | null;
  /** Trainer/Vorstand: eigene Pläne ohne aktive Zuweisung gelten als Entwurf. */
  staff?: boolean;
}): HubPlan[] {
  const nameOf = (id: string) => names.get(id) ?? "Athlet*in";
  const templateIds = new Set(context.clubTemplateIds);
  // Nur eigene Einträge; Pläne anderer Trainer (Vorstand) zeigt die Vereinsansicht.
  const ownLibrary = new Map((library ?? []).filter((entry) => entry.own).map((entry) => [entry.key, entry]));

  // Eigenfreigaben („Mit deinem Trainer teilen“) gehören zum eigenen Plan und
  // liefern dessen Fortschritt; sie erscheinen nicht zusätzlich als „erhalten“.
  const selfShares = new Map<string, TrainingPlan>();
  for (const share of shares) {
    if (share.shareDirection === "received" && share.sharedById === userId && share.sourcePlanId) {
      if (!selfShares.has(share.sourcePlanId)) selfShares.set(share.sourcePlanId, share);
    }
  }

  // Versendete Freigaben werden je Ursprungsplan zu einer Gruppe gebündelt.
  // Neueste zuerst, damit Titel und Trickliste dem aktuellsten Stand folgen.
  const sentGroups = new Map<string, TrainingPlan[]>();
  for (const share of shares) {
    if (share.shareDirection !== "sent") continue;
    const key = share.sourcePlanId || share.title;
    sentGroups.set(key, [...(sentGroups.get(key) ?? []), share]);
  }
  for (const group of sentGroups.values()) {
    group.sort((a, b) => (b.sharedAt ?? "").localeCompare(a.sharedAt ?? ""));
  }

  const assignmentsOf = (group: TrainingPlan[] | undefined): HubAssignment[] => {
    // Pro Athlet zählt nur die neueste Freigabe desselben Plans.
    const seen = new Set<string>();
    return (group ?? []).flatMap((share) => {
      const athleteId = share.recipientUserId ?? "";
      if (!athleteId || seen.has(athleteId)) return [];
      seen.add(athleteId);
      return [assignmentOf(share, athleteId, nameOf(athleteId))];
    });
  };

  const result: HubPlan[] = [];

  for (const saved of savedPlans) {
    const latest = saved.versions[0];
    if (!latest) continue;
    const content = latest.content;
    const group = sentGroups.get(saved.id);
    sentGroups.delete(saved.id);
    const selfShare = selfShares.get(saved.id);
    const assignments = selfShare ? [assignmentOf(selfShare, userId, nameOf(userId))] : assignmentsOf(group);
    const assignedGroups = context.groupAssignments.filter((entry) => entry.planId === saved.id);
    const active = assignments.filter((assignment) => !assignment.archived);
    result.push({
      ...planDefaults,
      library: ownLibrary.get(saved.id),
      isTemplate: templateIds.has(saved.id),
      sharedWithTrainer: Boolean(selfShare),
      groupIds: assignedGroups.flatMap((entry) => (entry.groupId ? [entry.groupId] : [])),
      clubAssigned: assignedGroups.some((entry) => entry.organizationId),
      key: saved.id,
      title: saved.title || content.title,
      category: content.category ?? "",
      level: content.level ?? "",
      goal: content.description ?? "",
      deadline: content.deadline,
      version: latest.version_number,
      createdAt: saved.versions[saved.versions.length - 1]?.created_at ?? latest.created_at,
      kind: "own",
      isDraft: content.status === "draft" && active.length === 0 && !templateIds.has(saved.id),
      tricks: tricksOf(content),
      assignments,
      editable: content,
      savedPlanId: saved.id,
      startId: saved.id,
      sourceLabel: assignments.length ? "" : "Eigener Plan",
      author: "",
    });
  }

  for (const [key, group] of sentGroups) {
    const newest = group[0];
    result.push({
      ...planDefaults,
      library: ownLibrary.get(key),
      key: `sent:${key}`,
      title: newest.title,
      category: newest.category ?? "",
      level: newest.level ?? "",
      goal: newest.description ?? "",
      deadline: newest.deadline,
      version: Number.parseInt(newest.version, 10) || null,
      createdAt: group[group.length - 1].sharedAt,
      kind: "sent",
      isDraft: false,
      tricks: tricksOf(newest),
      assignments: assignmentsOf(group),
      editable: null,
      startId: newest.id,
      sourceLabel: "",
      author: authorName(newest),
    });
  }

  for (const share of shares) {
    if (share.shareDirection !== "received") continue;
    if (share.sharedById === userId && share.sourcePlanId && selfShares.get(share.sourcePlanId) === share) continue;
    const sender = (share.sharedById && names.get(share.sharedById)) || authorName(share);
    result.push({
      ...planDefaults,
      key: share.id,
      title: share.title,
      category: share.category ?? "",
      level: share.level ?? "",
      goal: share.description ?? "",
      deadline: share.deadline,
      version: Number.parseInt(share.version, 10) || null,
      createdAt: share.sharedAt,
      kind: "received",
      isDraft: false,
      lifecycle: share.shareArchivedAt ? "archived" : "active",
      archivedAt: share.shareArchivedAt,
      archivedReason: share.shareArchivedReason,
      tricks: tricksOf(share),
      assignments: [assignmentOf(share, userId, nameOf(userId))],
      editable: null,
      startId: share.id,
      sourceLabel: sender,
      author: sender,
    });
  }

  // Trainer-Sicht: von Athlet*innen erstellte und geteilte Pläne.
  for (const share of shares) {
    if (share.shareDirection !== "coached" || !share.recipientUserId) continue;
    const athleteName = nameOf(share.recipientUserId);
    result.push({
      ...planDefaults,
      key: `athlete:${share.id}`,
      title: share.title,
      category: share.category ?? "",
      level: share.level ?? "",
      goal: share.description ?? "",
      deadline: share.deadline,
      version: Number.parseInt(share.version, 10) || null,
      createdAt: share.sharedAt,
      kind: "athlete",
      isDraft: false,
      lifecycle: share.shareArchivedAt ? "archived" : "active",
      archivedAt: share.shareArchivedAt,
      archivedReason: share.shareArchivedReason,
      tricks: tricksOf(share),
      assignments: [assignmentOf(share, share.recipientUserId, athleteName)],
      editable: null,
      // Trainings aus fremden Eigenplänen startet nur die Athletin/der Athlet selbst.
      startId: null,
      sourceLabel: "",
      author: athleteName,
      createdByAthlete: athleteName,
      sharedWithTrainer: true,
    });
  }

  // Vereinsvorlagen anderer Personen: nur ansehen und als Vorlage übernehmen.
  for (const template of context.templates) {
    if (template.own) continue;
    const content = template.content;
    result.push({
      ...planDefaults,
      key: `template:${template.id}`,
      title: template.title || content.title,
      category: content.category ?? "",
      level: content.level ?? "",
      goal: content.description ?? "",
      version: Number.parseInt(content.version, 10) || null,
      kind: "template",
      isDraft: false,
      tricks: tricksOf(content),
      assignments: [],
      editable: null,
      startId: null,
      sourceLabel: template.organizationName,
      author: template.authorName,
      isTemplate: true,
      templateContent: content,
    });
  }

  return result.flatMap((plan) => {
    if (plan.kind !== "own" && plan.kind !== "sent") return [plan];
    return plan.library?.deletedAt ? [] : [withLifecycle(plan, staff)];
  });
}

/**
 * Bereich eigener bzw. versendeter Pläne: archiviert laut Bibliothek (ohne
 * Bibliothek: alle Kopien erledigt), sonst Entwurf ohne aktive Zuweisung.
 */
function withLifecycle(plan: HubPlan, staff: boolean): HubPlan {
  const active = plan.assignments.filter((assignment) => !assignment.archived);
  const archived = plan.library
    ? Boolean(plan.library.archivedAt)
    : plan.assignments.length > 0 && active.length === 0;
  if (archived) {
    return {
      ...plan,
      lifecycle: "archived",
      archivedAt: plan.library?.archivedAt ?? undefined,
      archivedReason: plan.library?.archivedReason ?? "completed",
    };
  }
  const draft = plan.isDraft || (staff && plan.kind === "own" && !plan.isTemplate && active.length === 0);
  // Aktive Pläne zeigen abgewählte Kopien nicht mehr; wer alles bestätigt hat, bleibt (100 %) sichtbar.
  const shown = plan.assignments.filter((assignment) => !assignment.archived || assignment.archivedReason === "completed");
  // Entwürfe haben keine aktive Zuweisung – dort zählt niemand mehr als zugewiesen.
  return { ...plan, assignments: draft ? [] : shown, lifecycle: draft ? "draft" : "active" };
}

/** Eigene Fortschrittszeile einer Athletin/eines Athleten (erhalten oder mit Trainer geteilt). */
export function myAssignment(plan: HubPlan): HubAssignment | null {
  return plan.kind === "received" || (plan.kind === "own" && plan.sharedWithTrainer)
    ? plan.assignments[0] ?? null
    : null;
}

export type BadgeTone = "warn" | "draft" | "template" | "athlete";

/**
 * Badges auf Plan-Karten in fester Reihenfolge: „N offen“, „Entwurf“,
 * „Vorlage“, „Athlet“ (nur Trainer-Sicht auf Pläne von Athlet*innen).
 */
export function planBadges(plan: HubPlan, role: HubRole): { label: string; tone: BadgeTone }[] {
  const badges: { label: string; tone: BadgeTone }[] = [];
  const open = role === "staff" ? openReports(plan).length : 0;
  if (open) badges.push({ label: `${open} offen`, tone: "warn" });
  if (plan.isDraft) badges.push({ label: "Entwurf", tone: "draft" });
  if (plan.isTemplate) badges.push({ label: "Vorlage", tone: "template" });
  if (role === "staff" && plan.kind === "athlete") badges.push({ label: "Athlet", tone: "athlete" });
  return badges;
}

/** Offene Meldungen zuerst, danach aktive vor Entwürfen, sonst neueste zuerst. */
export function sortHubPlans(plans: HubPlan[], role: HubRole) {
  const score = (plan: HubPlan) =>
    role === "staff"
      ? openReports(plan).length * 10 + (plan.assignments.length ? 5 : 0) - (plan.isDraft ? 5 : 0) - (plan.kind === "template" ? 8 : 0)
      : plan.kind === "received" ? 10 : 0;
  return [...plans].sort(
    (a, b) => score(b) - score(a) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
}

/* ------------------------------------------------------------------ */
/* Kennzahlen                                                           */
/* ------------------------------------------------------------------ */

export function cells(plan: HubPlan) {
  return plan.assignments.flatMap((assignment) =>
    plan.tricks.flatMap((trick) => {
      const step = assignment.steps[trick.id];
      return step === undefined ? [] : [{ assignment, trick, step }];
    }),
  );
}

export function confirmedCount(plan: HubPlan) {
  return cells(plan).filter((cell) => cell.step === 3).length;
}

/** Anteil bestätigter Tricks über alle zugewiesenen Athleten (0–100). */
export function planPercent(plan: HubPlan) {
  const all = cells(plan);
  return all.length ? Math.round((all.filter((cell) => cell.step === 3).length / all.length) * 100) : 0;
}

export function openReports(plan: HubPlan) {
  return cells(plan).filter((cell) => cell.step === 2);
}

export interface TrickAggregate {
  confirmed: number;
  waiting: number;
  practiced: number;
  total: number;
  /** Farbe des Punkts bzw. Knotens: alle bestätigt → 3, Meldung offen → 2 usw. */
  step: Step;
}

export function trickAggregate(plan: HubPlan, trickId: string): TrickAggregate {
  const steps = plan.assignments
    .map((assignment) => assignment.steps[trickId])
    .filter((step): step is Step => step !== undefined);
  const confirmed = steps.filter((step) => step === 3).length;
  const waiting = steps.filter((step) => step === 2).length;
  const practiced = steps.filter((step) => step === 1).length;
  const step: Step = steps.length && confirmed === steps.length
    ? 3
    : waiting
      ? 2
      : practiced || confirmed
        ? 1
        : 0;
  return { confirmed, waiting, practiced, total: steps.length, step };
}

/** Aktueller Trick im Pfad: Athlet = erster < Gemeldet, Staff = erste offene Meldung. */
export function currentTrickIndex(plan: HubPlan, role: HubRole) {
  if (!plan.assignments.length) return -1;
  if (role === "staff") {
    return plan.tricks.findIndex((trick) => trickAggregate(plan, trick.id).waiting > 0);
  }
  const mine = myAssignment(plan);
  if (!mine) return -1;
  return plan.tricks.findIndex((trick) => (mine.steps[trick.id] ?? 0) < 2);
}

export interface NextStep {
  plan: HubPlan;
  trick: HubTrick;
  step: Step;
}

/** „Dein nächster Schritt“: erster erhaltener Trick, der noch nicht gemeldet ist. */
export function nextStepFor(plans: HubPlan[]): NextStep | null {
  for (const plan of plans) {
    const mine = myAssignment(plan);
    if (!mine) continue;
    for (const trick of plan.tricks) {
      const step = mine.steps[trick.id] ?? 0;
      if (step < 2) return { plan, trick, step };
    }
  }
  return null;
}

/** „↑ Trick melden“: erster geübter, noch nicht gemeldeter Trick. */
export function nextReportable(plans: HubPlan[]) {
  for (const plan of plans) {
    const mine = myAssignment(plan);
    if (!mine) continue;
    const trick = plan.tricks.find((entry) => mine.steps[entry.id] === 1);
    if (trick) return { plan, assignment: mine, trick };
  }
  return null;
}

/** Spielerische Stufe im Pfad: je zwei bestätigte Tricks eine Stufe höher. */
export function levelOf(confirmed: number) {
  return Math.floor(confirmed / 2) + 1;
}

/* ------------------------------------------------------------------ */
/* Videonachweise                                                       */
/* ------------------------------------------------------------------ */

export const cellKey = (shareId: string, trickId: string) => `${shareId}:${trickId}`;

/** Neuester offener Nachweis je Freigabe und Trick. */
export function pendingEvidenceMap(evidence: TrainingVideoEvidence[]) {
  const map = new Map<string, TrainingVideoEvidence>();
  for (const entry of evidence) {
    if (entry.reviewStatus !== "pending") continue;
    const key = cellKey(entry.planId, entry.trickId);
    const known = map.get(key);
    if (!known || known.submittedAt < entry.submittedAt) map.set(key, entry);
  }
  return map;
}

export interface WaitingReport {
  plan: HubPlan;
  assignment: HubAssignment;
  trick: HubTrick;
  evidence?: TrainingVideoEvidence;
}

export function waitingReports(
  plans: HubPlan[],
  evidence: Map<string, TrainingVideoEvidence>,
): WaitingReport[] {
  return plans
    .flatMap((plan) =>
      openReports(plan).map(({ assignment, trick }) => ({
        plan,
        assignment,
        trick,
        evidence: evidence.get(cellKey(assignment.shareId, trick.id)),
      })),
    )
    .sort((a, b) => (b.evidence?.submittedAt ?? "").localeCompare(a.evidence?.submittedAt ?? ""));
}

/* ------------------------------------------------------------------ */
/* Datum & Zahlen (deutsch)                                             */
/* ------------------------------------------------------------------ */

const dayMs = 86_400_000;

function berlinParts(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return {
    weekday: new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "Europe/Berlin" }).format(date),
    day: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }).format(date),
    time: new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(date),
  };
}

/** „Do. 24.09.“ */
export function formatDay(value: string | Date) {
  const { weekday, day } = berlinParts(value);
  return `${weekday.replace(/\.$/, "")}. ${day.replace(/\.$/, "")}.`;
}

/** „15:16 Uhr“ */
export function formatTime(value: string | Date) {
  return `${berlinParts(value).time} Uhr`;
}

/** „gerade eben“, „vor 2 Std.“, „gestern, 18:40“, „Mo. 22.09.“ */
export function formatRelative(value: string, now = Date.now()) {
  const diff = now - Date.parse(value);
  if (diff < 5 * 60_000) return "gerade eben";
  if (diff < 60 * 60_000) return `vor ${Math.round(diff / 60_000)} Min.`;
  if (diff < 12 * 60 * 60_000) return `vor ${Math.round(diff / 3_600_000)} Std.`;
  if (diff < 2 * dayMs) return `gestern, ${berlinParts(value).time}`;
  return formatDay(value);
}

/** Kalendertage von heute bis zur Frist (heute = 0), sonst null. */
export function daysUntil(deadline: string | undefined, now = Date.now()) {
  if (!deadline) return null;
  const end = new Date(deadline.length === 10 ? `${deadline}T12:00:00` : deadline);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date(now);
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const startDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((endDay - startDay) / dayMs);
}

export function deadlineText(deadline: string | undefined, now = Date.now()) {
  const days = daysUntil(deadline, now);
  if (days === null || !deadline) return null;
  const day = formatDay(deadline.length === 10 ? `${deadline}T12:00:00` : deadline).replace(/^\S+ /, "");
  if (days < 0) return `${day} · abgelaufen`;
  if (days === 0) return `${day} · heute`;
  return `${day} · noch ${days} ${days === 1 ? "Tag" : "Tage"}`;
}

export function inDays(days: number) {
  return days === 0 ? "heute" : days === 1 ? "in 1 Tag" : `in ${days} Tagen`;
}

export function formatDecimal(value: number) {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

/** „1 min 32 s“ bzw. „42 min“ */
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 10) return `${minutes} min`;
  return `${minutes} min ${seconds % 60} s`;
}

/* ------------------------------------------------------------------ */
/* Session-Rückblick                                                    */
/* ------------------------------------------------------------------ */

export type RecapPeriod = "7" | "30" | "season";

/** Saison = laufendes Kalenderjahr. */
export function periodStart(period: RecapPeriod, now = new Date()) {
  if (period === "season") return new Date(now.getFullYear(), 0, 1).getTime();
  return now.getTime() - Number(period) * dayMs;
}

export function quoteOf(attempts: number, landed: number) {
  return attempts > 0 ? Math.round((landed / attempts) * 100) : null;
}

/** Farbstufe einer Quote: ≥ 80 grün, 50–79 blau, < 50 amber. */
export function quoteTone(quote: number | null): "good" | "mid" | "low" | "none" {
  if (quote === null) return "none";
  return quote >= 80 ? "good" : quote >= 50 ? "mid" : "low";
}

export interface RecapTotals {
  sessions: number;
  attempts: number;
  landed: number;
  quote: number | null;
  elapsedMs: number;
}

export function recapTotals(recaps: SessionRecap[]): RecapTotals {
  let attempts = 0;
  let landed = 0;
  let elapsedMs = 0;
  for (const recap of recaps) {
    for (const exercise of recap.exercises) {
      attempts += exercise.attempts;
      landed += exercise.landed;
      elapsedMs += Number(exercise.elapsed_ms);
    }
  }
  return { sessions: recaps.length, attempts, landed, quote: quoteOf(attempts, landed), elapsedMs };
}

export interface SkillSummary {
  skillId: string;
  name: string;
  attempts: number;
  landed: number;
  quote: number | null;
  /** Quote je Session in zeitlicher Reihenfolge (für die Mini-Balken). */
  series: number[];
  /** Letzte minus erste Session-Quote, null bei nur einer Session. */
  trend: number | null;
  /** Line: Quote = komplette Lines; `lineTricks`/`breaks` für die Bruchstellen. */
  kind?: "trick" | "line";
  lineTricks?: string[];
  /** Nicht komplette Line-Versuche je Bruchstelle (Index; -1 = ohne Angabe). */
  breaks?: Record<number, number>;
  /** Einzeltrick: Quote dieses Tricks innerhalb von Lines (getrennt von `quote`). */
  inLines?: number | null;
}

type RecapExercise = SessionRecap["exercises"][number];

/**
 * Je Trick einer Line: erreicht = kam bis zu diesem Trick (komplett oder erst
 * an oder nach ihm gebrochen), gestanden = kam darüber hinaus. Versuche ohne
 * Angabe der Bruchstelle zählen für keinen Trick.
 */
export function lineTrickStats(exercise: Pick<RecapExercise, "landed" | "line_tricks" | "breaks">) {
  const names = exercise.line_tricks ?? [];
  const brokeAt = (k: number) =>
    (exercise.breaks ?? []).filter((entry) => entry.broke_at === k).reduce((sum, entry) => sum + entry.attempts, 0);
  return names.map((name, index) => {
    let reached = exercise.landed;
    let landed = exercise.landed;
    for (let k = index; k < names.length; k++) reached += brokeAt(k);
    for (let k = index + 1; k < names.length; k++) landed += brokeAt(k);
    return { name, reached, landed };
  });
}

/** Häufigste Bruchstelle einer Line als „bricht meist bei …“. */
export function lineBreakText(skill: Pick<SkillSummary, "breaks" | "lineTricks">) {
  let best = -1;
  let count = 0;
  for (const [index, n] of Object.entries(skill.breaks ?? {})) {
    if (Number(index) < 0 || n <= count) continue;
    best = Number(index);
    count = n;
  }
  return best >= 0 ? `bricht meist bei ${skill.lineTricks?.[best] ?? `Trick ${best + 1}`}` : "";
}

/**
 * Fasst Skills pro Trick über den Zeitraum zusammen. Quoten werden aus Summen
 * berechnet (nie als Mittel von Prozentwerten).
 */
export function skillSummaries(recaps: SessionRecap[]): SkillSummary[] {
  const chronological = [...recaps].sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  const skills = new Map<string, SkillSummary>();
  // Trickquoten innerhalb von Lines, getrennt nach Name (nie in die Trickquote gemischt).
  const inLines = new Map<string, { reached: number; landed: number }>();
  for (const recap of chronological) {
    for (const exercise of recap.exercises) {
      if (!exercise.attempts) continue;
      const line = exercise.kind === "line";
      const skill = skills.get(exercise.skill_id) ?? {
        skillId: exercise.skill_id,
        name: exercise.name,
        attempts: 0,
        landed: 0,
        quote: null,
        series: [],
        trend: null,
        ...(line ? { kind: "line" as const, lineTricks: exercise.line_tricks ?? [], breaks: {} } : {}),
      };
      skill.attempts += exercise.attempts;
      skill.landed += exercise.landed;
      skill.series.push(quoteOf(exercise.attempts, exercise.landed) ?? 0);
      if (line) {
        for (const entry of exercise.breaks ?? []) {
          const key = entry.broke_at ?? -1;
          skill.breaks![key] = (skill.breaks![key] ?? 0) + entry.attempts;
        }
        for (const stat of lineTrickStats(exercise)) {
          const key = stat.name.trim().toLowerCase();
          const sum = inLines.get(key) ?? { reached: 0, landed: 0 };
          sum.reached += stat.reached;
          sum.landed += stat.landed;
          inLines.set(key, sum);
        }
      }
      skills.set(exercise.skill_id, skill);
    }
  }
  return [...skills.values()]
    .map((skill) => {
      const lines = skill.kind === "line" ? undefined : inLines.get(skill.name.trim().toLowerCase());
      return {
        ...skill,
        quote: quoteOf(skill.attempts, skill.landed),
        trend: skill.series.length > 1 ? skill.series[skill.series.length - 1] - skill.series[0] : null,
        ...(lines ? { inLines: quoteOf(lines.reached, lines.landed) } : {}),
      };
    })
    .sort((a, b) => b.attempts - a.attempts);
}

/** Planstatus eines Skills über den Namen des Tricks im zugewiesenen Plan. */
export function planStepForSkill(plans: HubPlan[], athleteId: string, skillName: string) {
  const needle = skillName.trim().toLowerCase();
  let best: { step: Step; plan: HubPlan; trick: HubTrick; assignment: HubAssignment } | null = null;
  for (const plan of plans) {
    const assignment = plan.assignments.find((entry) => entry.athleteId === athleteId);
    if (!assignment) continue;
    for (const trick of plan.tricks) {
      const step = assignment.steps[trick.id];
      if (step === undefined || trick.name.trim().toLowerCase() !== needle) continue;
      if (!best || step > best.step) best = { step, plan, trick, assignment };
    }
  }
  return best;
}
