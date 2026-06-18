import {
  getCalendarEvents,
  getEventOrganizationOptions,
} from "@/data/supabase-event-repository";
import { CalendarView } from "@/features/calendar/calendar-view";

export default async function CalendarPage() {
  const [events, organizationOptions] = await Promise.all([
    getCalendarEvents(),
    getEventOrganizationOptions(),
  ]);

  return (
    <CalendarView
      initialEvents={events}
      organizationOptions={organizationOptions}
    />
  );
}
