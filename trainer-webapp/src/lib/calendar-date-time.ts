const calendarTimeZone = "Europe/Berlin";

const berlinDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: calendarTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getBerlinDateTimeParts(date: Date): LocalDateTimeParts {
  const parts = Object.fromEntries(
    berlinDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function getBerlinOffsetMilliseconds(date: Date) {
  const parts = getBerlinDateTimeParts(date);
  const berlinWallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return berlinWallClockAsUtc - date.getTime();
}

/**
 * Wandelt eine im Kalender eingegebene Berliner Ortszeit zuverlässig in UTC um.
 *
 * Der Server kann in einer anderen Zeitzone laufen. Daher darf eine Eingabe wie
 * `17:30` nicht mit dem lokalen `Date`-Konstruktor des Servers interpretiert
 * werden. Die iterative Offset-Berechnung berücksichtigt außerdem Sommer- und
 * Winterzeit; nicht existierende Uhrzeiten während der Zeitumstellung werden
 * als ungültig abgelehnt.
 */
export function parseBerlinCalendarDateTime(
  isoDate: string,
  time: string,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const expected: LocalDateTimeParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };
  const wallClockAsUtc = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
    expected.second,
  );

  if (
    expected.month < 1 ||
    expected.month > 12 ||
    expected.day < 1 ||
    expected.day > 31 ||
    expected.hour > 23 ||
    expected.minute > 59
  ) {
    return null;
  }

  let utcTimestamp = wallClockAsUtc;

  // Rund um den DST-Wechsel kann sich der Offset durch die erste Korrektur
  // ändern. Zwei weitere Durchläufe stabilisieren den tatsächlichen Zeitpunkt.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const nextTimestamp =
      wallClockAsUtc - getBerlinOffsetMilliseconds(new Date(utcTimestamp));

    if (nextTimestamp === utcTimestamp) {
      break;
    }

    utcTimestamp = nextTimestamp;
  }

  const result = new Date(utcTimestamp);
  const actual = getBerlinDateTimeParts(result);

  return Object.keys(expected).every(
    (key) =>
      actual[key as keyof LocalDateTimeParts] ===
      expected[key as keyof LocalDateTimeParts],
  )
    ? result
    : null;
}

/**
 * Öffnet den Kalender nur dann auf einem Terminmonat, wenn dieser Termin über
 * einen direkten Link gewählt wurde. Beim normalen Aufruf bleibt der aktuelle
 * Monat maßgeblich, unabhängig vom ältesten geladenen Termin.
 */
export function getInitialCalendarCursor(
  explicitlySelectedEventDate: string | undefined,
  now = new Date(),
) {
  return explicitlySelectedEventDate
    ? new Date(`${explicitlySelectedEventDate}T12:00:00`)
    : now;
}
