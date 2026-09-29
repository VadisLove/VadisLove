import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHubPlans,
  currentTrickIndex,
  daysUntil,
  formatDay,
  hubRoleOf,
  myAssignment,
  nextReportable,
  nextStepFor,
  parseHubContext,
  permissionSections,
  personaOf,
  planBadges,
  planPercent,
  skillSummaries,
  trickAggregate,
  words,
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

test("Vorstand wird als eigene Persona erkannt, teilt aber die Staff-Rechte", () => {
  assert.equal(personaOf("organization_staff"), "board");
  assert.equal(personaOf("trainer", true), "board");
  assert.equal(personaOf("trainer"), "trainer");
  assert.equal(hubRoleOf("organization_staff"), "staff");
  assert.equal(hubRoleOf("trainer"), "staff");
  assert.equal(hubRoleOf("athlete"), "athlete");
  assert.equal(hubRoleOf("guardian"), "viewer");
});

test("Wort-Tabelle: eigene Anrede für Rollentexte, Anrede der Trainer*in für Texte über sie", () => {
  const w = words("w", "m");
  assert.equal(w.sk, "Skaterin");
  assert.equal(w.rank, "Starterin");
  assert.equal(w.dat, "deinem Trainer");
  assert.equal(words(null).nom, "dein*e Trainer*in");
  assert.equal(words("m").acc, "deinen Trainer");
});

test("Kontext wird defensiv gelesen; unbekannte Anrede bleibt offen", () => {
  const context = parseHubContext({
    is_board: true,
    can_create_plans: true,
    salutation: "x",
    trainer_salutation: "w",
    athletes: [{ id: "a1", name: "Mia Kaiser", can_create_plans: true }, { id: "a2", name: "Leon Berger" }],
    groups: [{ id: "g1", name: "U14 Augsburg", athlete_ids: ["a1"] }],
    templates: [{ id: "p9", title: "Ramp", content: { tricks: [] } }, { id: "bad" }],
  });
  assert.equal(context.isBoard, true);
  assert.equal(context.salutation, null);
  assert.equal(context.trainerSalutation, "w");
  assert.equal(context.templates.length, 1);
  assert.deepEqual(
    permissionSections(context).map((section) => [section.label, section.athletes.map((athlete) => athlete.id)]),
    [["U14 Augsburg", ["a1"]], ["Ohne Gruppe", ["a2"]]],
  );
  assert.equal(parseHubContext(null).canCreatePlans, false);
});

test("Eigener, mit dem Trainer geteilter Plan trägt den eigenen Fortschritt", () => {
  const own = { id: "p5", title: "Curb-Plan", versions: [{ id: "v5", version_number: 1, content: snapshot("p5", [0, 0]), created_at: "2026-09-01T10:00:00Z" }] };
  const selfShare = snapshot("shared-5", [1, 0], { sourcePlanId: "p5", shareDirection: "received", sharedById: "a1", recipientUserId: "a1", sharedWithTrainers: true });
  const plans = buildHubPlans({ savedPlans: [own], shares: [selfShare], userId: "a1", names });
  assert.equal(plans.length, 1); // keine doppelte „erhaltene“ Karte
  assert.equal(plans[0].sharedWithTrainer, true);
  assert.equal(myAssignment(plans[0]).shareId, "shared-5");
  assert.equal(nextReportable(plans).trick.id, "t0");
  assert.equal(currentTrickIndex(plans[0], "athlete"), 0);
});

test("Trainer-Sicht: Pläne von Athlet*innen und Vereinsvorlagen mit Badges", () => {
  const coached = snapshot("shared-7", [2, 3], {
    sourcePlanId: "p7", shareDirection: "coached", sharedById: "a1", recipientUserId: "a1", sharedWithTrainers: true, title: "Jonas’ Curb-Plan",
  });
  const context = parseHubContext({
    club_template_ids: ["p1"],
    templates: [{ id: "p8", title: "Ramp Einstieg", organization_name: "SKSB", own: false, content: snapshot("p8", [0, 0]) }],
  });
  const plans = buildHubPlans({ savedPlans: [saved], shares: [coached], userId: "t1", names, context });
  const byKind = Object.fromEntries(plans.map((plan) => [plan.kind, plan]));
  assert.equal(byKind.athlete.createdByAthlete, "Mia Kaiser");
  assert.equal(byKind.athlete.startId, null);
  assert.deepEqual(planBadges(byKind.athlete, "staff").map((badge) => badge.label), ["1 offen", "Athlet"]);
  // Eigene Vereinsvorlage ohne Zuweisung ist kein Entwurf.
  assert.deepEqual(planBadges(byKind.own, "staff").map((badge) => badge.label), ["Vorlage"]);
  assert.equal(byKind.template.templateContent.tricks.length, 2);
  assert.deepEqual(planBadges(byKind.template, "staff").map((badge) => badge.label), ["Vorlage"]);
  // Athlet*innen sehen kein „Athlet“-Badge.
  assert.deepEqual(planBadges(byKind.athlete, "athlete").map((badge) => badge.label), []);
});
