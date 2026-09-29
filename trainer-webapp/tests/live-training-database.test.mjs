import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

/** Live-Training neu: Pause, Notizkanal, exklusive Timer, Lines und Plan-Brücke. */
const A = "00000000-0000-0000-0000-000000000001",
  B = "00000000-0000-0000-0000-000000000002",
  T = "00000000-0000-0000-0000-000000000003",
  C = "00000000-0000-0000-0000-000000000005";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
let db;
before(async () => {
  db = new PGlite();
  await db.exec(await read("./fixtures/training-base.sql"));
  await db.exec(await read("../supabase/migrations/20260923202413_step_5_training_sessions.sql"));
  await db.exec(await read("../supabase/migrations/20260929130000_live_training_redesign.sql"));
  await db.query(
    "insert into public.profiles values($1,'Alex','athlete'),($2,'Kim','athlete'),($3,'Trainer','trainer'),($4,'Chris','athlete')",
    [A, B, T, C],
  );
  await db.query("insert into public.relationships values($1,$2,true),($1,$3,true),($1,$4,true)", [T, A, B, C]);
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
      tx.query("select public.training_command($1,$2,$3) result", [key, op, JSON.stringify(payload)]),
    )
  ).rows[0].result;
const line = {
  id: "line-1",
  name: "Curb-Line",
  type: "line",
  trickIds: ["ollie", "kick", "shove"],
  trickNames: ["Ollie", "Kickturn 180", "Pop Shove-it"],
  targetValue: "3 komplette Lines",
};
const tricks = [
  { id: "ollie", name: "Ollie" },
  { id: "kick", name: "Kickturn 180" },
  line,
];
async function start(actor, mode, users = []) {
  const planId = randomUUID();
  const saved = await cmd(actor, "plan_save", { id: planId, revision: 0, content: { title: "Basics", tricks } });
  const { session_id } = await cmd(actor, "session_start", {
    source: "plan",
    plan_id: planId,
    version_id: saved.version_id,
    mode,
    users,
  });
  return session_id;
}
const workspace = async (actor, id) =>
  (await user(actor, (tx) => tx.query("select public.training_workspace_data() d"))).rows[0].d.sessions.find(
    (s) => s.id === id,
  );
const run = async (actor, id, op, extra = {}) => {
  const s = await workspace(actor, id);
  return cmd(actor, op, { session_id: id, revision: s.revision, ...extra });
};

test("Plan-Validierung: Lines brauchen 2–5 Tricks mit Namen", async () => {
  const save = (item) =>
    cmd(A, "plan_save", { id: randomUUID(), revision: 0, content: { title: "L", tricks: [item] } });
  await save(line);
  await assert.rejects(save({ ...line, trickIds: ["ollie"], trickNames: ["Ollie"] }), /TRAINING_INVALID/);
  await assert.rejects(
    save({ ...line, trickIds: ["a", "b", "c", "d", "e", "f"], trickNames: ["a", "b", "c", "d", "e", "f"] }),
    /TRAINING_INVALID/,
  );
  await assert.rejects(save({ ...line, trickNames: ["Ollie", "Kickturn"] }), /TRAINING_INVALID/);
  await assert.rejects(save({ ...line, type: "combo" }), /TRAINING_INVALID/);
  await assert.rejects(save({ id: "x", name: "X", trickIds: ["a", "b"] }), /TRAINING_INVALID/);
});

test("Notizen: eigener Kanal ohne Revisionsprüfung und ohne Revisionserhöhung", async () => {
  const id = await start(A, "self");
  const before = await workspace(A, id);
  const [p] = before.participants;
  const ex = before.exercises[0];
  // Veraltete Revision: Notiz wird trotzdem gespeichert und blockiert keinen Versuch.
  await cmd(A, "session_note", { session_id: id, revision: 0, note: "Park nass" });
  await cmd(A, "exercise_note", { session_id: id, revision: 0, exercise_id: ex.id, note: "Tail sauber" });
  await cmd(A, "attempt", {
    session_id: id,
    revision: before.revision,
    participant_id: p.id,
    exercise_id: ex.id,
    landed: true,
  });
  const after = await workspace(A, id);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.note, "Park nass");
  assert.equal(after.exercises[0].note, "Tail sauber");
});

test("Timer: Start pausiert laufende Timer anderer Übungen", async () => {
  const id = await start(A, "self");
  const [one, two] = (await workspace(A, id)).exercises;
  await run(A, id, "timer", { exercise_id: one.id, action: "start" });
  await run(A, id, "timer", { exercise_id: two.id, action: "start" });
  const s = await workspace(A, id);
  assert.equal(s.exercises[0].timer_started_at, null);
  assert.ok(s.exercises[1].timer_started_at);
});

test("Pause: stoppt Timer, zählt Pausenzeit, sperrt Eingaben, Resume startet gemerkten Timer", async () => {
  const id = await start(T, "group", [A, B]);
  const s0 = await workspace(T, id);
  const ex = s0.exercises[1];
  await run(T, id, "timer", { exercise_id: ex.id, action: "start" });
  await run(T, id, "session_pause");
  let s = await workspace(T, id);
  assert.ok(s.paused_at);
  assert.equal(s.pause_count, 1);
  assert.equal(s.resume_exercise_id, ex.id);
  assert.ok(s.exercises.every((e) => e.timer_started_at === null));
  await assert.rejects(
    run(T, id, "attempt", { participant_id: s.participants[0].id, exercise_id: ex.id, landed: true }),
    /TRAINING_PAUSED/,
  );
  await assert.rejects(run(T, id, "session_pause"), /TRAINING_PAUSED/);
  // Zehn Minuten Pause: aktive Zeit darf nicht steigen.
  await db.query("update public.training_sessions set paused_at=paused_at-interval '10 minutes' where id=$1", [id]);
  await run(T, id, "session_resume");
  s = await workspace(T, id);
  assert.equal(s.paused_at, null);
  assert.ok(Number(s.paused_ms) >= 600000);
  assert.ok(s.exercises[1].timer_started_at);
  await assert.rejects(run(T, id, "session_resume"), /TRAINING_INVALID/);
  // Pausiert beenden rechnet die laufende Pause noch ein.
  await run(T, id, "session_pause");
  await db.query("update public.training_sessions set paused_at=paused_at-interval '1 minute' where id=$1", [id]);
  await run(T, id, "complete");
  s = await workspace(T, id);
  assert.equal(s.status, "completed");
  assert.equal(s.paused_at, null);
  assert.ok(Number(s.paused_ms) >= 660000);
});

test("Anwesenheit: Nicht-Teilnehmer nachträglich hinzufügen, bisherige Versuche bleiben", async () => {
  const id = await start(T, "group", [A]);
  let s = await workspace(T, id);
  await run(T, id, "attempt", { participant_id: s.participants[0].id, exercise_id: s.exercises[0].id, landed: true });
  await run(T, id, "participant_add", { user_id: C });
  s = await workspace(T, id);
  assert.equal(s.participants.length, 2);
  assert.ok(s.participants.every((p) => p.present));
  assert.equal(s.totals[0].attempts, 1);
  // Erneutes Hinzufügen eines Abwesenden setzt nur „anwesend“.
  const chris = s.participants.find((p) => p.athlete.user_id === C);
  await run(T, id, "attendance", { participant_id: chris.id, present: false });
  await run(T, id, "participant_add", { user_id: C });
  s = await workspace(T, id);
  assert.equal(s.participants.length, 2);
  assert.ok(s.participants.find((p) => p.id === chris.id).present);
  await assert.rejects(run(T, id, "participant_add", { user_id: T }), /TRAINING_FORBIDDEN/);
});

test("Lines: Bruchstellen, Validierung, letzte Eingabe und Rückgängig", async () => {
  const id = await start(T, "group", [A, B]);
  let s = await workspace(T, id);
  const [pa, pb] = s.participants;
  const ex = s.exercises[2];
  const trick = s.exercises[0];
  await run(T, id, "attempt", { participant_id: pa.id, exercise_id: ex.id, landed: true });
  await run(T, id, "attempt", { participant_id: pa.id, exercise_id: ex.id, landed: false, broke_at: 2 });
  await run(T, id, "attempt", { participant_id: pb.id, exercise_id: ex.id, landed: false, broke_at: 2 });
  await run(T, id, "attempt", { participant_id: pb.id, exercise_id: ex.id, landed: false, broke_at: null });
  for (const broke_at of [3, -1, 1.5, "1"])
    await assert.rejects(
      run(T, id, "attempt", { participant_id: pa.id, exercise_id: ex.id, landed: false, broke_at }),
      /TRAINING_INVALID/,
    );
  await assert.rejects(
    run(T, id, "attempt", { participant_id: pa.id, exercise_id: ex.id, landed: true, broke_at: 0 }),
    /TRAINING_INVALID/,
  );
  await assert.rejects(
    run(T, id, "attempt", { participant_id: pa.id, exercise_id: trick.id, landed: false, broke_at: 0 }),
    /TRAINING_INVALID/,
  );
  s = await workspace(T, id);
  const total = (pid) => s.totals.find((t) => t.participant_id === pid && t.exercise_id === ex.id);
  assert.deepEqual([total(pa.id).attempts, total(pa.id).landed], [2, 1]);
  const breaks = s.breaks.filter((b) => b.exercise_id === ex.id);
  assert.equal(breaks.find((b) => b.participant_id === pa.id && b.broke_at === 2).attempts, 1);
  assert.equal(breaks.find((b) => b.participant_id === pb.id && b.broke_at === null).attempts, 1);
  const recent = s.recent.find((r) => r.exercise_id === ex.id);
  assert.equal(recent.participant_id, pb.id);
  assert.equal(recent.broke_at, null);
  await run(T, id, "undo", { participant_id: recent.participant_id, exercise_id: ex.id });
  s = await workspace(T, id);
  assert.equal(s.recent.find((r) => r.exercise_id === ex.id).broke_at, 2);
});

test("Brücke zum Plan: Bereit-Regel serverseitig, Rollen und Nachweis der Bestätigung", async () => {
  const shareA = randomUUID();
  await db.query("insert into public.training_plan_snapshot_shares values($1,$2,$3,'{}')", [shareA, T, A]);
  await db.query(
    "insert into public.training_trick_progress(snapshot_share_id,trick_id,athlete_id) values($1,'ollie',$2)",
    [shareA, A],
  );
  const id = await start(T, "individual", [A]);
  const s = await workspace(T, id);
  const p = s.participants[0].id;
  const ex = s.exercises[0].id;
  const bridge = () =>
    run(T, id, "progress", { participant_id: p, exercise_id: ex, share_id: shareA, status: "confirmed" });
  for (const landed of [true, true, true, true])
    await run(T, id, "attempt", { participant_id: p, exercise_id: ex, landed });
  await assert.rejects(bridge(), /TRAINING_NOT_READY/);
  await run(T, id, "attempt", { participant_id: p, exercise_id: ex, landed: false });
  // 4/5 = 80 % bei 5 Versuchen ist bereit.
  const before = (await workspace(T, id)).revision;
  await bridge();
  const row = (await db.query("select * from public.training_trick_progress where snapshot_share_id=$1", [shareA])).rows[0];
  assert.equal(row.status, "confirmed");
  assert.equal(row.confirmed_source, "live");
  assert.equal(row.confirmed_session_id, id);
  assert.equal((await workspace(T, id)).revision, before);
  await assert.rejects(bridge(), /TRAINING_FORBIDDEN/);
  // Auch nach dem Abschluss (Abschluss-Screen) bleibt die Brücke nutzbar.
  await db.query("update public.training_trick_progress set status='awaiting_confirmation',confirmed_by=null,confirmed_at=null where snapshot_share_id=$1", [shareA]);
  await run(T, id, "complete");
  await bridge();
  await assert.rejects(
    run(T, id, "attempt", { participant_id: p, exercise_id: ex, landed: true }),
    /TRAINING_COMPLETED/,
  );

  // Skater im Selbsttraining: Offen → Geübt → Gemeldet, nie selbst bestätigen.
  const shareB = randomUUID();
  await db.query("insert into public.training_plan_snapshot_shares values($1,$2,$3,'{}')", [shareB, T, B]);
  await db.query(
    "insert into public.training_trick_progress(snapshot_share_id,trick_id,athlete_id) values($1,'kick',$2)",
    [shareB, B],
  );
  const own = await start(B, "self");
  const o = await workspace(B, own);
  const op = o.participants[0].id;
  const oex = o.exercises[1].id;
  for (let i = 0; i < 5; i++) await run(B, own, "attempt", { participant_id: op, exercise_id: oex, landed: true });
  const step = (status) => run(B, own, "progress", { participant_id: op, exercise_id: oex, share_id: shareB, status });
  await assert.rejects(step("confirmed"), /TRAINING_FORBIDDEN/);
  await assert.rejects(step("awaiting_confirmation"), /TRAINING_FORBIDDEN/);
  await step("in_progress");
  await step("awaiting_confirmation");
  const own_row = (await db.query("select status from public.training_trick_progress where snapshot_share_id=$1", [shareB])).rows[0];
  assert.equal(own_row.status, "awaiting_confirmation");
  // Fremde Freigabe (anderer Athlet) wird nie verändert.
  await assert.rejects(
    run(B, own, "progress", { participant_id: op, exercise_id: oex, share_id: shareA, status: "in_progress" }),
    /TRAINING_INVALID/,
  );
});

test("Rückblick: Line-Art, Bruchstellen und aktive Zeit (Migration 20260929130100)", async () => {
  // Minimale Stubs der Schritt-6-Objekte, damit die Projektion kompiliert.
  await db.exec(`
    create function private.training_recap_access(u uuid) returns boolean language sql stable as $$ select true $$;
    create function private.training_recap_has_trainer(u uuid) returns boolean language sql stable as $$ select false $$;
    create table public.training_session_reviews(id uuid primary key,participant_id uuid,exercise_id uuid,kind text,body text,author_id uuid,author_role text,created_at timestamptz default now(),supersedes uuid,visibility text default 'athlete');
    grant select on public.training_session_reviews to authenticated;
    create table public.skateparks(id uuid primary key,name text);
    alter table public.training_sessions add column skatepark_id uuid references public.skateparks(id);
  `);
  await db.exec(await read("../supabase/migrations/20260929130100_live_training_recap_lines.sql"));
  const id = await start(A, "self");
  let s = await workspace(A, id);
  const p = s.participants[0].id;
  const ex = s.exercises[2].id;
  await run(A, id, "attempt", { participant_id: p, exercise_id: ex, landed: true });
  await run(A, id, "attempt", { participant_id: p, exercise_id: ex, landed: false, broke_at: 1 });
  await run(A, id, "attempt", { participant_id: p, exercise_id: ex, landed: false, broke_at: null });
  await run(A, id, "session_pause");
  await db.query("update public.training_sessions set started_at=now()-interval '30 minutes',paused_at=now()-interval '10 minutes' where id=$1", [id]);
  await run(A, id, "complete");
  const recaps = (await user(A, (tx) => tx.query("select private.training_recaps() r"))).rows[0].r;
  const recap = recaps.find((r) => r.session_id === id);
  const line = recap.exercises.find((e) => e.id === ex);
  assert.equal(line.kind, "line");
  assert.deepEqual(line.line_tricks, ["Ollie", "Kickturn 180", "Pop Shove-it"]);
  assert.deepEqual([line.attempts, line.landed], [3, 1]);
  assert.deepEqual(
    line.breaks.sort((a, b) => (a.broke_at ?? -1) - (b.broke_at ?? -1)),
    [{ broke_at: null, attempts: 1 }, { broke_at: 1, attempts: 1 }],
  );
  assert.equal(recap.exercises[0].kind, "trick");
  assert.equal(recap.exercises[0].breaks, null);
  // 30 Min seit Start, davon 10 Min pausiert.
  assert.ok(Math.abs(Number(recap.active_ms) - 20 * 60000) < 5000);
});
