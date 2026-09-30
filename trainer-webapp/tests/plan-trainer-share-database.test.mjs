import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Trainingspläne mit anderen Trainer*innen teilen (Migration 20260930120000).
// Personen: Trainerin T und Trainer K (Verein CLUB), Vorstand V (CLUB),
// fremder Trainer F (anderer Verein), Athletin A (CLUB, mit T verbunden),
// Bundestrainer B (Verband, kein Verein).
const T = "00000000-0000-4000-8000-000000000001";
const F = "00000000-0000-4000-8000-000000000002";
const V = "00000000-0000-4000-8000-000000000003";
const K = "00000000-0000-4000-8000-000000000004";
const B = "00000000-0000-4000-8000-000000000005";
const A = "00000000-0000-4000-8000-00000000000a";
const CLUB = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CLUB = "00000000-0000-4000-8000-0000000000c2";
const FEDERATION = "00000000-0000-4000-8000-0000000000f1";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
let db;

before(async () => {
  db = new PGlite();
  await db.exec(await read("./fixtures/plan-hub-base.sql"));
  // Produktiv vorhandene Nachweis-Tabelle (minimal), Service-Rolle und Kontostatus-Helfer.
  await db.exec(`
    create role service_role;
    create table public.training_video_evidence(
      id uuid primary key default gen_random_uuid(),
      snapshot_share_id uuid not null references public.training_plan_snapshot_shares(id) on delete cascade,
      trick_id text not null, athlete_id uuid not null references public.profiles(id));
    create table private.inactive_accounts(user_id uuid primary key);
    create function private.account_is_active(target uuid) returns boolean language sql stable as $$
      select target is not null and not exists(select 1 from private.inactive_accounts where user_id=target) $$;
  `);
  for (const file of [
    "20260923202413_step_5_training_sessions.sql",
    "20260924132843_step_6_session_recaps.sql",
    "20260929100000_plan_hub_rights_groups.sql",
    "20260929130000_live_training_redesign.sql",
    "20260929130100_live_training_recap_lines.sql",
    "20260930100000_plan_archive_trash.sql",
    "20260930120000_plan_trainer_shares.sql",
  ]) {
    await db.exec(await read(`../supabase/migrations/${file}`));
  }
  await db.query(
    `insert into public.profiles values
     ($1,'Tina Trainer','trainer'),($2,'Frank Fremd','trainer'),($3,'Vera Vorstand','organization_staff'),
     ($4,'Kai Kollege','trainer'),($5,'Bruno Bund','unspecified'),($6,'Alex Athlet','athlete')`,
    [T, F, V, K, B, A],
  );
  await db.query(
    `insert into public.relationships(user_one_id,user_two_id,relationship_type) values
     (least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),'trainer_athlete')`,
    [A, T],
  );
  await db.query(
    `insert into public.organizations values
     ($1,null,'SKSB Augsburg','club'),($2,null,'Rollbrett Kiel','club'),($3,null,'Bundesverband','federal')`,
    [CLUB, OTHER_CLUB, FEDERATION],
  );
  await db.query(
    `insert into public.organization_memberships(organization_id,user_id,role) values
     ($1,$2,'club_trainer'),($1,$3,'club_trainer'),($1,$4,'club_board'),($1,$5,'athlete'),
     ($6,$7,'club_trainer'),($8,$9,'federal_trainer')`,
    [CLUB, T, K, V, A, OTHER_CLUB, F, FEDERATION, B],
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

/** Plan von `owner` mit persönlichen Feldern, optional an Athlet*innen zugewiesen. */
async function createPlan(owner, { title = "Street Basics", athletes = [] } = {}) {
  const id = randomUUID();
  const content = {
    id,
    title,
    category: "Street",
    level: "Einsteiger",
    description: "Grundlagen",
    deadline: "2026-12-01",
    assignedGroups: ["g1"],
    assignedAthletes: athletes,
    sharedTrainers: [T],
    goals: [{ id: "z1", title: "Sauber landen", cadence: "weekly", completed: true }],
    tricks: [
      { id: "t1", name: "Ollie", targetValue: "5×", trainerNote: "Knie beugen", athleteId: A, status: "confirmed" },
      { id: "t2", name: "Kickflip", athleteId: A, status: "in_progress", confirmedAt: "2026-09-01" },
    ],
  };
  await call(owner, "select public.training_command($1,'plan_save',$2)", [
    randomUUID(),
    JSON.stringify({ id, revision: 0, content }),
  ]);
  if (athletes.length) {
    await call(owner, "select public.training_assign_plan($1,$2,'{}',false)", [JSON.stringify(content), athletes]);
  }
  return content;
}
const share = (actor, planId, recipients = [], clubs = []) =>
  call(actor, "select public.training_share_plan_with_trainers($1,$2,$3) r", [planId, recipients, clubs]);
const inbox = async (actor) => (await call(actor, "select public.training_shared_plans() r"))[0].r;
const targets = async (actor, query) => (await call(actor, "select public.training_share_targets($1) r", [query]))[0].r;
const accept = async (actor, shareId) =>
  (await call(actor, "select public.training_accept_shared_plan($1) r", [shareId]))[0].r;

/* ------------------------------- Tests ------------------------------ */

test("Empfängersuche: nur Trainer*innen und Vorstand, vereinsübergreifend, ohne eigene Person", async () => {
  const byName = await targets(T, "fra");
  assert.deepEqual(byName.people.map((p) => [p.name, p.organization]), [["Frank Fremd", "Rollbrett Kiel"]]);
  // Suche nach Vereinsname findet dessen Trainer*innen.
  assert.deepEqual((await targets(T, "Kiel")).people.map((p) => p.id), [F]);
  // Bundestrainer (Rolle im Verband) ist auffindbar; Athlet*innen und die eigene Person nicht.
  assert.deepEqual((await targets(T, "Bruno")).people.map((p) => p.organization), ["Bundesverband"]);
  assert.deepEqual((await targets(T, "Alex")).people, []);
  assert.deepEqual((await targets(T, "Tina")).people, []);
  // Unter zwei Zeichen keine Personenliste; LIKE-Platzhalter werden nicht ausgewertet.
  assert.deepEqual((await targets(T, "f")).people, []);
  assert.deepEqual((await targets(T, "%%")).people, []);
  // Eigener Verein: Kai und Vera (nicht Tina selbst, nicht die Athletin).
  assert.deepEqual((await targets(T, "")).clubs.map((c) => [c.name, c.count]), [["SKSB Augsburg", 2]]);
  // Inaktive Konten erscheinen nicht.
  await db.query("insert into private.inactive_accounts values($1)", [F]);
  assert.deepEqual((await targets(T, "Frank")).people, []);
  await db.query("delete from private.inactive_accounts where user_id=$1", [F]);
});

test("Nur Trainer*innen und Vorstand dürfen suchen, teilen und annehmen", async () => {
  const content = await createPlan(T);
  assert.equal(await code(targets(A, "Frank")), "42501");
  assert.equal(await code(share(A, content.id, [F])), "42501");
  // Athlet*innen sind keine zulässigen Empfänger.
  assert.equal(await code(share(T, content.id, [A])), "42501");
  // Fremde Pläne dürfen nicht geteilt werden – auch nicht vom Vorstand.
  assert.equal(await code(share(F, content.id, [K])), "42501");
  assert.equal(await code(share(V, content.id, [K])), "42501");
  // Kein direkter Tabellenzugriff, weder lesend noch schreibend.
  assert.equal(await code(call(T, "select * from public.training_plan_trainer_shares")), "42501");
  assert.equal(
    await code(
      call(T, "insert into public.training_plan_trainer_shares(shared_by,recipient_user_id,title,plan_snapshot) values($1,$2,'x','{}')", [T, F]),
    ),
    "42501",
  );
});

test("Teilen überträgt nur Planinhalt und benachrichtigt die Empfänger*innen", async () => {
  const content = await createPlan(T, { title: "Vereinsübergreifend", athletes: [A] });
  const [{ r }] = await share(T, content.id, [F, B]);
  assert.equal(r.shared, 2);

  const [offer] = await inbox(F);
  assert.equal(offer.title, "Vereinsübergreifend");
  assert.equal(offer.sender_name, "Tina Trainer");
  assert.equal(offer.sender_organization, "SKSB Augsburg");
  const snapshot = offer.content;
  for (const key of ["id", "assignedAthletes", "assignedGroups", "sharedTrainers", "deadline", "author"]) {
    assert.equal(key in snapshot, false, `${key} darf nicht geteilt werden`);
  }
  assert.equal(snapshot.level, "Einsteiger");
  assert.equal(snapshot.goals[0].completed, false);
  assert.deepEqual(
    snapshot.tricks.map((t) => [t.name, t.athleteId, t.status, t.targetValue ?? null, "confirmedAt" in t]),
    [
      ["Ollie", "", "not_started", "5×", false],
      ["Kickflip", "", "not_started", null, false],
    ],
  );
  // Ersteller sieht keine Empfängerliste; Unbeteiligte sehen nichts.
  assert.deepEqual(await inbox(T), []);
  assert.deepEqual(await inbox(K), []);

  const note = (
    await db.query("select * from public.notifications where user_id=$1 and actor_user_id=$2 order by id", [F, T])
  ).rows.at(-1);
  assert.equal(note.link, "/trainingsplaene?geteilt=1");
  assert.match(note.message, /Tina Trainer hat „Vereinsübergreifend“ mit dir geteilt/);
});

test("Erneut teilen ersetzt einen offenen Vorschlag statt ihn zu verdoppeln", async () => {
  const content = await createPlan(T, { title: "Fassung 1" });
  await share(T, content.id, [K]);
  await call(T, "select public.training_command($1,'plan_save',$2)", [
    randomUUID(),
    JSON.stringify({ id: content.id, revision: 1, content: { ...content, title: "Fassung 2" } }),
  ]);
  await share(T, content.id, [K]);
  const offers = (await inbox(K)).filter((entry) => entry.title.startsWith("Fassung"));
  assert.deepEqual(offers.map((entry) => entry.title), ["Fassung 2"]);
});

test("Annehmen legt einen eigenen Entwurf an; Vorlage und Ersteller bleiben getrennt", async () => {
  const content = await createPlan(T, { title: "Zum Annehmen", athletes: [A] });
  await share(T, content.id, [F]);
  const offer = (await inbox(F)).find((entry) => entry.title === "Zum Annehmen");
  // Nur die empfangende Person darf annehmen.
  assert.equal(await code(accept(K, offer.id)), "P0002");

  const planId = await accept(F, offer.id);
  assert.notEqual(planId, content.id);
  const row = (await db.query("select * from public.training_plans where id=$1", [planId])).rows[0];
  assert.equal(row.created_by, F);
  assert.equal(row.organization_id, null);
  const version = (
    await db.query("select * from public.training_plan_versions where training_plan_id=$1", [planId])
  ).rows;
  assert.equal(version.length, 1);
  assert.equal(version[0].content.status, "draft");
  assert.equal(version[0].content.author, "Frank Fremd");
  assert.deepEqual(version[0].content.assignedAthletes, []);
  assert.equal("sourcePlanId" in version[0].content, false);

  // Vorschlag ist weg; zweites Annehmen scheitert.
  assert.equal((await inbox(F)).some((entry) => entry.id === offer.id), false);
  assert.equal(await code(accept(F, offer.id)), "P0002");

  // Kopie frei bearbeitbar (neue Version), Vorlage unverändert.
  await call(F, "select public.training_command($1,'plan_save',$2)", [
    randomUUID(),
    JSON.stringify({ id: planId, revision: 1, content: { ...version[0].content, title: "Meine Fassung" } }),
  ]);
  const original = (
    await db.query("select title from public.training_plans where id=$1", [content.id])
  ).rows[0];
  assert.equal(original.title, "Zum Annehmen");
  // Ersteller hat keinen Zugriff auf die Kopie.
  assert.equal(await code(call(T, "select public.training_share_plan_with_trainers($1,$2,'{}')", [planId, [K]])), "42501");
  assert.equal(
    (await call(T, "select id from public.training_plans where id=$1", [planId])).length,
    0,
  );
});

test("Ablehnen entfernt den Vorschlag ohne Spur beim Ersteller", async () => {
  const content = await createPlan(T, { title: "Zum Ablehnen" });
  await share(T, content.id, [K]);
  const offer = (await inbox(K)).find((entry) => entry.title === "Zum Ablehnen");
  assert.equal(await code(call(F, "select public.training_decline_shared_plan($1)", [offer.id])), "P0002");
  await call(K, "select public.training_decline_shared_plan($1)", [offer.id]);
  assert.equal((await inbox(K)).some((entry) => entry.id === offer.id), false);
  assert.equal(
    (await db.query("select count(*)::int n from public.training_plan_trainer_shares where id=$1", [offer.id])).rows[0].n,
    0,
  );
  // Überarbeitete Fassung kann danach erneut geteilt werden.
  await share(T, content.id, [K]);
  assert.equal((await inbox(K)).filter((entry) => entry.title === "Zum Ablehnen").length, 1);
});

test("Vereinsauswahl erreicht alle Trainer*innen und den Vorstand des eigenen Vereins", async () => {
  const content = await createPlan(T, { title: "Für den Verein" });
  const [{ r }] = await share(T, content.id, [], [CLUB]);
  assert.equal(r.shared, 2);
  for (const person of [K, V]) {
    assert.equal((await inbox(person)).some((entry) => entry.title === "Für den Verein"), true);
  }
  assert.equal((await inbox(A)).length, 0);
  // Fremder Verein ist nicht wählbar.
  assert.equal(await code(share(T, content.id, [], [OTHER_CLUB])), "42501");
});

test("Archivierte Pläne sind teilbar, Pläne im Papierkorb und Übergrößen nicht", async () => {
  const archived = await createPlan(T, { title: "Archiviert" });
  await call(T, "select public.training_plan_archive($1)", [archived.id]);
  assert.equal(await code(share(T, archived.id, [F])), "ok");

  const trashed = await createPlan(T, { title: "Papierkorb" });
  await call(T, "select public.training_plan_delete($1)", [trashed.id]);
  assert.equal(await code(share(T, trashed.id, [F])), "42501");

  const many = Array.from({ length: 51 }, () => randomUUID());
  assert.equal(await code(share(T, archived.id, many)), "P0001");
  assert.equal(await code(share(T, archived.id, [])), "P0001");
});
