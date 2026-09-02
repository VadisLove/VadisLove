import {
  getCalendarEvents,
  getEventOrganizationOptions,
} from "@/data/supabase-event-repository";
import { CalendarView } from "@/features/calendar/calendar-view";

interface CalendarPageProps {
  searchParams: Promise<{
    event?: string | string[];
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
  const [events, organizationOptions] = await Promise.all([
    getCalendarEvents(),
    getEventOrganizationOptions(),
  ]);

  return (
    <CalendarView
      initialEvents={events}
      organizationOptions={organizationOptions}
      initialSelectedEventId={selectedEventId}
      initialCreateDialogRequest={createDialogRequest}
    />
  );
}
