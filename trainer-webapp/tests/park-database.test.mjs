// Datenbankverträge für Schritt 7: öffentliche Parks, Versionen, Trick-Katalog und
// Runs je Athlet. Läuft isoliert in PGlite gegen die echte Migration.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const A = "00000000-0000-0000-0000-000000000001", // Athlet Alex
  B = "00000000-0000-0000-0000-000000000002", // Athlet Kim (fremd für Alex)
  T = "00000000-0000-0000-0000-000000000003", // Trainer von Alex
  G = "00000000-0000-0000-0000-000000000004", // Elternteil von Alex
  S = "00000000-0000-0000-0000-000000000005", // Vereinsvorstand ohne Trainerrolle
  X = "00000000-0000-0000-0000-000000000009"; // deaktiviertes Konto

let db;
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
before(async () => {
  db = new PGlite();
  await db.exec(await read("./fixtures/training-base.sql"));
  await db.exec(
    await read(
      "../supabase/migrations/20260923202413_step_5_training_sessions.sql",
    ),
  );
  await db.exec(await read("./fixtures/park-base.sql"));
  await db.exec(
    await read(
      "../supabase/migrations/20260924135627_step_7_park_run_planner.sql",
    ),
  );
  // Schritt 7b erweitert dieselben Verträge; alle Tests laufen mit beiden Migrationen.
  await db.exec(
    await read("../supabase/migrations/20260926120000_step_7b_park_ground.sql"),
  );
  await db.query(
    "insert into public.profiles values($1,'Alex','athlete'),($2,'Kim','athlete'),($3,'Trainer','trainer'),($4,'Mama','guardian'),($5,'Vorstand','athlete'),($6,'Gesperrt','athlete')",
    [A, B, T, G, S, X],
  );
  await db.query(
    "insert into public.relationships(trainer_id,athlete_id,active) values($1,$2,true)",
    [T, A],
  );
  await db.query(
    "insert into public.relationships(active,relationship_type,guardian_user_id,athlete_user_id) values(true,'guardian',$1,$2)",
    [G, A],
  );
  await db.query(
    "insert into public.organization_memberships(organization_id,user_id,role) values(gen_random_uuid(),$1,'club_board')",
    [S],
  );
});
after(async () => db?.close());

const user = (id, fn) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
const cmd = async (id, op, payload, key = randomUUID()) =>
  (
    await user(id, (tx) =>
      tx.query("select public.park_command($1,$2,$3) result", [
        key,
        op,
        JSON.stringify(payload),
      ]),
    )
  ).rows[0].result;
const rpc = async (id, sql, params = []) =>
  (await user(id, (tx) => tx.query(sql, params))).rows[0].data;

const content = (obstacles = ["ledge-1", "rail-1", "quarter-1"]) => ({
  size: { width: 40, length: 30 },
  obstacles: obstacles.map((id, i) => ({
    id,
    type: id.split("-")[0],
    x: i * 4,
    z: 0,
    rotation: 0,
    width: 3,
    length: 1,
    height: 0.5,
  })),
});
async function park(actor = A, extra = {}) {
  const park_id = randomUUID();
  const r = await cmd(actor, "park_create", {
    park_id,
    name: "Testpark",
    location: "München",
    content: content(),
    ...extra,
  });
  return { id: park_id, version: r.version_id };
}
const trickId = async (name) =>
  (
    await db.query("select id from public.trick_catalog where name=$1", [name])
  ).rows[0].id;
async function runPayload(p, athlete = A, extra = {}) {
  return {
    run_id: randomUUID(),
    revision: 0,
    park_version_id: p.version,
    athlete_user_id: athlete,
    title: "Contest-Run",
    start: { x: -10, z: 5 },
    end: { x: 10, z: 5 },
    target_score: 72.5,
    actual_score: null,
    steps: [
      {
        obstacle_id: "ledge-1",
        trick_id: await trickId("50-50"),
        direction: "frontside",
      },
      {
        obstacle_id: "ledge-1",
        trick_id: await trickId("Noseslide"),
        stance: "switch",
      },
      { obstacle_id: "rail-1", trick_id: await trickId("Boardslide") },
    ],
    ...extra,
  };
}

test("Parks sind für alle aktiven Nutzer lesbar, aber nicht für gesperrte Konten", async () => {
  const p = await park();
  const directory = await rpc(B, "select public.park_directory() data");
  assert.ok(directory.parks.some((x) => x.id === p.id));
  const detail = await rpc(B, "select public.park_detail($1) data", [p.id]);
  assert.equal(detail.park.can_edit, false);
  assert.equal(detail.versions[0].content.obstacles.length, 3);
  assert.equal(
    (
      await user(X, (tx) =>
        tx.query("select count(*)::int n from public.skateparks"),
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(park(X), /PARK_FORBIDDEN/);
});

test("Nur Ersteller, Trainer und Funktionäre ändern Parks; jede Änderung ist eine neue Version", async () => {
  const p = await park(A);
  const save = (actor, revision, name) =>
    cmd(actor, "park_save", {
      park_id: p.id,
      revision,
      name,
      content: content(["ledge-1", "rail-1"]),
    });
  await assert.rejects(save(B, 1, "Fremd"), /PARK_FORBIDDEN/);
  await save(A, 1, "Eigene Änderung");
  await save(T, 2, "Trainer");
  await save(S, 3, "Vorstand");
  await assert.rejects(save(A, 3, "Veraltet"), /PARK_CONFLICT/);
  const versions = (
    await db.query(
      "select version_number,content from public.skatepark_versions where park_id=$1 order by version_number",
      [p.id],
    )
  ).rows;
  assert.equal(versions.length, 4);
  assert.equal(versions[0].content.obstacles.length, 3);
  // Direkte Schreibzugriffe auf Versionen sind nicht erlaubt.
  await assert.rejects(
    user(A, (tx) =>
      tx.query(
        "update public.skatepark_versions set content='{}' where park_id=$1",
        [p.id],
      ),
    ),
    /permission denied/,
  );
});

test("Ungültige Parkinhalte und fremde Luftbildpfade werden abgelehnt", async () => {
  await assert.rejects(
    park(A, {
      content: { ...content(), obstacles: [{ id: "x", type: "castle" }] },
    }),
    /PARK_INVALID/,
  );
  await assert.rejects(
    park(A, { content: { ...content(), obstacles: content(["a-1", "a-1"]).obstacles } }),
    /PARK_INVALID/,
  );
  const aerial = (owner) => ({
    path: `${owner}/${randomUUID()}.webp`,
    width: 60,
    aspect: 0.75,
    rotation: 0,
    offsetX: 0,
    offsetZ: 0,
    opacity: 0.9,
    rightsConfirmed: true,
  });
  await assert.rejects(
    park(A, { content: { ...content(), aerial: aerial(B) } }),
    /PARK_FORBIDDEN/,
  );
  await assert.rejects(
    park(A, {
      content: {
        ...content(),
        aerial: { ...aerial(A), rightsConfirmed: false },
      },
    }),
    /PARK_INVALID/,
  );
  // Ein Trainer darf ein fremdes, bereits verwendetes Luftbild übernehmen.
  const own = aerial(A);
  const p = await park(A, { content: { ...content(), aerial: own } });
  await cmd(T, "park_save", {
    park_id: p.id,
    revision: 1,
    name: "Mit Bild",
    content: { ...content(), aerial: own },
  });
});

test("Run mit mehreren Pins am selben Obstacle, Start und Ende bleibt nach Parkänderung an seiner Version", async () => {
  const p = await park(A);
  const payload = await runPayload(p);
  await cmd(A, "run_save", payload);
  await cmd(A, "park_save", {
    park_id: p.id,
    revision: 1,
    name: "Umgebaut",
    content: content(["bank-1"]),
  });
  const detail = await rpc(A, "select public.park_detail($1) data", [p.id]);
  const run = detail.runs.find((r) => r.id === payload.run_id);
  assert.deepEqual(
    run.steps.map((s) => [s.position, s.obstacle_id, s.trick_name]),
    [
      [1, "ledge-1", "50-50"],
      [2, "ledge-1", "Noseslide"],
      [3, "rail-1", "Boardslide"],
    ],
  );
  assert.equal(run.version_number, 1);
  assert.equal(Number(run.target_score), 72.5);
  assert.deepEqual(run.start_point, { x: -10, z: 5 });
  // Die referenzierte alte Version wird weiterhin ausgeliefert.
  assert.deepEqual(
    detail.versions.map((v) => v.version_number),
    [2, 1],
  );
  // Obstacles, die in der gewählten Version fehlen, sind ungültig.
  const v2 = detail.versions[0].id;
  await assert.rejects(
    cmd(A, "run_save", { ...payload, revision: 1, park_version_id: v2 }),
    /PARK_INVALID/,
  );
});

test("Run-Rechte: Athlet und Trainer schreiben, Eltern lesen, Fremde sehen nichts", async () => {
  const p = await park(A);
  const own = await runPayload(p, A);
  await cmd(A, "run_save", own);
  const byTrainer = await runPayload(p, A, { title: "Vom Trainer" });
  await cmd(T, "run_save", byTrainer);
  await assert.rejects(
    cmd(T, "run_save", await runPayload(p, B)),
    /PARK_FORBIDDEN/,
  );
  await assert.rejects(
    cmd(G, "run_save", await runPayload(p, A)),
    /PARK_FORBIDDEN/,
  );
  await assert.rejects(
    cmd(B, "run_save", await runPayload(p, A)),
    /PARK_FORBIDDEN/,
  );
  const guardianRuns = (
    await rpc(G, "select public.park_detail($1) data", [p.id])
  ).runs;
  assert.equal(guardianRuns.length, 2);
  assert.ok(guardianRuns.every((r) => r.can_edit === false));
  assert.equal(
    (await rpc(B, "select public.park_detail($1) data", [p.id])).runs.length,
    0,
  );
  assert.equal(
    (
      await user(B, (tx) =>
        tx.query("select count(*)::int n from public.park_run_steps"),
      )
    ).rows[0].n,
    0,
  );
  // Trainer ändert den Run des Athleten; der Athlet bleibt unveränderlich.
  await cmd(T, "run_save", { ...own, revision: 1, actual_score: 80 });
  await assert.rejects(
    cmd(A, "run_save", { ...own, revision: 2, athlete_user_id: B }),
    /PARK_FORBIDDEN/,
  );
  await assert.rejects(
    cmd(G, "run_delete", { run_id: own.run_id, revision: 2 }),
    /PARK_FORBIDDEN/,
  );
  await cmd(A, "run_delete", { run_id: own.run_id, revision: 2 });
  assert.equal(
    (
      await db.query("select count(*)::int n from public.park_runs where id=$1", [
        own.run_id,
      ])
    ).rows[0].n,
    0,
  );
});

test("Idempotenz und Revision verhindern doppelte oder stille Run-Änderungen", async () => {
  const p = await park(A);
  const payload = await runPayload(p);
  const key = randomUUID();
  const first = await cmd(A, "run_save", payload, key);
  assert.deepEqual(await cmd(A, "run_save", payload, key), first);
  await assert.rejects(
    cmd(A, "run_save", { ...payload, title: "anders" }, key),
    /PARK_REQUEST_REUSED/,
  );
  await assert.rejects(cmd(A, "run_save", payload), /PARK_CONFLICT/);
  const update = { ...payload, revision: 1, title: "Neu" };
  const results = await Promise.allSettled([
    cmd(A, "run_save", update),
    cmd(T, "run_save", { ...update, title: "Parallel" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});

test("Termine nur verknüpfbar, wenn sichtbar und vom Typ Training oder Contest", async () => {
  const p = await park(A);
  const [contest, meeting, foreign] = [randomUUID(), randomUUID(), randomUUID()];
  await db.query(
    "insert into public.events(id,created_by,title,type,starts_at) values($1,$4,'Contest','contest',now()),($2,$4,'Sitzung','meeting',now()),($3,$5,'Fremd','training',now())",
    [contest, meeting, foreign, A, B],
  );
  const payload = await runPayload(p, A, { event_id: contest });
  await cmd(A, "run_save", payload);
  await assert.rejects(
    cmd(A, "run_save", await runPayload(p, A, { event_id: meeting })),
    /PARK_INVALID/,
  );
  await assert.rejects(
    cmd(A, "run_save", await runPayload(p, A, { event_id: foreign })),
    /PARK_INVALID/,
  );
  const detail = await rpc(A, "select public.park_detail($1) data", [p.id]);
  assert.equal(
    detail.runs.find((r) => r.id === payload.run_id).event.title,
    "Contest",
  );
  assert.ok(detail.events.some((e) => e.id === contest));
  assert.ok(!detail.events.some((e) => e.id === meeting));
});

test("Trick-Vorschläge: sofort selbst nutzbar, für andere erst nach Freigabe", async () => {
  const p = await park(A);
  const suggested = await cmd(A, "trick_suggest", {
    name: "Hippie Jump",
    category: "other",
  });
  assert.equal(suggested.status, "pending");
  // Gleicher Name wird wiederverwendet statt dupliziert.
  assert.deepEqual(
    await cmd(A, "trick_suggest", { name: " hippie jump ", category: "other" }),
    suggested,
  );
  assert.equal(
    (await cmd(A, "trick_suggest", { name: "kickflip", category: "flip" }))
      .status,
    "approved",
  );
  await assert.rejects(
    cmd(B, "trick_suggest", { name: "Hippie Jump", category: "other" }),
    /TRICK_PENDING/,
  );
  const step = { obstacle_id: "ledge-1", trick_id: suggested.trick_id };
  await cmd(A, "run_save", await runPayload(p, A, { steps: [step] }));
  const kimRun = await runPayload(p, B, { steps: [step] });
  await assert.rejects(cmd(B, "run_save", kimRun), /PARK_INVALID/);
  const visible = async (actor) =>
    (await rpc(actor, "select public.park_detail($1) data", [p.id])).tricks.some(
      (t) => t.id === suggested.trick_id,
    );
  assert.equal(await visible(A), true);
  assert.equal(await visible(B), false);
  assert.equal(await visible(T), true);
  assert.equal(
    (await rpc(T, "select public.park_directory() data")).pending_tricks.length,
    1,
  );
  await assert.rejects(
    cmd(B, "trick_review", { trick_id: suggested.trick_id, decision: "approved" }),
    /PARK_FORBIDDEN/,
  );
  await cmd(S, "trick_review", {
    trick_id: suggested.trick_id,
    decision: "approved",
  });
  assert.equal(await visible(B), true);
  await cmd(B, "run_save", kimRun);
});

test("Luftbild-Bucket erlaubt Uploads nur in den eigenen Ordner", async () => {
  const upload = (actor, owner) =>
    user(actor, (tx) =>
      tx.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('skatepark-aerials',$1,$2)",
        [`${owner}/${randomUUID()}.webp`, actor],
      ),
    );
  await upload(A, A);
  await assert.rejects(upload(A, B), /row-level security/);
  assert.equal(
    (
      await user(B, (tx) =>
        tx.query(
          "select count(*)::int n from storage.objects where bucket_id='skatepark-aerials'",
        ),
      )
    ).rows[0].n,
    1,
  );
});

// ---------------------------------------------------------------------------
// Schritt 7b: Untergrund, Georeferenz, Bereiche und eigene Modelle
// ---------------------------------------------------------------------------

const asset = (owner, ext) => `${owner}/${randomUUID()}.${ext}`;
const terrain = (owner) => ({
  kind: "terrain",
  path: asset(owner, "bin"),
  cols: 80,
  rows: 60,
  width: 80,
  length: 60,
  minHeight: -1.3,
  maxHeight: 2.9,
  attribution: "Quelle: GeoSN, dl-de/by-2-0",
  stand: "2023-01-09",
});

test("7b: amtlicher Untergrund, Georeferenz, Bereich und eigenes Modell werden gespeichert", async () => {
  const content7b = {
    ...content(["ledge-1"]),
    obstacles: [
      ...content(["ledge-1"]).obstacles,
      { id: "bowl-zone", type: "zone", x: -5, z: 3, rotation: 10, width: 18, length: 9, height: 0.3, label: "Bowl", elevation: -1.2 },
      { id: "kicker", type: "custom", x: 6, z: 0, rotation: 0, width: 2, length: 1.5, height: 0.8, modelPath: asset(A, "glb"), modelFormat: "glb", upAxis: "y" },
    ],
    ground: terrain(A),
    geo: { state: "SN", lat: 51.32, lon: 12.3, x: 311769, y: 5688926 },
    aerial: { path: asset(A, "jpg"), width: 80, aspect: 0.75, rotation: 0, offsetX: 0, offsetZ: 0, opacity: 1, rightsConfirmed: true, attribution: "Quelle: GeoSN, dl-de/by-2-0" },
  };
  const p = await park(A, { content: content7b });
  const detail = await rpc(A, "select public.park_detail($1) data", [p.id]);
  assert.equal(detail.versions[0].content.ground.kind, "terrain");
  assert.equal(detail.versions[0].content.obstacles.length, 3);
  // Tricks lassen sich an einen Bereich pinnen.
  await cmd(A, "run_save", await runPayload(p, A, { steps: [{ obstacle_id: "bowl-zone", trick_id: await trickId("Rock to Fakie") }] }));
  // Park-Modell als Untergrund ist ebenfalls gültig.
  await cmd(A, "park_save", {
    park_id: p.id,
    revision: 1,
    name: "Mit Modell",
    content: { ...content7b, ground: { kind: "model", path: asset(A, "obj"), format: "obj", upAxis: "z", scale: 0.001, rotation: 0, offsetX: 0, offsetY: 0, offsetZ: 0 } },
  });
});

test("7b: ungültige Untergründe, Modelle und Georeferenzen werden abgelehnt", async () => {
  const bad = [
    { ground: { ...terrain(A), cols: 9999 } },
    { ground: { ...terrain(A), attribution: "" } },
    { ground: { ...terrain(A), path: asset(A, "exe") } },
    { ground: { kind: "heightfield" } },
    { ground: { kind: "model", path: asset(A, "fbx"), format: "fbx", scale: 1, rotation: 0, offsetX: 0, offsetY: 0, offsetZ: 0 } },
    { geo: { state: "NW", lat: 51, lon: 7, x: 400000, y: 5700000 } },
    { obstacles: [{ id: "c", type: "custom", x: 0, z: 0, rotation: 0, width: 1, length: 1, height: 1, modelPath: asset(A, "glb"), modelFormat: "stl" }] },
    { obstacles: [{ id: "l", type: "ledge", x: 0, z: 0, rotation: 0, width: 1, length: 1, height: 1, modelPath: asset(A, "glb") }] },
    { obstacles: [{ id: "z", type: "zone", x: 0, z: 0, rotation: 0, width: 1, length: 1, height: 1, elevation: 99 }] },
  ];
  for (const patch of bad)
    await assert.rejects(park(A, { content: { ...content(), ...patch } }), /PARK_INVALID|invalid input/, JSON.stringify(patch));
});

test("7b: fremde Modell- und Rasterdateien nur unverändert übernehmbar", async () => {
  // Kim darf keine Dateien aus Alex' Ordner in einen neuen Park einbinden.
  await assert.rejects(park(B, { content: { ...content(), ground: terrain(A) } }), /PARK_FORBIDDEN/);
  await assert.rejects(
    park(B, { content: { ...content(), obstacles: [{ id: "c", type: "custom", x: 0, z: 0, rotation: 0, width: 1, length: 1, height: 1, modelPath: asset(A, "glb"), modelFormat: "glb" }] } }),
    /PARK_FORBIDDEN/,
  );
  // Ein Trainer übernimmt Alex' Untergrund unverändert, darf ihn aber nicht gegen eine fremde Datei tauschen.
  const ground = terrain(A);
  const p = await park(A, { content: { ...content(), ground } });
  await cmd(T, "park_save", { park_id: p.id, revision: 1, name: "Trainer", content: { ...content(), ground } });
  await assert.rejects(
    cmd(T, "park_save", { park_id: p.id, revision: 2, name: "Tausch", content: { ...content(), ground: terrain(B) } }),
    /PARK_FORBIDDEN/,
  );
  await cmd(T, "park_save", { park_id: p.id, revision: 2, name: "Eigenes", content: { ...content(), ground: terrain(T) } });
});

test("7b: Modell-Speicher erlaubt Uploads nur in den eigenen Ordner", async () => {
  const upload = (actor, owner, ext) =>
    user(actor, (tx) =>
      tx.query("insert into storage.objects(bucket_id,name,owner_id) values('skatepark-models',$1,$2)", [asset(owner, ext), actor]),
    );
  await upload(A, A, "glb");
  await upload(A, A, "bin");
  await assert.rejects(upload(A, B, "glb"), /row-level security/);
  await assert.rejects(upload(A, A, "exe"), /row-level security/);
});
