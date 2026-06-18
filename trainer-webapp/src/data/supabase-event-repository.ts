import type {
  CalendarEvent,
  EventOrganizationOption,
  EventType,
} from "@/domain/models";
import { createClient } from "@/lib/supabase/server";

export interface CalendarEventRow {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string;
  type: EventType;
  starts_at: string;
  ends_at: string;
  location: string;
  state_code: string | null;
  region_name: string | null;
  capacity: number;
}

function formatDatePart(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTimePart(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function mapCalendarEvent(
  row: CalendarEventRow,
  currentUserId: string,
): CalendarEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    type: row.type,
    date: formatDatePart(row.starts_at),
    startTime: formatTimePart(row.starts_at),
    endTime: formatTimePart(row.ends_at),
    location: row.location,
    state: row.state_code || "Deutschland",
    region: row.region_name || "",
    capacity: row.capacity,
    confirmed: 0,
    description: row.description,
    createdBy: row.created_by,
    canManage: row.created_by === currentUserId,
  };
}

/**
 * Lädt alle durch RLS sichtbaren Termine und markiert eigene Termine.
 */
export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = claimsData?.claims.sub;

  if (!currentUserId) {
    return [];
  }

  const { data, error } = await supabase
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
      capacity
    `)
    .order("starts_at");

  if (error) {
    throw new Error(`Termine konnten nicht geladen werden: ${error.message}`);
  }

  return ((data || []) as CalendarEventRow[]).map((row) =>
    mapCalendarEvent(row, currentUserId),
  );
}

/**
 * Liefert Organisationen, in denen der aktuelle Nutzer direkt Mitglied ist.
 * Nur für diese Organisationen darf er neue Termine anlegen.
 */
export async function getEventOrganizationOptions(): Promise<
  EventOrganizationOption[]
> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = claimsData?.claims.sub;

  if (!currentUserId) {
    return [];
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, organizations!inner(id, name)")
    .eq("user_id", currentUserId);

  if (error) {
    throw new Error(
      `Organisationen für Termine konnten nicht geladen werden: ${error.message}`,
    );
  }

  const uniqueOrganizations = new Map<string, EventOrganizationOption>();

  for (const membership of data || []) {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;

    if (organization) {
      uniqueOrganizations.set(organization.id, {
        id: organization.id,
        name: organization.name,
      });
    }
  }

  return Array.from(uniqueOrganizations.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "de"),
  );
}
