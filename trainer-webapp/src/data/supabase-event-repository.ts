import type {
  AttendanceStatus,
  CalendarEvent,
  EventOrganizationOption,
  EventParticipantSummary,
  EventType,
} from "@/domain/models";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
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
  event_participants?: Array<{
    status: AttendanceStatus;
    user_id: string | null;
    invited_email: string;
    profiles?:
      | {
      display_name: string | null;
      account_type: string | null;
        }
      | Array<{
          display_name: string | null;
          account_type: string | null;
        }>
      | null;
  }>;
}

const allEventTypes: EventType[] = [
  "training",
  "contest",
  "medical",
  "meeting",
];

const dashboardEventLimit = 5;
const calendarEventSelect = `
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
    profiles:user_id(display_name, account_type)
  )
`;

/**
 * Sortiert Termine nach ihrer tatsächlichen zeitlichen Nähe zum aktuellen
 * Zeitpunkt. So verdrängt ein alter, mehrtägiger Termin keinen Termin, der
 * gerade erst begonnen hat oder als Nächstes startet.
 */
export function sortCalendarEventRowsByRelevance(
  rows: CalendarEventRow[],
  referenceTime: Date,
) {
  const referenceTimestamp = referenceTime.getTime();

  return [...rows].sort((left, right) => {
    const leftStart = new Date(left.starts_at).getTime();
    const rightStart = new Date(right.starts_at).getTime();
    const distanceDifference = Math.abs(leftStart - referenceTimestamp)
      - Math.abs(rightStart - referenceTimestamp);

    if (distanceDifference !== 0) {
      return distanceDifference;
    }

    // Bei gleichem Abstand ist der noch kommende Termin eindeutiger als ein
    // bereits laufender Termin. Danach entscheidet der frühere Start.
    const leftIsUpcoming = leftStart >= referenceTimestamp;
    const rightIsUpcoming = rightStart >= referenceTimestamp;
    if (leftIsUpcoming !== rightIsUpcoming) {
      return leftIsUpcoming ? -1 : 1;
    }

    return leftStart - rightStart;
  });
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
  currentUserEmail = "",
): CalendarEvent {
  const attendanceSummary = {
    confirmed: 0,
    open: 0,
    declined: 0,
  };

  for (const participant of row.event_participants || []) {
    attendanceSummary[participant.status] += 1;
  }
  const ownAttendance = (row.event_participants || []).find(
    (participant) =>
      participant.user_id === currentUserId ||
      participant.invited_email.toLowerCase() === currentUserEmail.toLowerCase(),
  );
  const participants: EventParticipantSummary[] = (row.event_participants || [])
    .map((participant) => {
      const profile = Array.isArray(participant.profiles)
        ? participant.profiles[0]
        : participant.profiles;

      return {
        id: participant.user_id || participant.invited_email,
        name:
          profile?.display_name?.trim() ||
          participant.invited_email,
        // Die bereits autorisierte Teilnehmerzeile ist die kanonische Quelle
        // fuer die Event-E-Mail; profiles.email bleibt direkt unlesbar.
        email: participant.invited_email,
        accountType: profile?.account_type || "unspecified",
        status: participant.status,
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        const order: Record<AttendanceStatus, number> = {
          confirmed: 0,
          open: 1,
          declined: 2,
        };
        return order[left.status] - order[right.status];
      }

      return left.name.localeCompare(right.name, "de");
    });

  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    type: row.type,
    date: formatDatePart(row.starts_at),
    endDate: formatDatePart(row.ends_at),
    startTime: formatTimePart(row.starts_at),
    endTime: formatTimePart(row.ends_at),
    location: row.location,
    state: row.state_code || "Deutschland",
    region: row.region_name || "",
    capacity: row.capacity,
    confirmed: attendanceSummary.confirmed,
    attendanceSummary,
    attendanceStatus: ownAttendance?.status,
    participants,
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
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) {
    return [];
  }

  const { data: currentUserEmail } = await supabase.rpc(
    "get_current_profile_email",
  );

  const { data, error } = await supabase
    .from("events")
    .select(calendarEventSelect)
    .order("starts_at");

  if (error) {
    throw new Error(`Termine konnten nicht geladen werden: ${error.message}`);
  }

  return ((data || []) as unknown as CalendarEventRow[]).map((row) =>
    mapCalendarEvent(row, currentUserId, currentUserEmail || ""),
  );
}

/**
 * Lädt die nächsten sichtbaren Termine für das Dashboard.
 *
 * Kommende und bereits laufende Termine werden getrennt geladen, damit alte
 * Langzeit-Termine nicht das Datenbank-Limit belegen. Anschließend entscheidet
 * die zeitliche Nähe des Starts, welcher Termin in der Hauptanzeige steht.
 */
export async function getUpcomingCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) {
    return [];
  }

  const { data: currentUserEmail } = await supabase.rpc(
    "get_current_profile_email",
  );

  const referenceTime = new Date();
  const referenceIso = referenceTime.toISOString();
  const [upcomingResult, ongoingResult] = await Promise.all([
    supabase
      .from("events")
      .select(calendarEventSelect)
      .gte("starts_at", referenceIso)
      .order("starts_at")
      .limit(dashboardEventLimit),
    supabase
      .from("events")
      .select(calendarEventSelect)
      .lt("starts_at", referenceIso)
      .gte("ends_at", referenceIso)
      .order("starts_at", { ascending: false })
      .limit(dashboardEventLimit),
  ]);

  if (upcomingResult.error || ongoingResult.error) {
    const error = upcomingResult.error || ongoingResult.error;
    throw new Error(
      `Kommende Termine konnten nicht geladen werden: ${error?.message}`,
    );
  }

  const relevantRows = sortCalendarEventRowsByRelevance(
    [
      ...((upcomingResult.data || []) as unknown as CalendarEventRow[]),
      ...((ongoingResult.data || []) as unknown as CalendarEventRow[]),
    ],
    referenceTime,
  ).slice(0, dashboardEventLimit);

  return relevantRows.map((row) =>
    mapCalendarEvent(row, currentUserId, currentUserEmail || ""),
  );
}

/**
 * Liefert Organisationen und Terminarten, die der aktuelle Nutzer aufgrund
 * seiner echten Mitgliedschaftsrollen anlegen darf.
 */
export async function getEventOrganizationOptions(): Promise<
  EventOrganizationOption[]
> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) {
    return [];
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organizations!inner(id, name)")
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
    // Jede bestätigte Mitgliedschaft schaltet alle Terminarten frei. Die
    // konkrete Rolle bleibt für andere Organisationsrechte unverändert.
    const allowedEventTypes = allEventTypes;

    if (organization && allowedEventTypes.length > 0) {
      const existingOption = uniqueOrganizations.get(organization.id);
      const mergedEventTypes = new Set([
        ...(existingOption?.allowedEventTypes || []),
        ...allowedEventTypes,
      ]);

      uniqueOrganizations.set(organization.id, {
        id: organization.id,
        name: organization.name,
        allowedEventTypes: allEventTypes.filter((type) =>
          mergedEventTypes.has(type),
        ),
      });
    }
  }

  return Array.from(uniqueOrganizations.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "de"),
  );
}
