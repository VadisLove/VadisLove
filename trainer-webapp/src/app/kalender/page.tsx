import { getOwnFamilyNotice } from "@/data/family-repository";
import {
  getCalendarEvents,
  getEventOrganizationOptions,
} from "@/data/supabase-event-repository";
import { CalendarView } from "@/features/calendar/calendar-view";

interface CalendarPageProps {
  searchParams: Promise<{
    event?: string | string[];
    focus?: string | string[];
    neu?: string | string[];
  }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const selectedEventId = typeof params.event === "string"
    ? params.event
    : undefined;
  const createDialogRequest = typeof params.neu === "string"
    ? params.neu
    : undefined;
  const initialDetailFocus = params.focus === "attendance";
  const [events, organizationOptions, guardianNotice] = await Promise.all([
    getCalendarEvents(),
    getEventOrganizationOptions(),
    getOwnFamilyNotice(),
  ]);

  return (
    <CalendarView
      initialEvents={events}
      guardianNotice={guardianNotice}
      organizationOptions={organizationOptions}
      initialSelectedEventId={selectedEventId}
      initialCreateDialogRequest={createDialogRequest}
      initialDetailFocus={initialDetailFocus}
    />
  );
}
