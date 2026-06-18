"use server";

import { revalidatePath } from "next/cache";
import type { CalendarEvent, EventType } from "@/domain/models";
import {
  mapCalendarEvent,
  type CalendarEventRow,
} from "@/data/supabase-event-repository";
import { createClient } from "@/lib/supabase/server";

export interface CalendarMutationResult {
  status: "success" | "error";
  message: string;
  event?: CalendarEvent;
}

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
  const date = String(formData.get("date") || "");
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");
  const location = String(formData.get("location") || "").trim();
  const state = normalizeStateCode(String(formData.get("state") || ""));
  const region = String(formData.get("region") || "").trim();
  const capacity = Number(formData.get("capacity"));
  const description = String(formData.get("description") || "").trim();

  if (
    !organizationId ||
    !title ||
    !eventTypes.has(type) ||
    !date ||
    !startTime ||
    !endTime ||
    !location ||
    !state ||
    !Number.isInteger(capacity) ||
    capacity < 1
  ) {
    return null;
  }

  const startsAt = new Date(`${date}T${startTime}:00`);
  const endsAt = new Date(`${date}T${endTime}:00`);

  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return null;
  }

  return {
    id,
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
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = claimsData?.claims.sub;

  if (!currentUserId) {
    return {
      status: "error",
      message: "Bitte melde dich erneut an.",
    };
  }

  const query = parsed.id
    ? supabase
        .from("events")
        .update(parsed.values)
        .eq("id", parsed.id)
        .eq("created_by", currentUserId)
    : supabase.from("events").insert({
        ...parsed.values,
        created_by: currentUserId,
      });

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
      capacity
    `)
    .maybeSingle();

  if (error || !data) {
    return {
      status: "error",
      message: parsed.id
        ? "Der Termin konnte nicht bearbeitet werden. Nur der Ersteller darf Änderungen speichern."
        : "Der Termin konnte nicht erstellt werden. Prüfe deine Organisationszuordnung.",
    };
  }

  revalidatePath("/kalender");

  return {
    status: "success",
    message: parsed.id
      ? "Der Termin wurde aktualisiert."
      : "Der Termin wurde erstellt.",
    event: mapCalendarEvent(data as CalendarEventRow, currentUserId),
  };
}

/**
 * Löscht einen Termin ausschließlich als dessen Ersteller.
 */
export async function deleteCalendarEvent(
  eventId: string,
): Promise<CalendarMutationResult> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = claimsData?.claims.sub;

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
