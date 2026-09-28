import assert from "node:assert/strict";
import test from "node:test";

import {
  athleteTrickGoals,
  evaluationDate,
  exercisesForSkill,
  pendingTrickConfirmations,
  formatAverage,
  previousEvaluation,
  ratingDelta,
  summarizeCategory,
} from "../src/features/evaluations/evaluation-model.ts";

function evaluation(id, periodStart, periodEnd, ratings, extra = {}) {
  return {
    id, trainerId: "t1", athleteId: "a1", periodStart, periodEnd, title: "", conversationOn: "", squad: "",
    dalidStatus: "", personalNotes: "", measures: "", contestOverrides: [],
    skillRatings: Object.entries(ratings).map(([skillKey, rating]) => ({ skillKey, rating, note: "" })),
    ...extra,
  };
}

const skills = [
  { key: "trick", label: "Trick-Repertoire", category: "skateboarding", visible: true, sortOrder: 10, custom: false },
  { key: "flow", label: "Flow", category: "skateboarding", visible: true, sortOrder: 20, custom: false },
  { key: "hidden", label: "Ausgeblendet", category: "skateboarding", visible: false, sortOrder: 30, custom: false },
  { key: "mut", label: "Mut", category: "mental", visible: true, sortOrder: 10, custom: false },
];

test("previousEvaluation nimmt die jüngste frühere Auswertung und nie die aktuelle", () => {
  const list = [
    evaluation("current", "2026-01-01", "2026-09-28", { trick: 4 }),
    evaluation("older", "2025-07-01", "2025-12-31", { trick: 2 }),
    evaluation("prev", "2026-01-01", "2026-06-12", { trick: 3 }, { conversationOn: "2026-06-14" }),
    evaluation("future", "2026-10-01", "2026-12-31", { trick: 5 }),
    evaluation("empty", "2026-01-01", "2026-07-01", {}),
    { ...evaluation("other", "2026-01-01", "2026-08-01", { trick: 1 }), athleteId: "a2" },
  ];
  const previous = previousEvaluation(list, "a1", "2026-01-01", "2026-09-28");
  assert.equal(previous?.id, "prev");
  assert.equal(evaluationDate(previous), "2026-06-14");
  assert.equal(previousEvaluation(list, "a1", "2025-07-01", "2025-12-31"), undefined);
});

test("ratingDelta liefert die Pillen laut Handoff", () => {
  assert.deepEqual(ratingDelta(undefined, 3), { tone: "open", label: "offen" });
  assert.deepEqual(ratingDelta(4, undefined), { tone: "new", label: "neu" });
  assert.deepEqual(ratingDelta(4, 2), { tone: "up", label: "↑ 2" });
  assert.deepEqual(ratingDelta(2, 3), { tone: "down", label: "↓ 1" });
  assert.deepEqual(ratingDelta(3, 3), { tone: "same", label: "=" });
});

test("summarizeCategory vergleicht nur bewertete Kriterien mit ihren Vorwerten", () => {
  const ratings = {
    trick: { skillKey: "trick", rating: 4, note: "" },
    flow: { skillKey: "flow", rating: 0, note: "Notiz ohne Wert" },
  };
  const summary = summarizeCategory("skateboarding", skills, ratings, { trick: 3, flow: 1 });
  assert.equal(summary.total, 2);
  assert.equal(summary.rated, 1);
  assert.equal(summary.average, 4);
  assert.equal(summary.previousAverage, 2);
  assert.equal(summary.comparableAverage, 3);
  assert.deepEqual(summary.delta, { tone: "up", label: "↑ 1,0" });

  const empty = summarizeCategory("mental", skills, {}, {});
  assert.equal(formatAverage(empty.average), "–");
  assert.equal(empty.delta, null);
});

test("athleteTrickGoals übernimmt Übungen und Status aus den geteilten Plänen", () => {
  const plan = {
    id: "shared-s1", title: "Street Basics", category: "Street", version: "1", author: "Coach", ownerLevel: "club",
    sharedWith: [], updatedAt: "", description: "", status: "active", visibility: "private", isTemplate: false,
    assignedGroups: [], assignedAthletes: ["a1"], sharedTrainers: [],
    goals: [{ id: "g1", title: "Zwei Runs", cadence: "weekly", completed: true }],
    tricks: [
      { id: "t1", name: "Kickflip", group: "Flip", level: 1, athleteId: "a1", status: "awaiting_confirmation" },
      { id: "t2", name: "Ollie", group: "Basics", level: 1, athleteId: "a1", status: "confirmed" },
      { id: "t3", name: "Fremd", group: "Basics", level: 1, athleteId: "a2", status: "confirmed" },
      { id: "t4", name: "Boardslide", group: "Slides", level: 2, athleteId: "", status: "in_progress" },
    ],
  };
  const goals = athleteTrickGoals([plan], "a1");
  assert.deepEqual(goals.map((goal) => [goal.title, goal.state, goal.done]), [
    ["Kickflip", "waiting", false],
    ["Ollie", "done", true],
    ["Boardslide", "practicing", false],
    ["Zwei Runs", "done", true],
  ]);
  assert.equal(goals[0].planId, "shared-s1");
  assert.equal(goals[0].trickId, "t1");
  assert.deepEqual(athleteTrickGoals([plan], "a3"), []);
});

test("exercisesForSkill ordnet Übungen per Stichwort den Skate-Kriterien zu", () => {
  const goal = (title, kind = "trick") => ({ id: title, title, kind, state: "open", done: false, planId: "shared-s1", planTitle: "Plan" });
  const goals = [goal("Kickflip"), goal("Switch Heelflip"), goal("Boardslide"), goal("Frontside 180"), goal("Fakie Ollie"), goal("Contest-Run ohne Abbruch"), goal("Zwei Runs", "goal")];
  const titles = (key) => exercisesForSkill(key, goals).map((entry) => entry.title);
  assert.deepEqual(titles("flip-variations"), ["Kickflip", "Switch Heelflip"]);
  assert.deepEqual(titles("obstacles"), ["Boardslide"]);
  assert.deepEqual(titles("rotation-variations"), ["Frontside 180"]);
  assert.deepEqual(titles("stance-options"), ["Switch Heelflip", "Fakie Ollie"]);
  assert.deepEqual(titles("flow-lines"), ["Contest-Run ohne Abbruch"]);
  assert.equal(titles("trick-repertoire").length, 6);
  assert.deepEqual(titles("fitness"), []);
});

test("pendingTrickConfirmations sammelt gemeldete Tricks aus versendeten Plänen", () => {
  const plan = (id, direction, tricks) => ({ id, title: `Plan ${id}`, shareDirection: direction, recipientUserId: "a2", tricks });
  const trick = (id, name, status, athleteId = "a1") => ({ id, name, status, athleteId });
  const queue = pendingTrickConfirmations([
    plan("shared-1", "sent", [trick("t1", "Kickflip", "awaiting_confirmation"), trick("t2", "Ollie", "confirmed")]),
    plan("shared-2", "sent", [trick("t3", "Boardslide", "awaiting_confirmation", "")]),
    plan("shared-3", "received", [trick("t4", "Heelflip", "awaiting_confirmation")]),
  ], new Map([["a1", "Zoe"], ["a2", "Ben"]]));
  assert.deepEqual(queue.map((item) => [item.athleteName, item.trickName, item.planId, item.trickId]), [
    ["Ben", "Boardslide", "shared-2", "t3"],
    ["Zoe", "Kickflip", "shared-1", "t1"],
  ]);
});
