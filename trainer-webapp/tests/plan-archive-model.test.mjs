import assert from "node:assert/strict";
import test from "node:test";

import { archiveLabel, buildHubPlans, daysLeft, parseLibrary } from "../src/features/plan-hub/plan-hub-model.ts";

// Archiv & Papierkorb im Planmodell: Einteilung in Aktiv, Entwürfe und Archiv.
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
const savedPlan = (id) => ({ id, title: id, versions: [{ id: `v-${id}`, version_number: 1, content: snapshot(id, [0, 0]), created_at: "2026-09-01T10:00:00Z" }] });
const names = new Map([["a1", "Mia Kaiser"]]);
const entry = (key, extra = {}) => ({
  key, owner_id: "t1", owner_name: "Tina Trainer", own: true, title: key, legacy: false,
  archived_at: null, archived_reason: null, deleted_at: null, purge_at: null, athletes: [], ...extra,
});

test("Bibliothek wird defensiv gelesen; ohne Antwort gibt es keinen Archivstatus", () => {
  assert.equal(parseLibrary(null), null);
  const [plan, legacy] = parseLibrary({
    plans: [entry("p1", { archived_at: "2026-09-12T10:00:00Z", archived_reason: "completed",
      athletes: [{ id: "a1", name: "Mia Kaiser", share_id: "s1", archived: true, history: true }] })],
    legacy: [entry("lokal-1", { legacy: true, archived_reason: "unbekannt" })],
  });
  assert.equal(plan.archivedReason, "completed");
  assert.deepEqual(plan.athletes[0], { id: "a1", name: "Mia Kaiser", shareId: "s1", archived: true, history: true });
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.archivedReason, null);
});

test("Trainer-Sicht: aktiv, Entwurf, archiviert und Papierkorb", () => {
  const library = parseLibrary({
    plans: [
      entry("aktiv"),
      entry("entwurf"),
      entry("archiv", { archived_at: "2026-09-12T10:00:00Z", archived_reason: "manual" }),
      entry("papierkorb", { deleted_at: "2026-09-20T10:00:00Z", purge_at: "2026-10-20T10:00:00Z" }),
    ],
    legacy: [],
  });
  const shares = [
    snapshot("shared-1", [1, 0], { sourcePlanId: "aktiv", shareDirection: "sent", recipientUserId: "a1" }),
    // Erledigte Kopie zählt nicht als aktive Zuweisung → Entwurf.
    snapshot("shared-2", [3, 3], { sourcePlanId: "entwurf", shareDirection: "sent", recipientUserId: "a1", shareArchivedAt: "2026-09-10" }),
  ];
  const plans = buildHubPlans({
    savedPlans: ["aktiv", "entwurf", "archiv", "papierkorb"].map(savedPlan),
    shares, userId: "t1", names, library, staff: true,
  });
  const byKey = Object.fromEntries(plans.map((plan) => [plan.key, plan.lifecycle]));
  assert.deepEqual(byKey, { aktiv: "active", entwurf: "draft", archiv: "archived" });
  const archived = plans.find((plan) => plan.key === "archiv");
  assert.equal(archiveLabel(archived, "staff"), "Manuell erledigt · 12.09.");
});

test("Ohne Bibliothek bleibt alles wie bisher aktiv", () => {
  const plans = buildHubPlans({
    savedPlans: [savedPlan("p1")],
    shares: [snapshot("shared-1", [0, 0], { sourcePlanId: "p1", shareDirection: "sent", recipientUserId: "a1" })],
    userId: "t1", names, library: null, staff: true,
  });
  assert.equal(plans[0].lifecycle, "active");
});

test("Athlet*innen: erledigte Kopien landen unter „Erledigt“", () => {
  const plans = buildHubPlans({
    savedPlans: [],
    shares: [
      snapshot("shared-1", [3, 3], { shareDirection: "received", sharedById: "t1", shareArchivedAt: "2026-09-12T10:00:00Z", shareArchivedReason: "completed" }),
      snapshot("shared-2", [1, 0], { shareDirection: "received", sharedById: "t1" }),
    ],
    userId: "a1", names,
  });
  assert.deepEqual(plans.map((plan) => plan.lifecycle), ["archived", "active"]);
  assert.equal(archiveLabel(plans[0], "athlete"), "Alle Tricks bestätigt · 12.09.");
});

test("Restfrist im Papierkorb in ganzen Tagen", () => {
  const now = Date.parse("2026-09-30T10:00:00Z");
  assert.equal(daysLeft("2026-10-27T10:00:00Z", now), 27);
  assert.equal(daysLeft("2026-09-29T10:00:00Z", now), 0);
  assert.equal(daysLeft(null, now), 0);
});
