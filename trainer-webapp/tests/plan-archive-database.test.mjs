import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Trainingspläne archivieren und löschen (Migration 20260930100000).
// Personen: Athlet*innen A/B (mit Trainer T verbunden), Vereinsathletin C,
// Vorstand V (verwaltet den Verein von T), fremder Trainer F (anderer Verein).
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const T = "00000000-0000-4000-8000-000000000001";
const F = "00000000-0000-4000-8000-000000000002";
const V = "00000000-0000-4000-8000-000000000003";
const CLUB = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CLUB = "00000000-0000-4000-8000-0000000000c2";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
let db;

before(async () => {
  db = new PGlite();
  await db.exec(await read("./fixtures/plan-hub-base.sql"));
  // Produktiv vorhandene Nachweis-Tabelle in minimaler Form (nur die Spalten,
  // die Verlauf und Sperre benötigen) sowie die Service-Rolle für die Bereinigung.
  await db.exec(`
    create role service_role;
    create table public.training_video_evidence(
      id uuid primary key default gen_random_uuid(),
      snapshot_share_id uuid not null references public.training_plan_snapshot_shares(id) on delete cascade,
      trick_id text not null, athlete_id uuid not null references public.profiles(id));
  `);
  for (const file of [
    "20260923202413_step_5_training_sessions.sql",
    "20260924132843_step_6_session_recaps.sql",
    "20260929100000_plan_hub_rights_groups.sql",
    // Live-Training ersetzt training_command; die neue Migration folgt wie in Produktion danach.
    "20260929130000_live_training_redesign.sql",
    "20260929130100_live_training_recap_lines.sql",
    "20260930100000_plan_archive_trash.sql",
  ]) {
    await db.exec(await read(`../supabase/migrations/${file}`));
  }
  await db.query(
    `insert into public.profiles values
     ($1,'Alex Athlet','athlete'),($2,'Bea Athlet','athlete'),($3,'Cem Verein','athlete'),
     ($4,'Tina Trainer','trainer'),($5,'Frank Fremd','trainer'),($6,'Vera Vorstand','organization_staff')`,
    [A, B, C, T, F, V],
  );
  await db.query(
    `insert into public.relationships(user_one_id,user_two_id,relationship_type) values
     (least($1::uuid,$3::uuid),greatest($1::uuid,$3::uuid),'trainer_athlete'),
     (least($2::uuid,$3::uuid),greatest($2::uuid,$3::uuid),'trainer_athlete')`,
    [A, B, T],
  );
  await db.query(
    `insert into public.organizations values ($1,null,'SKSB Augsburg','club'),($2,null,'Anderer Verein','club')`,
    [CLUB, OTHER_CLUB],
  );
  await db.query(
    `insert into public.organization_memberships(organization_id,user_id,role) values
     ($1,$2,'club_board'),($1,$3,'athlete'),($1,$4,'club_trainer'),($5,$6,'club_trainer')`,
    [CLUB, V, C, T, OTHER_CLUB, F],
  );
});
after(async () => db?.close());

/* ------------------------------ Helfer ------------------------------ */

const as = (id, fn) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
const call = async (id, sql, params = []) => (await as(id, (tx) => tx.query(sql, params))).rows;
const code = async (promise) => {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error.code ?? error.message;
  }
};
const plan = (id, title = "Street Basics") => ({
  id,
  title,
  tricks: [
    { id: "t1", name: "Ollie" },
    { id: "t2", name: "Kickflip" },
  ],
});

/** Neuer Plan von `owner`, optional direkt an Athlet*innen zugewiesen. */
async function createPlan(owner, athletes = [], title) {
  const content = plan(randomUUID(), title);
  await call(owner, "select public.training_command($1,'plan_save',$2)", [
    randomUUID(),
    JSON.stringify({ id: content.id, revision: 0, content }),
  ]);
  if (athletes.length) {
    await call(owner, "select public.training_assign_plan($1,$2,'{}',false)", [JSON.stringify(content), athletes]);
  }
  return content;
}
const shareOf = async (content, athlete) =>
  (await db.query(
    "select * from public.training_plan_snapshot_shares where plan_snapshot->>'id'=$1 and recipient_user_id=$2 order by created_at desc limit 1",
    [content.id, athlete],
  )).rows[0];
const planRow = async (content) =>
  (await db.query("select * from public.training_plans where id=$1", [content.id])).rows[0];
const setStatus = (share, status, trick = null) =>
  db.query(
    `update public.training_trick_progress set status=$2::public.trick_progress_status,
      confirmed_by=case when $2='confirmed' then $3::uuid end, confirmed_at=case when $2='confirmed' then now() end
     where snapshot_share_id=$1 and ($4::text is null or trick_id=$4)`,
    [share, status, T, trick],
  );
const library = async (actor) => (await call(actor, "select public.training_plan_library() r"))[0].r;
const libraryEntry = async (actor, key) => {
  const lib = await library(actor);
  return [...lib.plans, ...lib.legacy].find((entry) => entry.key === key);
};

/* ------------------------------- Tests ------------------------------ */

test("Automatisch archivieren: erst wenn alle Athlet*innen alle Tricks bestätigt haben", async () => {
  const content = await createPlan(T, [A, B], "Auto");
  const shareA = await shareOf(content, A);
  const shareB = await shareOf(content, B);

  // A ist fertig → nur A's Kopie wandert nach „Erledigt“.
  await setStatus(shareA.id, "confirmed");
  assert.equal((await shareOf(content, A)).archived_reason, "completed");
  assert.equal((await planRow(content)).archived_at, null);

  // B teilweise, dann vollständig → Plan wird archiviert.
  await setStatus(shareB.id, "confirmed", "t1");
  assert.equal((await planRow(content)).archived_at, null);
  await setStatus(shareB.id, "confirmed", "t2");
  const row = await planRow(content);
  assert.equal(row.archived_reason, "completed");
  assert.equal((await libraryEntry(T, content.id)).archived_reason, "completed");

  // Aus dem archivierten Plan startet kein Training mehr, Bearbeiten ist gesperrt.
  assert.equal(
    await code(db.query(
      "insert into public.training_sessions(created_by,mode,source_key,plan_snapshot) values($1,'group',$2,'{}')",
      [T, `plan:${content.id}`],
    )),
    "55000",
  );
  assert.equal(
    await code(call(T, "select public.training_command($1,'plan_save',$2)", [
      randomUUID(),
      JSON.stringify({ id: content.id, revision: 1, content }),
    ])),
    "55000",
  );
});

test("Pläne ohne zugewiesene Athlet*innen werden nie automatisch archiviert", async () => {
  const content = await createPlan(T, [], "Entwurf");
  assert.equal((await planRow(content)).archived_at, null);
  assert.deepEqual((await libraryEntry(T, content.id)).athletes, []);
});

test("Rechte: Ersteller und Vorstand des Vereins dürfen, Fremde und Athlet*innen nicht", async () => {
  const content = await createPlan(T, [A], "Rechte");
  assert.equal(await code(call(F, "select public.training_plan_archive($1,$2)", [content.id, T])), "42501");
  assert.equal(await code(call(A, "select public.training_plan_archive($1,$2)", [content.id, T])), "42501");
  // Ohne Besitzerangabe gilt der eigene Plan – den gibt es für F nicht.
  assert.equal(await code(call(F, "select public.training_plan_archive($1)", [content.id])), "42501");

  // Vorstand V verwaltet den Verein, in dem T Trainerin ist.
  assert.equal(await code(call(V, "select public.training_plan_archive($1,$2)", [content.id, T])), "ok");
  assert.equal((await planRow(content)).archived_reason, "manual");
  assert.equal((await planRow(content)).archived_by, V);
  assert.ok((await library(V)).plans.some((entry) => entry.key === content.id && !entry.own));
  assert.ok(!(await library(F)).plans.some((entry) => entry.key === content.id));

  // Fremder Verein: V darf F's Plan nicht anfassen.
  const foreign = await createPlan(F, [], "Fremd");
  assert.equal(await code(call(V, "select public.training_plan_delete($1,$2)", [foreign.id, F])), "42501");

  // Vorstand reaktiviert nur bisherige Kopien; neue Zuweisungen macht der Ersteller.
  assert.equal(
    await code(call(V, "select public.training_plan_reactivate($1,$2,$3)", [content.id, T, [B]])),
    "42501",
  );
  assert.equal(await code(call(V, "select public.training_plan_reactivate($1,$2,$3)", [content.id, T, [A]])), "ok");
  assert.equal((await shareOf(content, A)).archived_at, null);
});

test("Reaktivieren: Auswahl neu setzen, ohne Auswahl zurück zu den Entwürfen", async () => {
  const content = await createPlan(T, [A], "Reaktivieren");
  const shareA = await shareOf(content, A);
  await setStatus(shareA.id, "in_progress", "t1");
  await call(T, "select public.training_plan_archive($1)", [content.id]);
  assert.ok((await shareOf(content, A)).archived_at);

  // Nur B ist gewählt: A bleibt erledigt, B erhält eine neue Kopie.
  const [{ r }] = await call(T, "select public.training_plan_reactivate($1,null,$2) r", [content.id, [B]]);
  assert.deepEqual(r, { restored: 0, shared: 1 });
  assert.equal((await planRow(content)).archived_at, null);
  assert.ok((await shareOf(content, A)).archived_at);
  assert.equal((await shareOf(content, B)).archived_at, null);

  // Erneut archivieren und nur A wählen: A bekommt die Kopie samt Fortschritt zurück.
  await call(T, "select public.training_plan_archive($1)", [content.id]);
  const [{ r: again }] = await call(T, "select public.training_plan_reactivate($1,null,$2) r", [content.id, [A]]);
  assert.deepEqual(again, { restored: 1, shared: 0 });
  const restored = await shareOf(content, A);
  assert.equal(restored.id, shareA.id);
  assert.equal(restored.archived_at, null);
  const progress = (await db.query("select status::text from public.training_trick_progress where snapshot_share_id=$1 and trick_id='t1'", [shareA.id])).rows[0];
  assert.equal(progress.status, "in_progress");

  // Ohne Auswahl: Plan aktiv, aber keine aktive Kopie → Entwurf.
  await call(T, "select public.training_plan_archive($1)", [content.id]);
  await call(T, "select public.training_plan_reactivate($1)", [content.id]);
  assert.equal((await planRow(content)).archived_at, null);
  const active = (await db.query(
    "select count(*)::int n from public.training_plan_snapshot_shares where plan_snapshot->>'id'=$1 and archived_at is null",
    [content.id],
  )).rows[0].n;
  assert.equal(active, 0);

  // Zuweisen über „Bearbeiten“ holt eine erledigte Kopie ebenfalls zurück.
  await call(T, "select public.training_assign_plan($1,$2,'{}',false)", [JSON.stringify(content), [A]]);
  assert.equal((await shareOf(content, A)).archived_at, null);
});

test("Archivierte Pläne vererben sich nicht an neue Gruppenmitglieder; keine Nachweise", async () => {
  const group = randomUUID();
  await db.query("insert into public.social_groups values($1,'U14 Archiv',$2)", [group, T]);
  await db.query("insert into public.group_memberships(group_id,user_id,role) values($1,$2,'owner'),($1,$3,'member')", [group, T, A]);
  const content = await createPlan(T, [], "Gruppe");
  await call(T, "select public.training_assign_plan($1,'{}',$2,false)", [JSON.stringify(content), [group]]);
  await call(T, "select public.training_plan_archive($1)", [content.id]);

  await db.query("insert into public.group_memberships(group_id,user_id) values($1,$2)", [group, B]);
  assert.equal(await shareOf(content, B), undefined);

  const shareA = await shareOf(content, A);
  assert.equal(
    await code(db.query("insert into public.training_video_evidence(snapshot_share_id,trick_id,athlete_id) values($1,'t1',$2)", [shareA.id, A])),
    "55000",
  );
  assert.equal(
    await code(db.query(
      "insert into public.training_sessions(created_by,mode,source_key,plan_snapshot) values($1,'self',$2,'{}')",
      [A, `share:${shareA.id}`],
    )),
    "55000",
  );
  // Derselbe Weg über die App (Live-Training-Command) wird ebenfalls abgelehnt.
  assert.equal(
    await code(call(A, "select public.training_command($1,'session_start',$2)", [
      randomUUID(),
      JSON.stringify({ source: "share", share_id: shareA.id, mode: "self", users: [] }),
    ])),
    "55000",
  );
});

test("Löschen: Papierkorb, Athletensicht, Wiederherstellen und endgültige Bereinigung", async () => {
  const content = await createPlan(T, [A, B], "Papierkorb");
  const shareA = await shareOf(content, A);
  const shareB = await shareOf(content, B);
  // A hat Verlauf: ein Trick geübt und eine Session aus dem Plan.
  await setStatus(shareA.id, "in_progress", "t1");
  const version = (await db.query("select id from public.training_plan_versions where training_plan_id=$1", [content.id])).rows[0].id;
  const session = (await db.query(
    "insert into public.training_sessions(created_by,mode,source_key,plan_version_id,plan_snapshot,status,completed_at) values($1,'group',$2,$3,$4,'completed',now()) returning id",
    [T, `plan:${content.id}`, version, JSON.stringify(content)],
  )).rows[0].id;
  const athlete = (await db.query(
    "insert into public.training_athletes(user_id,display_name) values($1,'Alex') on conflict(user_id) do update set display_name=excluded.display_name returning id",
    [A],
  )).rows[0].id;
  await db.query("insert into public.training_session_participants(session_id,athlete_id) values($1,$2)", [session, athlete]);

  const [{ r }] = await call(T, "select public.training_plan_delete($1) r", [content.id]);
  assert.deepEqual(r, { kept: 1, removed: 1 });
  const deleted = await planRow(content);
  assert.ok(deleted.deleted_at);
  assert.equal(deleted.archived_reason, "manual");
  const trash = await libraryEntry(T, content.id);
  assert.ok(trash.deleted_at && trash.purge_at);
  assert.deepEqual(trash.athletes.map((entry) => [entry.id, entry.history]).sort(), [[A, true], [B, false]].sort());

  // A sieht die Kopie weiterhin (erledigt), B nicht mehr; T sieht beide.
  const visible = async (actor) =>
    (await call(actor, "select id from public.training_plan_snapshot_shares where plan_snapshot->>'id'=$1", [content.id])).map((row) => row.id);
  assert.deepEqual(await visible(A), [shareA.id]);
  assert.deepEqual(await visible(B), []);
  assert.equal((await visible(T)).length, 2);

  // Wiederherstellen: zurück ins Archiv, beide Kopien wieder da.
  await call(T, "select public.training_plan_restore($1)", [content.id]);
  const restored = await planRow(content);
  assert.equal(restored.deleted_at, null);
  assert.ok(restored.archived_at);
  assert.deepEqual(await visible(B), [shareB.id]);

  // Erneut löschen, Frist abgelaufen → Wiederherstellen nicht mehr möglich.
  await call(T, "select public.training_plan_delete($1)", [content.id]);
  await db.query("update public.training_plans set deleted_at=now()-interval '31 days' where id=$1", [content.id]);
  await db.query("update public.training_plan_snapshot_shares set deleted_at=now()-interval '31 days' where plan_snapshot->>'id'=$1", [content.id]);
  assert.equal(await code(call(T, "select public.training_plan_restore($1)", [content.id])), "40001");

  // Nur die Service-Rolle darf bereinigen.
  assert.notEqual(await code(call(T, "select public.training_plan_purge_trash()")), "ok");
  const [{ n }] = (await db.query("select public.training_plan_purge_trash() n")).rows;
  assert.ok(n >= 2);
  assert.equal(await planRow(content), undefined);
  assert.equal((await db.query("select count(*)::int n from public.training_plan_versions where training_plan_id=$1", [content.id])).rows[0].n, 0);
  // Kopie ohne Verlauf ist weg, Kopie mit Verlauf samt Fortschritt bleibt.
  assert.equal((await db.query("select count(*)::int n from public.training_plan_snapshot_shares where id=$1", [shareB.id])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from public.training_trick_progress where snapshot_share_id=$1", [shareA.id])).rows[0].n, 2);
  // Session bleibt, nur vom gelöschten Plan gelöst; ihr Planinhalt steckt im Snapshot.
  const kept = (await db.query("select plan_version_id,plan_snapshot->>'title' title from public.training_sessions where id=$1", [session])).rows[0];
  assert.deepEqual(kept, { plan_version_id: null, title: "Papierkorb" });
  // Bereinigte Pläne tauchen nirgends mehr auf.
  assert.equal(await libraryEntry(T, content.id), undefined);
  assert.deepEqual(await visible(A), [shareA.id]);
});

test("Versehentlich angelegter Plan ohne Verlauf wird vollständig entfernt", async () => {
  const content = await createPlan(T, [A], "Blödsinn");
  await call(T, "select public.training_plan_delete($1)", [content.id]);
  await db.query("update public.training_plans set deleted_at=now()-interval '31 days' where id=$1", [content.id]);
  await db.query("update public.training_plan_snapshot_shares set deleted_at=now()-interval '31 days' where plan_snapshot->>'id'=$1", [content.id]);
  await db.query("select public.training_plan_purge_trash()");
  assert.equal(await planRow(content), undefined);
  assert.equal((await db.query("select count(*)::int n from public.training_plan_snapshot_shares where plan_snapshot->>'id'=$1", [content.id])).rows[0].n, 0);
});

test("Altfreigaben ohne gespeicherten Plan: archivieren, löschen und wiederherstellen", async () => {
  const key = "lokal-123";
  await db.query(
    "insert into public.training_plan_snapshot_shares(shared_by,target_type,recipient_user_id,title,plan_snapshot) values($1,'person',$2,'Alter Plan',$3)",
    [T, A, JSON.stringify({ ...plan(key, "Alter Plan"), id: key })],
  );
  const entry = await libraryEntry(T, key);
  assert.equal(entry.legacy, true);
  assert.equal(entry.archived_at, null);

  await call(T, "select public.training_plan_archive($1)", [key]);
  assert.equal((await libraryEntry(T, key)).archived_reason, "manual");
  // Neue Athlet*innen gibt es bei Altfreigaben nicht (kein gespeicherter Plan).
  assert.equal(await code(call(T, "select public.training_plan_reactivate($1,null,$2)", [key, [B]])), "42501");
  await call(T, "select public.training_plan_reactivate($1,null,$2)", [key, [A]]);
  assert.equal((await libraryEntry(T, key)).archived_at, null);

  await call(T, "select public.training_plan_delete($1)", [key]);
  assert.ok((await libraryEntry(T, key)).deleted_at);
  await call(T, "select public.training_plan_restore($1)", [key]);
  assert.equal((await libraryEntry(T, key)).deleted_at, null);
  // Fremde Altfreigaben sind tabu.
  assert.equal(await code(call(F, "select public.training_plan_delete($1,$2)", [key, T])), "42501");
});
