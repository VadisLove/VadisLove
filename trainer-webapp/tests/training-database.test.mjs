import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "00000000-0000-0000-0000-000000000001",
  B = "00000000-0000-0000-0000-000000000002",
  T = "00000000-0000-0000-0000-000000000003",
  X = "00000000-0000-0000-0000-000000000004";
let db;
before(async () => {
  if (process.env.TRAINING_TEST_DATABASE_URL) {
    const url = process.env.TRAINING_TEST_DATABASE_URL;
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
    const { default: pg } = await import(process.env.TRAINING_NATIVE_PG_MODULE);
    const pool = new pg.Pool({ connectionString: url });
    db = {
      query: (...args) => pool.query(...args),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await fn({
            query: (...args) => client.query(...args),
            exec: (sql) => client.query(sql),
          });
          await client.query("commit");
          return result;
        } catch (error) {
          await client.query("rollback");
          throw error;
        } finally {
          client.release();
        }
      },
    };
  } else db = new PGlite();
  await db.exec(
    await readFile(
      new URL("./fixtures/training-base.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260923202413_step_5_training_sessions.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query(
    "insert into public.profiles values($1,'Alex','athlete'),($2,'Kim','athlete'),($3,'Trainer','trainer'),($4,'Fremd','athlete')",
    [A, B, T, X],
  );
  await db.query(
    "insert into public.relationships values($1,$2,true),($1,$3,true)",
    [T, A, B],
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
      tx.query("select public.training_command($1,$2,$3) result", [
        key,
        op,
        JSON.stringify(payload),
      ]),
    )
  ).rows[0].result;
const content = (title = "Basics") => ({
  title,
  description: "Ziel",
  tricks: [{ id: "ollie-stable", name: "Ollie" }],
});
async function plan(actor = A) {
  const id = randomUUID();
  const saved = await cmd(actor, "plan_save", {
    id,
    revision: 0,
    content: content(),
  });
  return { id, version: saved.version_id };
}
async function session(actor = A, mode = "self", users = []) {
  const p = await plan(actor);
  const result = await cmd(actor, "session_start", {
    source: "plan",
    plan_id: p.id,
    version_id: p.version,
    mode,
    users,
  });
  return { id: result.session_id, plan: p };
}
async function state(id) {
  return {
    s: (
      await db.query("select * from public.training_sessions where id=$1", [id])
    ).rows[0],
    p: (
      await db.query(
        "select * from public.training_session_participants where session_id=$1 order by id",
        [id],
      )
    ).rows,
    e: (
      await db.query(
        "select * from public.training_session_exercises where session_id=$1",
        [id],
      )
    ).rows[0],
  };
}
async function mutate(actor, id, op, extra = {}) {
  const { s } = await state(id);
  return cmd(actor, op, { session_id: id, revision: s.revision, ...extra });
}
test("Plan persistiert ohne Verein; Versionen und Sessionstand bleiben unverändert", async () => {
  const { id, plan: p } = await session();
  await cmd(A, "plan_save", {
    id: p.id,
    revision: 1,
    content: content("Geändert"),
  });
  const { s } = await state(id);
  assert.equal(s.plan_snapshot.title, "Basics");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.training_plan_versions where training_plan_id=$1",
        [p.id],
      )
    ).rows[0].n,
    2,
  );
  await assert.rejects(
    db.query(
      "update public.training_plan_versions set content='{}' where id=$1",
      [p.version],
    ),
    /TRAINING_IMMUTABLE/,
  );
});
test("Idempotenz: Plan, Start und Versuch werden bei Wiederholung nur einmal gespeichert", async () => {
  const id = randomUUID(),
    key = randomUUID(),
    payload = { id, revision: 0, content: content() };
  const p = await cmd(A, "plan_save", payload, key);
  assert.deepEqual(await cmd(A, "plan_save", payload, key), p);
  await assert.rejects(
    cmd(A, "plan_save", { ...payload, content: content("anders") }, key),
    /TRAINING_REQUEST_REUSED/,
  );
  const start = {
    source: "plan",
    plan_id: id,
    version_id: p.version_id,
    mode: "self",
  };
  const first = await cmd(A, "session_start", start);
  assert.deepEqual(await cmd(A, "session_start", start), first);
  const st = await state(first.session_id);
  const attempt = {
    session_id: st.s.id,
    revision: 1,
    participant_id: st.p[0].id,
    exercise_id: st.e.id,
    landed: true,
  };
  const req = randomUUID();
  await cmd(A, "attempt", attempt, req);
  await cmd(A, "attempt", attempt, req);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.training_session_attempts where session_id=$1",
        [st.s.id],
      )
    ).rows[0].n,
    1,
  );
});
test("Revision schützt konkurrierende Änderungen; Korrektur und Abschluss sperren spätere Eingaben", async () => {
  const { id } = await session();
  const st = await state(id);
  const payload = { session_id: id, revision: 1, note: "eins" };
  const results = await Promise.allSettled([
    cmd(A, "session_note", payload),
    cmd(A, "session_note", { ...payload, note: "zwei" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    results.find((r) => r.status === "rejected").reason.message,
    /TRAINING_CONFLICT/,
  );
  await mutate(A, id, "attempt", {
    participant_id: st.p[0].id,
    exercise_id: st.e.id,
    landed: false,
  });
  await mutate(A, id, "undo", {
    participant_id: st.p[0].id,
    exercise_id: st.e.id,
  });
  assert.ok(
    (
      await db.query(
        "select undone_at from public.training_session_attempts where session_id=$1",
        [id],
      )
    ).rows[0].undone_at,
  );
  await mutate(A, id, "timer", { exercise_id: st.e.id, action: "start" });
  await mutate(A, id, "complete");
  assert.equal((await state(id)).s.status, "completed");
  assert.equal((await state(id)).e.timer_started_at, null);
  await assert.rejects(
    mutate(A, id, "session_note", { note: "später" }),
    /TRAINING_COMPLETED/,
  );
});
test("Fremde Konten, fremde Pläne und direkter Schreibzugriff sind gesperrt", async () => {
  const { id, plan: p } = await session();
  await assert.rejects(
    mutate(X, id, "session_note", { note: "fremd" }),
    /TRAINING_FORBIDDEN/,
  );
  assert.equal(
    (
      await user(X, (tx) =>
        tx.query("select * from public.training_sessions where id=$1", [id]),
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    cmd(X, "session_start", {
      source: "plan",
      plan_id: p.id,
      version_id: p.version,
      mode: "self",
    }),
    /TRAINING_FORBIDDEN/,
  );
  await assert.rejects(
    user(A, (tx) =>
      tx.query(
        "update public.training_sessions set note='direkt' where id=$1",
        [id],
      ),
    ),
    /permission denied/,
  );
  await assert.rejects(
    user(A, (tx) =>
      tx.query(
        "insert into public.training_session_attempts(session_id) values($1)",
        [id],
      ),
    ),
    /permission denied/,
  );
});
test("Gruppe: Zuordnung erforderlich, Anwesenheit unabhängig, ID-Mischung zurückgewiesen", async () => {
  const { id } = await session(T, "group", [A, B]);
  const st = await state(id);
  await mutate(T, id, "attendance", {
    participant_id: st.p[0].id,
    present: false,
  });
  await assert.rejects(
    mutate(T, id, "attempt", {
      participant_id: st.p[0].id,
      exercise_id: st.e.id,
      landed: true,
    }),
    /TRAINING_INVALID/,
  );
  const another = await session();
  const other = await state(another.id);
  await assert.rejects(
    mutate(T, id, "attempt", {
      participant_id: other.p[0].id,
      exercise_id: st.e.id,
      landed: true,
    }),
    /TRAINING_INVALID/,
  );
  const p = await plan(T);
  await assert.rejects(
    cmd(T, "session_start", {
      source: "plan",
      plan_id: p.id,
      version_id: p.version,
      mode: "group",
      users: [X],
    }),
    /TRAINING_FORBIDDEN/,
  );
  await db.query(
    "update public.relationships set active=false where athlete_id=$1",
    [B],
  );
  await assert.rejects(
    mutate(T, id, "session_note", { note: "entzogen" }),
    /TRAINING_FORBIDDEN/,
  );
  await db.query(
    "update public.relationships set active=true where athlete_id=$1",
    [B],
  );
});
test("Freigabe startet aus autorisiertem Snapshot; Fehler und leere Übungen werden abgefangen", async () => {
  const share = randomUUID();
  await db.query(
    "insert into public.training_plan_snapshot_shares values($1,$2,$3,$4)",
    [share, T, A, JSON.stringify(content())],
  );
  await cmd(A, "session_start", {
    source: "share",
    share_id: share,
    mode: "self",
  });
  await assert.rejects(
    cmd(X, "session_start", { source: "share", share_id: share, mode: "self" }),
    /TRAINING_FORBIDDEN/,
  );
  await assert.rejects(
    cmd(A, "plan_save", {
      id: randomUUID(),
      revision: 0,
      content: { title: "Leer", tricks: [] },
    }),
    /TRAINING_INVALID/,
  );
  await assert.rejects(
    cmd(A, "plan_save", {
      id: randomUUID(),
      revision: 0,
      content: {
        title: "Doppelt",
        tricks: [
          { id: "x", name: "X" },
          { id: "x", name: "Y" },
        ],
      },
    }),
    /TRAINING_INVALID/,
  );
});

// Direkte RPC-Nutzer müssen dieselben Textverträge wie der Editor einhalten.
test("Planvalidierung verweigert Objekte und falsche Typen in sichtbaren Texten", async () => {
  for (const invalid of [
    { title: 123, tricks: [{ id: "x", name: "Ollie" }] },
    { title: "Plan", description: {}, tricks: [{ id: "x", name: "Ollie" }] },
    { title: "Plan", tricks: [{ id: 42, name: "Ollie" }] },
    { title: "Plan", tricks: [{ id: "x", name: "Ollie", trainerNote: {} }] },
    { title: "Plan", tricks: [{ id: "x", name: "Ollie", targetValue: [] }] },
  ]) await assert.rejects(cmd(A, "plan_save", { id: randomUUID(), revision: 0, content: invalid }), /TRAINING_INVALID/);
});

test("Workspace aggregiert über 1000 Versuche vollständig und filtert fremde Sessions", async () => {
  const { id } = await session();
  const st = await state(id);
  await db.query(
    "insert into public.training_session_attempts(session_id,participant_id,exercise_id,landed,recorded_by) select $1,$2,$3,n%2=0,$4 from generate_series(1,1500) n",
    [id, st.p[0].id, st.e.id, A],
  );
  const read = async (actor) =>
    (
      await user(actor, (tx) =>
        tx.query("select public.training_workspace_data() data"),
      )
    ).rows[0].data;
  const own = await read(A);
  const found = own.sessions.find((s) => s.id === id);
  assert.equal(found.totals[0].attempts, 1500);
  assert.equal(found.totals[0].landed, 750);
  assert.equal(found.participants[0].athlete.user_id, A);
  assert.ok(!(await read(X)).sessions.some((s) => s.id === id));
});
test("Gesperrtes Konto und anonymer Aufruf erhalten keinen Commandzugriff", async () => {
  await assert.rejects(
    cmd("00000000-0000-0000-0000-000000000009", "plan_save", {
      id: randomUUID(),
      revision: 0,
      content: content(),
    }),
    /TRAINING_FORBIDDEN/,
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      return tx.query("select public.training_command($1,$2,$3)", [
        randomUUID(),
        "plan_save",
        "{}",
      ]);
    }),
    /permission denied/,
  );
});

// Der bestehende Konto-Workflow anonymisiert Profile statt historische IDs zu löschen.
test("Athletenname folgt Profiländerung und Anonymisierung", async () => {
  await session();
  await db.query("update public.profiles set display_name='Anonymisiert' where id=$1", [A]);
  assert.equal((await db.query("select display_name from public.training_athletes where user_id=$1", [A])).rows[0].display_name, "Anonymisiert");
});

test("Bestehende Organisationsfreigaben bleiben ohne RLS-Rekursion lesbar", async () => {
 const org=randomUUID(), target=randomUUID(), planId=randomUUID();
 await db.query("insert into public.organization_memberships values($1,$2),($3,$4)", [org,T,target,A]);
 await db.query("insert into public.training_plans(id,organization_id,created_by,title) values($1,$2,$3,'Vereinsplan')", [planId,org,T]);
 await db.query("insert into public.training_plan_shares values($1,$2,$3)", [randomUUID(),planId,target]);
 for (const [actor,expected] of [[T,1],[A,1],[X,0]]) {
  const r=await user(actor, tx=>tx.query("select id from public.training_plans where id=$1", [planId]));
  assert.equal(r.rows.length,expected);
 }
});
