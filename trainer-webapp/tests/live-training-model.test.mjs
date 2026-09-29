import assert from "node:assert/strict";
import test from "node:test";

import {
  activeMs,
  attemptLabel,
  clock,
  isReady,
  lineStats,
  mostBrokenAt,
  percent,
  toneOf,
} from "../src/domain/live-training.ts";

const line = {
  id: "ex-line",
  source_trick_id: "line1",
  content: { id: "line1", name: "Curb-Line", type: "line", trickIds: ["o", "k", "s"], trickNames: ["Ollie", "Kickturn 180", "Pop Shove-it"] },
};
const trick = { id: "ex-o", source_trick_id: "o", content: { id: "o", name: "Ollie" } };

function session(extra = {}) {
  return {
    started_at: "2026-09-29T14:12:00Z",
    completed_at: null,
    paused_at: null,
    paused_ms: 0,
    pause_count: 0,
    participants: [
      { id: "p1", present: true, athlete: { display_name: "Mia Hofer" } },
      { id: "p2", present: true, athlete: { display_name: "Jonas Beck" } },
    ],
    totals: [],
    breaks: [],
    recent: [],
    ...extra,
  };
}

test("Bereit-Regel: ≥ 80 % bei mindestens 5 Versuchen, Planstatus je Rolle", () => {
  assert.equal(isReady(5, 4, 0, true), true);
  assert.equal(isReady(4, 4, 0, true), false);
  assert.equal(isReady(6, 4, 0, true), false);
  assert.equal(isReady(5, 4, 2, true), true);
  assert.equal(isReady(5, 4, 3, true), false);
  assert.equal(isReady(5, 4, 1, false), true);
  assert.equal(isReady(5, 4, 2, false), false);
});

test("Quote und Farbstufen: keine Nullquote ohne Versuche", () => {
  assert.equal(percent(0, 0), null);
  assert.equal(percent(5, 6), 83);
  assert.deepEqual([toneOf(null), toneOf(80), toneOf(79), toneOf(50), toneOf(49)], ["none", "good", "mid", "mid", "low"]);
});

test("Aktive Zeit zieht abgeschlossene und laufende Pausen ab", () => {
  const start = Date.parse("2026-09-29T14:12:00Z");
  const s = session({ paused_ms: 10 * 60000, paused_at: "2026-09-29T14:40:00Z" });
  // 36 Min seit Start − 10 Min Pause − 8 Min laufende Pause = 18 Min.
  assert.equal(activeMs(s, start + 36 * 60000), 18 * 60000);
  const done = session({ completed_at: "2026-09-29T14:48:00Z", paused_ms: 6 * 60000 });
  assert.equal(activeMs(done, start + 99 * 60000), 30 * 60000);
  assert.equal(clock(65_000), "01:05");
  assert.equal(clock(3_725_000), "1:02:05");
});

test("Line: Bruchstellen je Trick entsprechen den Rohdaten", () => {
  // Rohdaten: Mia komplett, raus bei 3, raus bei 2, komplett, raus bei 3;
  // Jonas raus bei 1, raus bei 2, raus bei 1, ohne Angabe.
  const s = session({
    totals: [
      { participant_id: "p1", exercise_id: "ex-line", attempts: 5, landed: 2 },
      { participant_id: "p2", exercise_id: "ex-line", attempts: 4, landed: 0 },
    ],
    breaks: [
      { participant_id: "p1", exercise_id: "ex-line", broke_at: 2, attempts: 2 },
      { participant_id: "p1", exercise_id: "ex-line", broke_at: 1, attempts: 1 },
      { participant_id: "p2", exercise_id: "ex-line", broke_at: 0, attempts: 2 },
      { participant_id: "p2", exercise_id: "ex-line", broke_at: 1, attempts: 1 },
      { participant_id: "p2", exercise_id: "ex-line", broke_at: null, attempts: 1 },
    ],
  });
  const stats = lineStats(s, line, ["p1", "p2"]);
  // Ollie erreicht: 2 komplett + 2+1+2+1 gebrochen = 8 (ohne Angabe zählt nicht), gestanden 8 − 2 = 6.
  assert.deepEqual(stats.map((t) => [t.reached, t.landed, t.pct]), [[8, 6, 75], [6, 4, 67], [4, 2, 50]]);
  assert.deepEqual(stats.map((t) => t.weak), [false, false, true]);
  assert.equal(mostBrokenAt(s, line, "p1"), "meist raus bei Pop Shove-it");
  assert.equal(mostBrokenAt(s, line, "p2"), "meist raus bei Ollie");
});

test("Labels für Banner, Zeile und Rückgängig", () => {
  assert.equal(attemptLabel(trick, true, null, "Mia"), "Gestanden · Mia");
  assert.equal(attemptLabel(trick, false, null, null), "Nicht gestanden");
  assert.equal(attemptLabel(line, false, 1, "Jonas"), "Raus bei Kickturn 180 · Jonas");
  assert.equal(attemptLabel(line, false, null, null), "Line nicht komplett");
  assert.equal(attemptLabel(line, true, null, null), "Line komplett");
});

import { lineBreakText, skillSummaries, tricksThenLines } from "../src/features/plan-hub/plan-hub-model.ts";

test("Rückblick: Line mit 3 Tricks – Quote, Bruchstellen, Trickquote bleibt getrennt", () => {
  // Rohdaten: Ollie einzeln 4/5. Line: 2 komplett, 1× raus bei Kickturn (1),
  // 2× raus bei Pop Shove-it (2), 1× ohne Angabe → 6 Versuche.
  const recap = {
    completed_at: "2026-09-29T15:00:00Z",
    exercises: [
      { id: "e1", skill_id: "ollie", name: "Ollie", attempts: 5, landed: 4, kind: "trick" },
      {
        id: "e2", skill_id: "line1", name: "Curb-Line", attempts: 6, landed: 2, kind: "line",
        line_tricks: ["Ollie", "Kickturn 180", "Pop Shove-it"],
        breaks: [{ broke_at: 1, attempts: 1 }, { broke_at: 2, attempts: 2 }, { broke_at: null, attempts: 1 }],
      },
    ],
  };
  const skills = skillSummaries([recap]);
  const ollie = skills.find((s) => s.skillId === "ollie");
  const line = skills.find((s) => s.skillId === "line1");
  // Einzeltrick-Quote nur aus Einzelversuchen.
  assert.deepEqual([ollie.attempts, ollie.landed, ollie.quote], [5, 4, 80]);
  // In Lines: Ollie erreicht 2 + 1 + 2 = 5, gestanden 5 → 100 %.
  assert.equal(ollie.inLines, 100);
  // Line: 1 Versuch = 1 Versuch, Landung = komplette Line.
  assert.deepEqual([line.kind, line.attempts, line.landed, line.quote], ["line", 6, 2, 33]);
  assert.deepEqual(line.breaks, { 1: 1, 2: 2, [-1]: 1 });
  assert.equal(lineBreakText(line), "bricht meist bei Pop Shove-it");
  assert.equal(line.inLines, undefined);
});

test("Matrix: Lines stehen hinter den Einzeltricks", () => {
  const order = tricksThenLines([{ id: "a" }, { id: "l", type: "line" }, { id: "b" }]).map((t) => t.id);
  assert.deepEqual(order, ["a", "b", "l"]);
});
