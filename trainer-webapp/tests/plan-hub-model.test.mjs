import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHubPlans,
  currentTrickIndex,
  daysUntil,
  formatDay,
  nextStepFor,
  planPercent,
  skillSummaries,
  trickAggregate,
} from "../src/features/plan-hub/plan-hub-model.ts";

const statuses = ["not_started", "in_progress", "awaiting_confirmation", "confirmed"];

function snapshot(id, steps, extra = {}) {
  return {
    id, title: "Street Basics", category: "Street", version: "1", author: "Coach", ownerLevel: "club",
    sharedWith: [], updatedAt: "", description: "", status: "active", visibility: "private", isTemplate: false,
    assignedGroups: [], assignedAthletes: [], sharedTrainers: [], goals: [],
    tricks: steps.map((step, i) => ({ id: `t${i}`, name: `Trick ${i}`, group: "Street", level: 1, sortOrder: i, athleteId: "", status: statuses[step] })),
    ...extra,
  };
}

const saved = { id: "p1", title: "Street Basics", versions: [{ id: "v1", version_number: 2, content: snapshot("p1", [0, 0, 0]), created_at: "2026-09-01T10:00:00Z" }] };
const names = new Map([["a1", "Mia Kaiser"], ["a2", "Leon Berger"]]);

test("versendete Freigaben werden pro Ursprungsplan zu einer Matrix gebündelt", () => {
  const shares = [
    snapshot("shared-1", [3, 2, 0], { sourcePlanId: "p1", shareDirection: "sent", recipientUserId: "a1", sharedAt: "2026-09-02" }),
    snapshot("shared-2", [3, 1, 0], { sourcePlanId: "p1", shareDirection: "sent", recipientUserId: "a2", sharedAt: "2026-09-02" }),
  ];
  const [plan] = buildHubPlans({ savedPlans: [saved], shares, userId: "t1", names });
  assert.equal(plan.kind, "own");
  assert.equal(plan.version, 2);
  assert.equal(plan.assignments.length, 2);
  assert.equal(planPercent(plan), 33); // 2 von 6 Zellen bestätigt
  assert.deepEqual(trickAggregate(plan, "t0"), { confirmed: 2, waiting: 0, practiced: 0, total: 2, step: 3 });
  assert.equal(trickAggregate(plan, "t1").step, 2);
  assert.equal(currentTrickIndex(plan, "staff"), 1); // erster Trick mit offener Meldung
});

test("Athlet*innen: nächster Schritt ist der erste noch nicht gemeldete Trick", () => {
  const shares = [snapshot("shared-9", [3, 2, 1], { shareDirection: "received", sharedById: "t1" })];
  const plans = buildHubPlans({ savedPlans: [], shares, userId: "a1", names: new Map([["t1", "Vladislav H."]]) });
  assert.equal(plans[0].author, "Vladislav H.");
  const next = nextStepFor(plans);
  assert.equal(next.trick.id, "t2");
  assert.equal(next.step, 1);
  assert.equal(currentTrickIndex(plans[0], "athlete"), 2);
});

test("Skill-Quoten werden aus Summen berechnet, Trend = letzte minus erste Session", () => {
  const recap = (at, landed, attempts) => ({ completed_at: at, exercises: [{ skill_id: "k", name: "Kickflip", attempts, landed, elapsed_ms: 0 }] });
  const [skill] = skillSummaries([recap("2026-09-02", 1, 1), recap("2026-09-01", 1, 9)]);
  assert.equal(skill.quote, 20); // 2 / 10, nicht Mittel aus 11 % und 100 %
  assert.deepEqual(skill.series, [11, 100]);
  assert.equal(skill.trend, 89);
});

test("Datum und Frist im deutschen Format", () => {
  assert.equal(formatDay("2026-09-24T12:00:00Z"), "Do. 24.09.");
  const now = new Date(2026, 8, 25, 20, 0).getTime();
  assert.equal(daysUntil("2026-09-28", now), 3);
  assert.equal(daysUntil("2026-09-25", now), 0);
});
