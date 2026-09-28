import assert from "node:assert/strict";
import test from "node:test";

import {
  insertWaypoint,
  moveWaypoint,
  normalizeWaypoints,
  playSchedule,
  playState,
  removeWaypoint,
  runControls,
  segmentCount,
} from "../src/domain/run-path.ts";

const obstacles = [
  { id: "a", type: "ledge", x: 0, z: 0, rotation: 0, width: 4, length: 1, height: 0.5 },
  { id: "b", type: "rail", x: 10, z: 0, rotation: 0, width: 4, length: 1, height: 0.5 },
];
const start = { x: -10, z: 0 };
const end = { x: 20, z: 0 };
const steps = [{ obstacle_id: "a" }, { obstacle_id: "a" }, { obstacle_id: "b" }];

test("Kontrollpunkte: Obstacles einmal je Besuch, Zwischenpunkte im richtigen Abschnitt", () => {
  const via = [
    { x: 15, z: 5, seg: 2 },
    { x: -5, z: 3, seg: 0 },
  ];
  const controls = runControls(start, end, steps, obstacles, via);
  assert.deepEqual(
    controls.map((c) => c.kind),
    ["start", "via", "obstacle", "obstacle", "via", "end"],
  );
  assert.deepEqual(controls[2].steps, [0, 1]);
  assert.deepEqual(controls[3].steps, [2]);
  assert.equal(controls.at(-1).seg, 3, "drei Abschnitte");
  // Abschnitte hinter dem Ende werden auf den letzten begrenzt.
  assert.equal(normalizeWaypoints([{ x: 0, z: 0, seg: 9 }], 3)[0].seg, 2);
});

test("Einfügen, Verschieben und Entfernen von Zwischenpunkten", () => {
  let controls = runControls(start, end, steps, obstacles, []);
  // Nach dem Start (Abschnitt 0) einfügen.
  let { via, index } = insertWaypoint([], controls, 0, { x: -5, z: 2 });
  assert.equal(index, 0);
  assert.deepEqual(via, [{ x: -5, z: 2, seg: 0 }]);
  // Zwischen Zwischenpunkt und Obstacle a: gleicher Abschnitt, dahinter.
  controls = runControls(start, end, steps, obstacles, via);
  ({ via, index } = insertWaypoint(via, controls, 1, { x: -2, z: 1 }));
  assert.equal(index, 1);
  // Nach Obstacle b (Abschnitt 2).
  controls = runControls(start, end, steps, obstacles, via);
  ({ via, index } = insertWaypoint(via, controls, 4, { x: 15, z: 4 }));
  assert.deepEqual(via.map((w) => w.seg), [0, 0, 2]);
  assert.deepEqual(moveWaypoint(via, 2, { x: 16, z: 3 })[2], { x: 16, z: 3, seg: 2 });
  assert.equal(removeWaypoint(via, 0).length, 2);
});

test("Animation: Fahrt, Pause je Trick und Ende", () => {
  const schedule = playSchedule(50, [
    { at: 0.25, steps: [0, 1] },
    { at: 0.75, steps: [2] },
  ]);
  assert.deepEqual(
    schedule.map((p) => p.kind),
    ["move", "trick", "trick", "move", "trick", "move"],
  );
  // 50 m bei 5 m/s = 10 s Fahrt; nach 2,5 s am ersten Obstacle, dann 0,8 s je Trick.
  assert.equal(playState(schedule, 2.6).step, 0);
  assert.equal(playState(schedule, 3.4).step, 1);
  assert.equal(playState(schedule, 0).at, 0);
  assert.ok(playState(schedule, 5).at > 0.25 && playState(schedule, 5).at < 0.75);
  assert.deepEqual(playState(schedule, 999), { at: 1, step: null, done: true });
  // Kurze Runs dauern mindestens 4 s Fahrt.
  const short = playSchedule(2, []);
  assert.equal(short[0].duration, 4);
});

test("Tipppositionen: jeder Trick liegt dort, wo getippt wurde; Start/Ziel dürfen fehlen", () => {
  const spotted = [
    { obstacle_id: "a", point: { x: -1, z: 2 } },
    { obstacle_id: "a", point: { x: 1.5, z: -1 } },
    { obstacle_id: "b" },
  ];
  const controls = runControls(null, null, spotted, obstacles);
  assert.deepEqual(
    controls.map((c) => [c.kind, c.x, c.z]),
    [
      ["obstacle", -1, 2],
      ["obstacle", 1.5, -1],
      ["obstacle", 10, 0],
    ],
  );
  assert.equal(segmentCount(controls), 4);
});
