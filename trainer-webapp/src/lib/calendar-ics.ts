import type { AttendanceStatus, EventInformationLink } from "@/domain/models";

export interface CalendarFeedEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: "scheduled" | "cancelled";
  revision: number;
  attendanceStatus?: AttendanceStatus;
  isCreator: boolean;
  informationLinks: EventInformationLink[];
}

const berlinDateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatBerlinDateTime(value: string) {
  const parts = Object.fromEntries(
    berlinDateTime.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Faltet Zeilen unterhalb der RFC-5545-Grenze, ohne Unicode-Zeichen zu teilen. */
function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let current = "";
  for (const character of line) {
    if (new TextEncoder().encode(current + character).length > 73) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

/** Erzeugt einen stabilen, abonnierbaren RFC-5545-Kalender in Berliner Ortszeit. */
export function createPersonalCalendarIcs(events: CalendarFeedEvent[], generatedAt = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trainer Hub//Verbindliche Kalenderkommunikation//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Trainer Hub",
    "X-WR-TIMEZONE:Europe/Berlin",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  const stamp = generatedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  for (const event of events) {
    const linkText = event.informationLinks
      .map((link) => `${link.label}: ${link.url}`)
      .join("\n");
    const description = [event.description, linkText].filter(Boolean).join("\n\n");
    const status = event.status === "cancelled"
      ? "CANCELLED"
      : event.isCreator || event.attendanceStatus === "confirmed"
        ? "CONFIRMED"
        : "TENTATIVE";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@trainer-webapp-ruby.vercel.app`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${event.revision}`,
      `DTSTART;TZID=Europe/Berlin:${formatBerlinDateTime(event.startsAt)}`,
      `DTEND;TZID=Europe/Berlin:${formatBerlinDateTime(event.endsAt)}`,
      `STATUS:${status}`,
      `SUMMARY:${escapeIcsText(event.status === "cancelled" ? `[Abgesagt] ${event.title}` : event.title)}`,
      `LOCATION:${escapeIcsText(event.location)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      ...(event.informationLinks[0] ? [`URL:${event.informationLinks[0].url}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
