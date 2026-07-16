import assert from "node:assert/strict";
import test from "node:test";

import {
  getInitialCalendarCursor,
  parseBerlinCalendarDateTime,
} from "../src/lib/calendar-date-time.ts";

test("wandelt Berliner Sommerzeit in UTC um", () => {
  const date = parseBerlinCalendarDateTime("2026-07-16", "17:30");

  assert.equal(date?.toISOString(), "2026-07-16T15:30:00.000Z");
});

test("wandelt Berliner Winterzeit in UTC um", () => {
  const date = parseBerlinCalendarDateTime("2026-12-16", "17:30");

  assert.equal(date?.toISOString(), "2026-12-16T16:30:00.000Z");
});

test("lehnt eine nicht existierende Uhrzeit beim DST-Wechsel ab", () => {
  const date = parseBerlinCalendarDateTime("2026-03-29", "02:30");

  assert.equal(date, null);
});

test("öffnet den normalen Kalender im aktuellen Monat", () => {
  const now = new Date("2026-07-16T10:00:00.000Z");

  assert.equal(getInitialCalendarCursor(undefined, now), now);
});

test("öffnet einen direkt verlinkten Termin in dessen Monat", () => {
  const cursor = getInitialCalendarCursor(
    "2026-06-18",
    new Date("2026-07-16T10:00:00.000Z"),
  );

  assert.equal(cursor.getFullYear(), 2026);
  assert.equal(cursor.getMonth(), 5);
  assert.equal(cursor.getDate(), 18);
});
