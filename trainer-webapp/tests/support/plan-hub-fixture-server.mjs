/** Ausschließlich lokaler Browserprüfstand für Archiv & Papierkorb der Trainingspläne:
 * echte Plan-SQL-Funktionen (PGlite), synthetische Identitäten, simulierte Auth-/
 * Directory-Antworten, kein Produktionszugang und keine externen Nachrichten.
 * Start: node tests/support/plan-hub-fixture-server.mjs
 * App:   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54340 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local npx next dev -p 3107
 * Login: http://localhost:54340/login?role=trainer|athlete|board */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const APP = process.env.PLAN_FIXTURE_APP ?? "http://localhost:3107";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(await read("../fixtures/plan-hub-base.sql"));
// Produktiv vorhandene Nachweis-Tabelle in minimaler Form und die Service-Rolle.
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
  "20260929130000_live_training_redesign.sql",
  "20260929130100_live_training_recap_lines.sql",
  "20260930100000_plan_archive_trash.sql",
]) {
  await db.exec(await read(`../../supabase/migrations/${file}`));
}

const users = [
  ["trainer", "00000000-0000-4000-8000-000000000001", "Tina Trainer", "trainer"],
  ["athlete", "00000000-0000-4000-8000-00000000000a", "Alex Athlet", "athlete"],
  ["bea", "00000000-0000-4000-8000-00000000000b", "Bea Berger", "athlete"],
  ["cem", "00000000-0000-4000-8000-00000000000c", "Cem Kaya", "athlete"],
  ["board", "00000000-0000-4000-8000-000000000003", "Vera Vorstand", "organization_staff"],
].map(([key, id, display_name, account_type]) => ({
  key,
  id,
  display_name,
  account_type,
  email: `${key}@example.invalid`,
  aud: "authenticated",
  user_metadata: {},
  app_metadata: {},
  created_at: new Date().toISOString(),
}));
const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
for (const u of users) {
  await db.query("insert into public.profiles(id,display_name,account_type,salutation) values($1,$2,$3,'d')", [
    u.id,
    u.display_name,
    u.account_type,
  ]);
  u.token =
    enc({ alg: "HS256", typ: "JWT" }) +
    "." +
    enc({ sub: u.id, exp: 4102444800, role: "authenticated", aud: "authenticated" }) +
    ".local-fixture";
}
const [trainer, alex, bea, cem, board] = users;
const CLUB = "00000000-0000-4000-8000-0000000000c1";
await db.query("insert into public.organizations values($1,null,'SKSB Augsburg','club')", [CLUB]);
await db.query(
  "insert into public.organization_memberships(organization_id,user_id,role) values($1,$2,'club_trainer'),($1,$3,'club_board')",
  [CLUB, trainer.id, board.id],
);
for (const athlete of [alex, bea, cem]) {
  await db.query(
    "insert into public.relationships(user_one_id,user_two_id,relationship_type) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),'trainer_athlete')",
    [trainer.id, athlete.id],
  );
}

const asUser = (id, fn) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });

/* ---------------------- Beispielpläne der Trainerin ---------------------- */

const tricks = (names) => names.map((name, i) => ({ id: `t${i + 1}`, name, sortOrder: i, group: "Street", level: 1, status: "not_started" }));
async function seedPlan(title, names, athletes = [], extra = {}) {
  const id = randomUUID();
  const content = {
    id, title, category: "Street", version: "1", author: "Tina Trainer", ownerLevel: "club", sharedWith: [], updatedAt: "",
    description: "", status: "active", visibility: "private", isTemplate: false, assignedGroups: [], assignedAthletes: [],
    sharedTrainers: [], goals: [], tricks: tricks(names), ...extra,
  };
  await asUser(trainer.id, (tx) =>
    tx.query("select public.training_command($1,'plan_save',$2)", [randomUUID(), JSON.stringify({ id, revision: 0, content })]),
  );
  if (athletes.length) {
    await asUser(trainer.id, (tx) =>
      tx.query("select public.training_assign_plan($1,$2,'{}',false)", [
        JSON.stringify({ ...content, version: "1" }),
        athletes.map((a) => a.id),
      ]),
    );
  }
  return content;
}
const setStatus = (planId, athlete, status, trickId = null) =>
  db.query(
    `update public.training_trick_progress p set status=$3::public.trick_progress_status,
      confirmed_by=case when $3='confirmed' then $4::uuid end, confirmed_at=case when $3='confirmed' then now() end
     from public.training_plan_snapshot_shares s
     where s.id=p.snapshot_share_id and s.plan_snapshot->>'id'=$1 and s.recipient_user_id=$2 and ($5::text is null or p.trick_id=$5)`,
    [planId, athlete.id, status, trainer.id, trickId],
  );

const ollie = await seedPlan("Ollie-Basics", ["Ollie", "Kickturn", "Manual", "Shuvit"], [alex, bea]);
await setStatus(ollie.id, alex, "confirmed", "t1");
await setStatus(ollie.id, alex, "in_progress", "t2");
const bowl = await seedPlan("Bowl-Einstieg", ["Drop-in", "Pump", "Carve"], [alex]);
await setStatus(bowl.id, alex, "confirmed"); // Alex fertig → automatisch archiviert
await seedPlan("Grind-Serie", ["50-50", "5-0", "Boardslide"], [], { status: "draft" });
const kick = await seedPlan("Kickflip-Projekt", ["Kickflip", "Heelflip"], [bea, cem]);
await setStatus(kick.id, bea, "in_progress", "t1");
await asUser(trainer.id, (tx) => tx.query("select public.training_plan_archive($1)", [kick.id]));
const junk = await seedPlan("Alter Testplan", ["Ollie"], [cem]);
await asUser(trainer.id, (tx) => tx.query("select public.training_plan_delete($1)", [junk.id]));

/* ------------------------------- HTTP-Server ------------------------------ */

// Nur diese RPCs werden an PGlite weitergereicht (benannte Argumente wie PostgREST).
const RPCS = new Set([
  "training_command", "training_workspace_data", "training_recaps", "training_plan_hub_context",
  "training_plan_library", "training_plan_archive", "training_plan_reactivate", "training_plan_delete",
  "training_plan_restore", "training_assign_plan", "training_set_club_template", "own_salutation",
]);
const argValue = (value) => (value !== null && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : value);

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const user = users.find((u) => req.headers.authorization === `Bearer ${u.token}`);
  let body = "";
  for await (const chunk of req) body += chunk;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    if (url.pathname === "/login") {
      const u = users.find((x) => x.key === url.searchParams.get("role")) || trainer;
      const cookie =
        "base64-" +
        enc({ access_token: u.token, refresh_token: "local-only", expires_at: 4102444800, expires_in: 999999999, token_type: "bearer", user: u });
      res.setHeader("Set-Cookie", `sb-127-auth-token=${cookie}; Path=/; SameSite=Lax`);
      res.writeHead(302, { Location: `${APP}/trainingsplaene` });
      return res.end();
    }
    if (url.pathname === "/auth/v1/user") {
      res.statusCode = user ? 200 : 401;
      return res.end(JSON.stringify(user || {}));
    }
    if (!user) {
      res.statusCode = 401;
      return res.end("{}");
    }
    const payload = body ? JSON.parse(body) : {};
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)?.[1];
    if (rpc && RPCS.has(rpc)) {
      const keys = Object.keys(payload);
      const args = keys.map((key, i) => `${key} => $${i + 1}`).join(",");
      const r = await asUser(user.id, (tx) =>
        tx.query(`select public.${rpc}(${args}) data`, keys.map((key) => argValue(payload[key]))),
      );
      return res.end(JSON.stringify(r.rows[0].data));
    }
    if (url.pathname === "/rest/v1/rpc/get_people_directory") {
      const related = user === trainer || user === board ? [alex, bea, cem] : [trainer];
      return res.end(
        JSON.stringify(
          related.map((u) => ({
            ...u, roles: [], states: [], clubs: [], active_relationships: ["trainer_athlete"], pending_sent: [], pending_received: [],
          })),
        ),
      );
    }
    if (url.pathname === "/rest/v1/training_plan_snapshot_shares") {
      const r = await asUser(user.id, (tx) =>
        tx.query(
          `select id, shared_by, recipient_user_id, plan_snapshot, created_at, shared_with_trainers, archived_at, archived_reason, deleted_at
           from public.training_plan_snapshot_shares
           where recipient_user_id=$1 or shared_by=$1 or shared_with_trainers order by created_at desc`,
          [user.id],
        ),
      );
      return res.end(JSON.stringify(r.rows));
    }
    if (url.pathname === "/rest/v1/training_trick_progress") {
      const r = await asUser(user.id, (tx) =>
        tx.query("select snapshot_share_id, trick_id, athlete_id, status, confirmed_at, confirmed_source from public.training_trick_progress"),
      );
      return res.end(JSON.stringify(r.rows));
    }
    if (url.pathname === "/rest/v1/profiles") return res.end(JSON.stringify({ ...user, avatar_path: null }));
    if (["/rest/v1/guardian_approval_requests", "/rest/v1/account_deletion_requests"].includes(url.pathname)) return res.end("null");
    res.setHeader("Content-Range", "*/0");
    res.end("[]");
  } catch (error) {
    res.statusCode = 400;
    res.end(JSON.stringify({ code: error.code || "XX000", message: error.message }));
  }
}).listen(54340, "127.0.0.1", () => console.log("Isolierte Plan-Fixture: http://localhost:54340/login?role=trainer"));
