import assert from "node:assert/strict";
import test from "node:test";

import {
  createObstacle,
  defaultRunPoints,
  missingObstacleSteps,
  moveStep,
  normalizeRotation,
  obstacleName,
  parseScore,
  pathArrows,
  pinLayout,
  runPath,
  stepLabel,
} from "../src/domain/parks.ts";

const ledge = { ...createObstacle("ledge", { x: 0, z: 0 }, "l1"), height: 0.5 };
const rail = createObstacle("rail", { x: 6.1, z: 2.9 }, "r1");

test("neue Obstacles übernehmen Standardmaße und rasten auf 0,25 m ein", () => {
  assert.deepEqual(
    { x: rail.x, z: rail.z, width: rail.width },
    { x: 6, z: 3, width: 4 },
  );
  assert.equal(obstacleName(ledge, [ledge, rail]), "Ledge");
  const second = createObstacle("ledge", { x: 2, z: 2 }, "l2");
  assert.equal(obstacleName(second, [ledge, rail, second]), "Ledge 2");
  assert.equal(obstacleName({ ...second, label: " Kurve " }, []), "Kurve");
});

test("mehrere Pins am selben Obstacle liegen nummeriert nebeneinander", () => {
  const pins = pinLayout(
    [{ obstacle_id: "l1" }, { obstacle_id: "l1" }, { obstacle_id: "r1" }, { obstacle_id: "weg" }],
    [ledge, rail],
  );
  assert.deepEqual(
    pins.map((p) => [p.number, p.obstacleId]),
    [
      [1, "l1"],
      [2, "l1"],
      [3, "r1"],
    ],
  );
  assert.equal(pins[1].x - pins[0].x, 1.5);
  assert.equal(pins[0].x + pins[1].x, 0);
  assert.equal(pins[2].x, rail.x);
});

test("Fahrlinie verbindet Start, Obstacles und Ende ohne doppelte Punkte", () => {
  const start = { x: -10, z: 5 };
  const end = { x: 10, z: 5 };
  const path = runPath(
    start,
    end,
    [{ obstacle_id: "l1" }, { obstacle_id: "l1" }, { obstacle_id: "r1" }],
    [ledge, rail],
  );
  assert.deepEqual(path, [start, { x: 0, z: 0 }, { x: 6, z: 3 }, end]);
  const arrows = pathArrows(path);
  assert.equal(arrows.length, 3);
  // Abschnitt Start → Ledge zeigt nach rechts hinten (dx > 0, dz < 0).
  assert.ok(arrows[0].angle > Math.PI / 2 && arrows[0].angle < Math.PI);
});

test("Hilfsfunktionen für Reihenfolge, Umbau, Scores und Beschriftung", () => {
  assert.deepEqual(moveStep(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveStep(["a", "b"], 0, -1), ["a", "b"]);
  assert.deepEqual(
    missingObstacleSteps([{ obstacle_id: "l1" }, { obstacle_id: "x" }], [ledge]),
    [1],
  );
  assert.equal(parseScore(""), null);
  assert.equal(parseScore("72,456"), 72.46);
  assert.equal(parseScore("-1"), "invalid");
  assert.equal(parseScore("abc"), "invalid");
  assert.equal(normalizeRotation(270), -90);
  assert.equal(normalizeRotation(-450), -90);
  assert.equal(
    stepLabel({ stance: "switch", direction: "frontside", trick_name: "50-50" }),
    "Switch Frontside 50-50",
  );
  assert.equal(stepLabel({ stance: "regular", direction: null, trick_name: "Ollie" }), "Ollie");
  assert.deepEqual(defaultRunPoints({ width: 40, length: 30 }), {
    start: { x: -18, z: 13 },
    end: { x: 18, z: 13 },
  });
});
