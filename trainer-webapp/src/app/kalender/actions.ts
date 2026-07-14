"use server";

import { revalidatePath } from "next/cache";
import type { AttendanceStatus, CalendarEvent, EventType } from "@/domain/models";
import {
  mapCalendarEvent,
  type CalendarEventRow,
} from "@/data/supabase-event-repository";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface CalendarMutationResult {
  status: "success" | "error";
  message: string;
  event?: CalendarEvent;
  events?: CalendarEvent[];
}

const responseStatuses = new Set<AttendanceStatus>(["confirmed", "declined"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const eventTypes = new Set<EventType>([
  "training",
  "contest",
  "medical",
  "meeting",
]);

const stateCodes: Record<string, string> = {
  "baden-württemberg": "BW",
  bayern: "BY",
  berlin: "BE",
  brandenburg: "BB",
  bremen: "HB",
  hamburg: "HH",
  hessen: "HE",
  "mecklenburg-vorpommern": "MV",
  niedersachsen: "NI",
  "nordrhein-westfalen": "NW",
  "rheinland-pfalz": "RP",
  saarland: "SL",
  sachsen: "SN",
  "sachsen-anhalt": "ST",
  "schleswig-holstein": "SH",
  thüringen: "TH",
  deutschland: "DE",
};

function normalizeStateCode(value: string) {
  const normalized = value.trim();

  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }

  return stateCodes[normalized.toLowerCase()] || "";
}

function parseEventForm(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const organizationId = String(
    formData.get("organizationId") || "",
  ).trim();
  const title = String(formData.get("title") || "").trim();
  const type = String(formData.get("type") || "") as EventType;
  const startDate = String(
    formData.get("startDate") || formData.get("date") || "",
  );
  const endDate = String(formData.get("endDate") || startDate);
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");
  const location = String(formData.get("location") || "").trim();
  const state = normalizeStateCode(String(formData.get("state") || ""));
  const region = String(formData.get("region") || "").trim();
  const capacity = Number(formData.get("capacity"));
  const description = String(formData.get("description") || "").trim();
  const repeatWeekly = String(formData.get("repeatWeekly") || "") === "weekly";
  const repeatCount = Math.min(
    26,
    Math.max(1, Number(formData.get("repeatCount") || 1)),
  );

  if (
    !organizationId ||
    !title ||
    !eventTypes.has(type) ||
    !startDate ||
    !endDate ||
    !startTime ||
    !endTime ||
    !location ||
    !state ||
    !Number.isInteger(capacity) ||
    capacity < 1
  ) {
    return null;
  }

  // Start- und Enddatum werden getrennt erfasst, damit mehrtägige Termine
  // ohne zusätzliche Tabellen weiterhin als ein fachlicher Termin bestehen.
  const startsAt = new Date(`${startDate}T${startTime}:00`);
  const endsAt = new Date(`${endDate}T${endTime}:00`);

  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return null;
  }

  return {
    id,
    repeatWeekly: !id && repeatWeekly,
    repeatCount: Number.isInteger(repeatCount) ? repeatCount : 1,
    durationMs: endsAt.getTime() - startsAt.getTime(),
    startsAt,
    values: {
      organization_id: organizationId,
      title,
      description,
      type,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      location,
      state_code: state,
      region_name: region || null,
      capacity,
    },
  };
}

function addWeeks(date: Date, weeks: number) {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + weeks * 7);
  return nextDate;
}

/**
 * Erstellt oder bearbeitet einen Termin.
 *
 * Bei Updates wird zusätzlich nach `created_by` gefiltert. Die RLS-Policy
 * erzwingt dieselbe Eigentumsregel unabhängig von manipulierten Requests.
 */
export async function saveCalendarEvent(
  formData: FormData,
): Promise<CalendarMutationResult> {
  const parsed = parseEventForm(formData);

  if (!parsed) {
    return {
      status: "error",
      message: "Bitte alle Termindaten vollständig und gültig eingeben.",
    };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) {
    return {
      status: "error",
      message: "Bitte melde dich erneut an.",
    };
  }

  // Prüft die eigenen Rollen direkt, damit die Aktion nicht von einem
  // PostgREST-Schema-Cache für Hilfsfunktionen abhängig ist. PostgreSQL
  // erzwingt dieselbe Regel anschließend nochmals per RLS.
  const { data: memberships, error: permissionError } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("user_id", currentUserId)
    .eq("organization_id", parsed.values.organization_id);
  const canCreateEvent = (memberships || []).length > 0;

  if (permissionError || !canCreateEvent) {
    return {
      status: "error",
      message:
        "Du musst bestätigtes Mitglied der gewählten Organisation sein, um dort einen Termin zu erstellen.",
    };
  }

  const recurringValues = Array.from(
    { length: parsed.repeatWeekly ? parsed.repeatCount : 1 },
    (_, index) => {
      const startsAt = addWeeks(parsed.startsAt, index);
      const endsAt = new Date(startsAt.getTime() + parsed.durationMs);

      return {
        ...parsed.values,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: currentUserId,
      };
    },
  );

  const query = parsed.id
    ? supabase
        .from("events")
        .update(parsed.values)
        .eq("id", parsed.id)
        .eq("created_by", currentUserId)
    : supabase.from("events").insert(recurringValues);

  const { data, error } = await query
    .select(`
      id,
      organization_id,
      created_by,
      title,
      description,
      type,
      starts_at,
      ends_at,
      location,
      state_code,
      region_name,
      capacity,
      event_participants(
        status,
        user_id,
        invited_email,
        profiles:user_id(display_name, email, account_type)
      )
    `)
    .returns<CalendarEventRow[]>();

  const savedRows = Array.isArray(data) ? data : data ? [data] : [];

  if (error || savedRows.length === 0) {
    return {
      status: "error",
      message: parsed.id
        ? "Der Termin konnte nicht bearbeitet werden. Nur der Ersteller darf Änderungen speichern."
        : "Der Termin konnte nicht erstellt werden. Prüfe Rolle, Terminart und Organisation.",
    };
  }

  revalidatePath("/kalender");
  revalidatePath("/");

  return {
    status: "success",
    message: parsed.id
      ? "Der Termin wurde aktualisiert."
      : parsed.repeatWeekly && savedRows.length > 1
        ? `${savedRows.length} wiederkehrende Termine wurden erstellt.`
        : "Der Termin wurde erstellt.",
    event: mapCalendarEvent(savedRows[0], currentUserId),
    events: savedRows.map((row) => mapCalendarEvent(row, currentUserId)),
  };
}

/**
 * Speichert die eigene Zu- oder Absage fuer einen sichtbaren Termin.
 *
 * Falls noch kein Teilnehmerdatensatz existiert, wird einer fuer die eigene
 * Profil-E-Mail angelegt. Existiert eine Einladung per E-Mail, wird sie mit
 * dem aktuellen Profil verknuepft und aktualisiert.
 */
export async function respondToCalendarEvent(
  eventId: string,
  status: AttendanceStatus,
): Promise<CalendarMutationResult> {
  if (!eventId || !responseStatuses.has(status)) {
    return { status: "error", message: "Die Rückmeldung ist ungültig." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) {
    return { status: "error", message: "Bitte melde dich erneut an." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", currentUserId)
    .maybeSingle();
  const email = profile?.email?.trim();

  if (!email) {
    return {
      status: "error",
      message: "Für dein Profil fehlt eine E-Mail-Adresse.",
    };
  }

  const { error: upsertError } = await supabase
    .from("event_participants")
    .upsert(
      {
        event_id: eventId,
        user_id: currentUserId,
        invited_email: email,
        invited_by: currentUserId,
        status,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "event_id,invited_email" },
    );

  if (upsertError) {
    return {
      status: "error",
      message:
        "Deine Rückmeldung konnte nicht gespeichert werden. Prüfe, ob du Zugriff auf diesen Termin hast.",
    };
  }

  const { data } = await supabase
    .from("events")
    .select(`
      id,
      organization_id,
      created_by,
      title,
      description,
      type,
      starts_at,
      ends_at,
      location,
      state_code,
      region_name,
      capacity,
      event_participants(
        status,
        user_id,
        invited_email,
        profiles:user_id(display_name, email, account_type)
      )
    `)
    .eq("id", eventId)
    .maybeSingle<CalendarEventRow>();

  revalidatePath("/kalender");
  revalidatePath("/");

  return {
    status: "success",
    message:
      status === "confirmed"
        ? "Deine Zusage wurde gespeichert."
        : "Deine Absage wurde gespeichert.",
    event: data ? mapCalendarEvent(data, currentUserId, email) : undefined,
  };
}

/**
 * Fügt dem angegebenen Event eine eingeladene Person mit offenem Status hinzu.
 *
 * Existiert bereits ein sichtbares Profil mit dieser E-Mail-Adresse, wird die
 * Einladung direkt mit dem Nutzer verknüpft. Andernfalls bleibt `user_id` leer,
 * bis sich die Person später mit derselben E-Mail-Adresse anmeldet. RLS erlaubt
 * diese Änderung nur dem Event-Ersteller oder organisatorisch Verantwortlichen.
 */
export async function inviteEventParticipant(
  eventId: string,
  rawEmail: string,
): Promise<CalendarMutationResult> {
  const email = rawEmail.trim().toLowerCase();

  if (!eventId || !emailPattern.test(email)) {
    return {
      status: "error",
      message: "Bitte eine gültige E-Mail-Adresse eingeben.",
    };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) {
    return { status: "error", message: "Bitte melde dich erneut an." };
  }

  // Die Profilabfrage respektiert RLS. Nicht sichtbare oder noch nicht
  // registrierte Personen werden weiterhin sicher per E-Mail eingeladen.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("event_participants").insert({
    event_id: eventId,
    user_id: profile?.id || null,
    invited_email: email,
    invited_by: currentUserId,
    status: "open",
  });

  if (error) {
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "Diese Person ist für den Termin bereits eingetragen."
          : "Die Person konnte nicht eingeladen werden. Nur der Event-Ersteller oder organisatorisch Verantwortliche dürfen Teilnehmende hinzufügen.",
    };
  }

  // Dashboard und Kalender verwenden dieselbe Teilnehmerquelle und müssen nach
  // der Mutation gemeinsam aktualisiert werden.
  revalidatePath("/");
  revalidatePath("/kalender");

  return {
    status: "success",
    message: `${email} wurde zum Termin eingeladen.`,
  };
}

/**
 * Löscht einen Termin ausschließlich als dessen Ersteller.
 */
export async function deleteCalendarEvent(
  eventId: string,
): Promise<CalendarMutationResult> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId || !eventId) {
    return { status: "error", message: "Der Termin konnte nicht gelöscht werden." };
  }

  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("created_by", currentUserId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return {
      status: "error",
      message: "Nur der Ersteller darf diesen Termin löschen.",
    };
  }

  revalidatePath("/kalender");

  return { status: "success", message: "Der Termin wurde gelöscht." };
}
