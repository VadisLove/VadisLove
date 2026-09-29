import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Personen: Athlet*innen A/B (mit Trainer T verbunden), X ohne Verbindung,
// C im Verein ohne Trainer, Vorstand V des Vereins, fremder Trainer F.
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const X = "00000000-0000-4000-8000-00000000000d";
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
  for (const file of [
    "20260923202413_step_5_training_sessions.sql",
    "20260924132843_step_6_session_recaps.sql",
    "20260929100000_plan_hub_rights_groups.sql",
  ]) {
    await db.exec(await read(`../supabase/migrations/${file}`));
  }
  await db.query(
    `insert into public.profiles values
     ($1,'Alex Athlet','athlete'),($2,'Bea Athlet','athlete'),($3,'Cem Verein','athlete'),($4,'Xenia Fremd','athlete'),
     ($5,'Tina Trainer','trainer'),($6,'Frank Fremd','trainer'),($7,'Vera Vorstand','organization_staff')`,
    [A, B, C, X, T, F, V],
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

const as = (id, fn) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
const call = async (id, sql, params = []) => (await as(id, (tx) => tx.query(sql, params))).rows;
const plan = (id, title = "Street Basics") => ({
  id,
  title,
  tricks: [
    { id: "t1", name: "Ollie" },
    { id: "t2", name: "Kickflip" },
  ],
});
const savePlan = (actor, content) =>
  call(actor, "select public.training_command($1,'plan_save',$2) r", [
    randomUUID(),
    JSON.stringify({ id: content.id, revision: 0, content }),
  ]);
const code = async (promise) => {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error.code ?? error.message;
  }
};

test("Erstellrecht: Athlet*in ohne Recht wird serverseitig abgelehnt, Trainer*in kann es vergeben", async () => {
  assert.equal(await code(savePlan(A, plan(randomUUID()))), "42501");
  // Weder die Person selbst noch fremde Trainer dürfen das Recht setzen.
  assert.equal(await code(call(A, "select public.training_set_plan_permission($1,true)", [A])), "42501");
  assert.equal(await code(call(F, "select public.training_set_plan_permission($1,true)", [A])), "42501");
  // Direkter Tabellenzugriff ist gesperrt.
  assert.notEqual(
    await code(call(A, "insert into public.athlete_plan_permissions(athlete_id,can_create_plans) values($1,true)", [A])),
    "ok",
  );
  await call(T, "select public.training_set_plan_permission($1,true)", [A]);
  assert.equal(await code(savePlan(A, plan(randomUUID()))), "ok");
  const [{ r: context }] = await call(A, "select public.training_plan_hub_context() r");
  assert.equal(context.can_create_plans, true);
  // Trainer*innen und Vorstand dürfen immer.
  assert.equal(await code(savePlan(T, plan(randomUUID()))), "ok");
  assert.equal(await code(savePlan(V, plan(randomUUID()))), "ok");
  // Vorstand darf Vereinsathlet*innen berechtigen, aber keine fremden.
  assert.equal(await code(call(V, "select public.training_set_plan_permission($1,true)", [C])), "ok");
  assert.equal(await code(call(V, "select public.training_set_plan_permission($1,true)", [X])), "42501");
});

test("Anrede kommt aus der Registrierung und bleibt änderbar", async () => {
  const id = randomUUID();
  await db.query("insert into auth.users values($1,$2)", [id, JSON.stringify({ salutation: "w" })]);
  await db.query("insert into public.profiles(id,display_name,account_type) values($1,'Neu','athlete')", [id]);
  const invalid = randomUUID();
  await db.query("insert into auth.users values($1,$2)", [invalid, JSON.stringify({ salutation: "x" })]);
  await db.query("insert into public.profiles(id,display_name,account_type) values($1,'Neu 2','athlete')", [invalid]);
  const rows = (await db.query("select id,salutation from public.profiles where id in ($1,$2)", [id, invalid])).rows;
  assert.equal(rows.find((row) => row.id === id).salutation, "w");
  assert.equal(rows.find((row) => row.id === invalid).salutation, null);
  assert.notEqual(await code(db.query("update public.profiles set salutation='q' where id=$1", [id])), "ok");
});

test("Gruppenzuweisung: verbundene Mitglieder erhalten den Plan, neue Mitglieder erben ihn", async () => {
  const group = randomUUID();
  await db.query("insert into public.social_groups values($1,'U14 Augsburg',$2)", [group, T]);
  await db.query(
    "insert into public.group_memberships(group_id,user_id,role) values($1,$2,'owner'),($1,$3,'member'),($1,$4,'member')",
    [group, T, A, X],
  );
  const content = plan(randomUUID(), "Gruppenplan");
  await savePlan(T, content);
  const [{ r: context }] = await call(T, "select public.training_plan_hub_context() r");
  const listed = context.groups.find((entry) => entry.id === group);
  // X ist Mitglied, aber nicht verbunden – zählt nicht mit.
  assert.deepEqual(listed.athlete_ids, [A]);

  const [{ r }] = await call(T, "select public.training_assign_plan($1,'{}',$2,false) r", [JSON.stringify(content), [group]]);
  assert.equal(r.shared, 1);
  const recipients = async () =>
    (await db.query("select recipient_user_id from public.training_plan_snapshot_shares where plan_snapshot->>'id'=$1 order by 1", [content.id])).rows.map(
      (row) => row.recipient_user_id,
    );
  assert.deepEqual(await recipients(), [A]);
  // Erneutes Zuweisen erzeugt keine Doppelungen.
  const [{ r: again }] = await call(T, "select public.training_assign_plan($1,$2,$3,false) r", [JSON.stringify(content), [A], [group]]);
  assert.equal(again.shared, 0);
  // B tritt der Gruppe bei und erbt den Plan samt Fortschrittszeilen.
  await db.query("insert into public.group_memberships(group_id,user_id) values($1,$2)", [group, B]);
  assert.deepEqual(await recipients(), [A, B].sort());
  const progress = await call(B, "select count(*)::int n from public.training_trick_progress where athlete_id=$1", [B]);
  assert.equal(progress[0].n, 2);
  // Fremde Gruppen und fremde Personen werden abgelehnt.
  const foreign = randomUUID();
  await db.query("insert into public.social_groups values($1,'Fremd',$2)", [foreign, F]);
  await db.query("insert into public.group_memberships(group_id,user_id,role) values($1,$2,'owner')", [foreign, F]);
  assert.equal(await code(call(T, "select public.training_assign_plan($1,'{}',$2,false)", [JSON.stringify(content), [foreign]])), "42501");
  assert.equal(await code(call(T, "select public.training_assign_plan($1,$2,'{}',false)", [JSON.stringify(content), [X]])), "42501");
  // Nur eigene Pläne dürfen zugewiesen werden.
  assert.equal(await code(call(F, "select public.training_assign_plan($1,'{}','{}',false)", [JSON.stringify(content)])), "42501");
});

test("Vorstand: alle Gruppen im Verein, neue Vereinsmitglieder und Vereinsvorlagen", async () => {
  const content = plan(randomUUID(), "Ramp Einstieg");
  await savePlan(V, content);
  // Trainer*innen haben keine Vereinsoption.
  const trainerPlan = plan(randomUUID(), "Trainerplan");
  await savePlan(T, trainerPlan);
  assert.equal(await code(call(T, "select public.training_assign_plan($1,'{}','{}',true)", [JSON.stringify(trainerPlan)])), "42501");
  assert.equal(await code(call(T, "select public.training_set_club_template($1,true)", [trainerPlan.id])), "42501");

  const [{ r: context }] = await call(V, "select public.training_plan_hub_context() r");
  assert.equal(context.is_board, true);
  assert.deepEqual(context.clubs.map((club) => club.id), [CLUB]);
  const [{ r }] = await call(V, "select public.training_assign_plan($1,'{}','{}',true) r", [JSON.stringify(content)]);
  assert.equal(r.shared, 1);
  const newcomer = randomUUID();
  await db.query("insert into public.profiles values($1,'Neu Verein','athlete')", [newcomer]);
  await db.query("insert into public.organization_memberships(organization_id,user_id,role) values($1,$2,'athlete')", [CLUB, newcomer]);
  const shared = (await db.query("select recipient_user_id from public.training_plan_snapshot_shares where plan_snapshot->>'id'=$1", [content.id])).rows;
  assert.deepEqual(shared.map((row) => row.recipient_user_id).sort(), [C, newcomer].sort());

  await call(V, "select public.training_set_club_template($1,true)", [content.id]);
  // Trainer*in desselben Vereins sieht die Vorlage, fremder Verein nicht, Athlet*innen nicht.
  const [{ r: trainerContext }] = await call(T, "select public.training_plan_hub_context() r");
  assert.deepEqual(trainerContext.templates.map((entry) => entry.title), ["Ramp Einstieg"]);
  assert.equal(trainerContext.templates[0].content.tricks.length, 2);
  const [{ r: foreignContext }] = await call(F, "select public.training_plan_hub_context() r");
  assert.equal(foreignContext.templates.length, 0);
  const [{ r: athleteContext }] = await call(C, "select public.training_plan_hub_context() r");
  assert.equal(athleteContext.templates.length, 0);
  const [{ r: boardContext }] = await call(V, "select public.training_plan_hub_context() r");
  assert.deepEqual(boardContext.club_template_ids, [content.id]);
});

test("Mit dem Trainer teilen: Trainer*in liest den Plan, fremde nicht; Benachrichtigung an Trainer*in", async () => {
  const content = plan(randomUUID(), "Jonas’ Curb-Plan");
  await savePlan(A, content);
  const [{ r: share }] = await call(A, "select public.training_share_own_plan($1) r", [JSON.stringify(content)]);
  const [{ r: repeat }] = await call(A, "select public.training_share_own_plan($1) r", [JSON.stringify(content)]);
  assert.equal(repeat, share);
  const notified = (await db.query("select user_id from public.notifications where message like '%Curb-Plan%'")).rows;
  assert.deepEqual(notified.map((row) => row.user_id), [T]);
  assert.equal((await call(T, "select count(*)::int n from public.training_plan_snapshot_shares where id=$1", [share]))[0].n, 1);
  assert.equal((await call(F, "select count(*)::int n from public.training_plan_snapshot_shares where id=$1", [share]))[0].n, 0);
  assert.equal((await call(T, "select count(*)::int n from public.training_trick_progress where snapshot_share_id=$1", [share]))[0].n, 2);
  // Fremde Pläne können nicht als eigene geteilt werden.
  assert.equal(await code(call(B, "select public.training_share_own_plan($1)", [JSON.stringify(content)])), "42501");
});

async function completedSession(athleteUser, trickName, landed, missed) {
  const session = randomUUID();
  const participant = randomUUID();
  const exercise = randomUUID();
  const athlete = (await db.query(
    "insert into public.training_athletes(user_id,display_name) values($1,'x') on conflict(user_id) do update set display_name=excluded.display_name returning id",
    [athleteUser],
  )).rows[0].id;
  await db.query(
    "insert into public.training_sessions(id,created_by,mode,source_key,plan_snapshot,status,completed_at) values($1,$2,'individual',$3,'{}','completed',now())",
    [session, T, `test:${session}`],
  );
  await db.query("insert into public.training_session_participants(id,session_id,athlete_id) values($1,$2,$3)", [participant, session, athlete]);
  await db.query(
    "insert into public.training_session_exercises(id,session_id,source_trick_id,content,sort_order) values($1,$2,'t1',$3,0)",
    [exercise, session, JSON.stringify({ name: trickName })],
  );
  for (let i = 0; i < landed + missed; i += 1) {
    await db.query(
      "insert into public.training_session_attempts(session_id,participant_id,exercise_id,landed,recorded_by) values($1,$2,$3,$4,$5)",
      [session, participant, exercise, i < landed, T],
    );
  }
  return participant;
}

test("Rückblick: „Nur Trainer“-Notizen bleiben für Athlet*innen unsichtbar", async () => {
  const participant = await completedSession(B, "Heelflip", 3, 1);
  await call(T, "select public.training_recap_add_review($1,$2,null,'hint','Nur intern',null,'coaches')", [randomUUID(), participant]);
  await call(T, "select public.training_recap_add_review($1,$2,null,'hint','Für Bea',null,'athlete')", [randomUUID(), participant]);
  // Athlet*innen dürfen keine Trainer-Notiz anlegen.
  assert.equal(
    await code(call(B, "select public.training_recap_add_review($1,$2,null,'hint','x',null,'coaches')", [randomUUID(), participant])),
    "P0001",
  );
  const bodies = async (id) =>
    (await call(id, "select public.training_recaps() r"))[0].r
      .filter((recap) => recap.participant_id === participant)
      .flatMap((recap) => recap.reviews.map((review) => `${review.body}:${review.visibility}`))
      .sort();
  assert.deepEqual(await bodies(T), ["Für Bea:athlete", "Nur intern:coaches"]);
  assert.deepEqual(await bodies(B), ["Für Bea:athlete"]);
});

test("Rückblick: Direkt bestätigen nur bei Quote ≥ 80 % und nur durch Trainer*in", async () => {
  const content = plan(randomUUID(), "Bestätigen");
  await savePlan(T, content);
  await call(T, "select public.training_assign_plan($1,$2,'{}',false)", [JSON.stringify(content), [A]]);
  const share = (await db.query("select id from public.training_plan_snapshot_shares where plan_snapshot->>'id'=$1 and recipient_user_id=$2", [content.id, A])).rows[0].id;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  await completedSession(A, "Kickflip", 7, 3); // 70 %
  assert.equal(
    await code(call(T, "select public.training_confirm_from_recap($1,'t2',$2)", [share, since])),
    "P0001",
  );
  await completedSession(A, "Kickflip", 10, 0); // gesamt 17 / 20 = 85 %
  assert.equal(await code(call(A, "select public.training_confirm_from_recap($1,'t2',$2)", [share, since])), "42501");
  assert.equal(await code(call(F, "select public.training_confirm_from_recap($1,'t2',$2)", [share, since])), "42501");
  await call(T, "select public.training_confirm_from_recap($1,'t2',$2)", [share, since]);
  const [row] = (await db.query("select status::text,confirmed_by,confirmed_source from public.training_trick_progress where snapshot_share_id=$1 and trick_id='t2'", [share])).rows;
  assert.deepEqual(row, { status: "confirmed", confirmed_by: T, confirmed_source: "recap" });
  // Bereits bestätigt: kein zweites Mal.
  assert.equal(await code(call(T, "select public.training_confirm_from_recap($1,'t2',$2)", [share, since])), "P0001");
});
