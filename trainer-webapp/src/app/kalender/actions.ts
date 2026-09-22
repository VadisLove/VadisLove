"use server";

import { revalidatePath } from "next/cache";
import type { AttendanceStatus, CalendarEvent, EventType } from "@/domain/models";
import {
  calendarEventSelect,
  mapCalendarEvent,
  type CalendarEventRow,
} from "@/data/supabase-event-repository";
import {
  calendarCommunicationError,
  normalizeEventInformationLinks,
} from "@/domain/calendar-communication";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { parseBerlinCalendarDateTime } from "@/lib/calendar-date-time";
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
  const responseDeadlineDate = String(formData.get("responseDeadlineDate") || "");
  const responseDeadlineTime = String(formData.get("responseDeadlineTime") || "");
  const updateScope = String(formData.get("updateScope") || "single") === "future"
    ? "future"
    : "single";
  const requireAcknowledgement = formData.get("requireAcknowledgement") === "on";
  const labels = formData.getAll("linkLabel").map(String);
  const urls = formData.getAll("linkUrl").map(String);
  const informationLinks = normalizeEventInformationLinks(
    labels.map((label, index) => ({ label, url: urls[index] || "" })),
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
    capacity < 1 || informationLinks === null ||
    Boolean(responseDeadlineDate) !== Boolean(responseDeadlineTime)
  ) {
    return null;
  }

  // Kalenderwerte sind Berliner Ortszeiten. Die explizite Umwandlung verhindert,
  // dass die Zeitzone des Servers gespeicherte Uhrzeiten unbemerkt verschiebt.
  const startsAt = parseBerlinCalendarDateTime(startDate, startTime);
  const endsAt = parseBerlinCalendarDateTime(endDate, endTime);
  const responseDeadline = responseDeadlineDate && responseDeadlineTime
    ? parseBerlinCalendarDateTime(responseDeadlineDate, responseDeadlineTime)
    : null;

  if (
    !startsAt ||
    !endsAt ||
    endsAt <= startsAt || (responseDeadline && responseDeadline >= startsAt)
  ) {
    return null;
  }

  return {
    id,
    repeatWeekly: !id && repeatWeekly,
    repeatCount: Number.isInteger(repeatCount) ? repeatCount : 1,
    updateScope,
    requireAcknowledgement,
    informationLinks,
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
      response_deadline: responseDeadline?.toISOString() || "",
    },
  };
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

  const mutation = parsed.id
    ? await supabase.rpc("update_calendar_event", {
      target_event: parsed.id,
        payload: { ...parsed.values, links: parsed.informationLinks },
        update_scope: parsed.updateScope,
        require_acknowledgement: parsed.requireAcknowledgement,
      })
    : await supabase.rpc("create_calendar_events", {
        payload: parsed.values,
        repeat_count: parsed.repeatWeekly ? parsed.repeatCount : 1,
        links: parsed.informationLinks,
      });
  const savedIds = ((mutation.data || []) as Array<string | Record<string, string>>)
    .map((item) => typeof item === "string"
      ? item
      : item.id || item.update_calendar_event || item.create_calendar_events)
    .filter((item): item is string => Boolean(item));
  const { data, error: loadError } = savedIds.length
    ? await supabase.from("events").select(calendarEventSelect).in("id", savedIds).order("starts_at")
    : { data: [], error: null };
  const error = mutation.error || loadError;
  const savedRows = (data || []) as unknown as CalendarEventRow[];

  if (error || savedRows.length === 0) {
    return {
      status: "error",
      message: parsed.id
        ? calendarCommunicationError(error || {})
        : calendarCommunicationError(error || {}),
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

  const { data: currentUserEmail } = await supabase.rpc(
    "get_current_profile_email",
  );
  const email = currentUserEmail?.trim();

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
    .select(calendarEventSelect)
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

  // Die RPC gibt nur eine ID zurueck, wenn der Aufrufer diesen Termin verwalten
  // darf und das Zielprofil nach den bestehenden Sichtbarkeitsregeln sichtbar
  // ist. Nicht sichtbare oder unbekannte Personen bleiben E-Mail-Einladungen.
  const { data: profileId, error: resolutionError } = await supabase.rpc(
    "resolve_event_participant_profile",
    { p_event_id: eventId, p_email: email },
  );

  if (resolutionError) {
    return {
      status: "error",
      message:
        "Die Person konnte nicht eingeladen werden. Nur der Event-Ersteller oder organisatorisch Verantwortliche dürfen Teilnehmende hinzufügen.",
    };
  }

  const { error } = await supabase.from("event_participants").insert({
    event_id: eventId,
    user_id: profileId || null,
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

  const { data, error } = await supabase.rpc("delete_or_cancel_calendar_event", {
    target_event: eventId,
  });

  if (error || !data) {
    return {
      status: "error",
      message: "Nur der Ersteller darf diesen Termin löschen.",
    };
  }

  revalidatePath("/kalender");
  revalidatePath("/");
  if (data === "cancelled") {
    const { data: row } = await supabase
      .from("events")
      .select(calendarEventSelect)
      .eq("id", eventId)
      .maybeSingle<CalendarEventRow>();
    return {
      status: "success",
      message: "Der kommunizierte Termin wurde abgesagt und die Beteiligten wurden informiert.",
      event: row ? mapCalendarEvent(row, currentUserId) : undefined,
    };
  }
  return { status: "success", message: "Der noch nicht kommunizierte Termin wurde gelöscht." };
}

/** Schaltet die freiwillige eigene Rückmelde-Erinnerung für genau diesen Termin. */
export async function setCalendarReminder(eventId: string, enabled: boolean): Promise<CalendarMutationResult> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte melde dich erneut an." };
  const { error } = await supabase.rpc("set_event_reminder", { target_event: eventId, enabled });
  if (error) return { status: "error", message: calendarCommunicationError(error) };
  const { data: email } = await supabase.rpc("get_current_profile_email");
  const { data } = await supabase.from("events").select(calendarEventSelect).eq("id", eventId).maybeSingle<CalendarEventRow>();
  revalidatePath("/kalender");
  return {
    status: "success",
    message: enabled ? "Rückmelde-Erinnerungen sind für diesen Termin aktiviert." : "Rückmelde-Erinnerungen sind deaktiviert.",
    event: data ? mapCalendarEvent(data, currentUserId, email || "") : undefined,
  };
}

/** Bestätigt nur die aktuelle wichtige Revision und verändert nie die Teilnahme. */
export async function acknowledgeCalendarRevision(eventId: string, revision: number): Promise<CalendarMutationResult> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte melde dich erneut an." };
  const { error } = await supabase.rpc("acknowledge_event_revision", {
    target_event: eventId,
    target_revision: revision,
  });
  if (error) return { status: "error", message: calendarCommunicationError(error) };
  const { data: email } = await supabase.rpc("get_current_profile_email");
  const { data } = await supabase.from("events").select(calendarEventSelect).eq("id", eventId).maybeSingle<CalendarEventRow>();
  revalidatePath("/kalender");
  return {
    status: "success",
    message: "Die wichtige Änderung wurde zur Kenntnis genommen. Deine Teilnahme bleibt unverändert.",
    event: data ? mapCalendarEvent(data, currentUserId, email || "") : undefined,
  };
}
