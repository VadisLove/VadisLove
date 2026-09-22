import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEventInformationLinks } from "../src/domain/calendar-communication.ts";
import { createPersonalCalendarIcs } from "../src/lib/calendar-ics.ts";
import { deliverCalendarMail } from "../src/lib/calendar-mail-delivery.ts";

test("Informationslinks erlauben nur sichere HTTP- und HTTPS-Ziele", () => {
  assert.equal(normalizeEventInformationLinks([{ label: "X", url: "javascript:alert(1)" }]), null);
  assert.equal(normalizeEventInformationLinks([{ label: "X", url: "data:text/html,test" }]), null);
  assert.equal(normalizeEventInformationLinks([{ label: "X", url: "https://user:secret@example.org" }]), null);
  assert.deepEqual(normalizeEventInformationLinks([{ label: "Ausschreibung", url: "https://example.org/info" }]), [{
    label: "Ausschreibung",
    url: "https://example.org/info",
    sortOrder: 0,
  }]);
});

test("ICS behält UID, Berliner Zeit und Absagestatus über Revisionen stabil", () => {
  const base = {
    id: "20000000-0000-0000-0000-000000000001",
    title: "Sommer-Training",
    description: "Bitte Helm mitbringen",
    startsAt: "2026-07-01T16:00:00.000Z",
    endsAt: "2026-07-01T18:00:00.000Z",
    location: "Berlin",
    status: "scheduled",
    revision: 1,
    attendanceStatus: "open",
    isCreator: false,
    informationLinks: [{ label: "Plan", url: "https://example.org/plan", sortOrder: 0 }],
  };
  const first = createPersonalCalendarIcs([base], new Date("2026-01-01T00:00:00Z"));
  const cancelled = createPersonalCalendarIcs([{ ...base, status: "cancelled", revision: 2 }], new Date("2026-01-02T00:00:00Z"));
  assert.match(first, /UID:20000000-0000-0000-0000-000000000001@trainer-webapp-ruby\.vercel\.app/);
  assert.match(first, /DTSTART;TZID=Europe\/Berlin:20260701T180000/);
  assert.match(first, /STATUS:TENTATIVE/);
  assert.match(cancelled, /STATUS:CANCELLED/);
  assert.match(cancelled, /SEQUENCE:2/);
  assert.match(cancelled, /\[Abgesagt\] Sommer-Training/);
});

test("ICS bildet auch die Winterzeit korrekt in Europe/Berlin ab", () => {
  const ics = createPersonalCalendarIcs([{
    id: "20000000-0000-0000-0000-000000000002", title: "Winter", description: "",
    startsAt: "2026-12-01T17:00:00.000Z", endsAt: "2026-12-01T18:00:00.000Z",
    location: "Berlin", status: "scheduled", revision: 0, attendanceStatus: "confirmed",
    isCreator: false, informationLinks: [],
  }]);
  assert.match(ics, /DTSTART;TZID=Europe\/Berlin:20261201T180000/);
  assert.match(ics, /STATUS:CONFIRMED/);
});

test("Kalendermails verwenden bei Retry denselben fachlichen Idempotenzschlüssel", async () => {
  const job = { id: "job-1", email: "test@example.invalid", subject: "Test", body: "Text", link: "/kalender?event=20000000-0000-0000-0000-000000000001", lease_id: "lease" };
  const keys = [];
  await deliverCalendarMail([job], async (_, key) => { keys.push(key); throw new Error("timeout"); }, async () => {});
  await deliverCalendarMail([job], async (_, key) => { keys.push(key); return true; }, async () => {});
  assert.deepEqual(keys, ["calendar-job-1", "calendar-job-1"]);
});
