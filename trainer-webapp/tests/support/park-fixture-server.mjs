/** Ausschließlich lokaler Browserprüfstand für Schritt 7: echte Park-SQL-Funktionen,
 * synthetische Identitäten, simulierte Auth-/Storage-Antworten, kein Produktionszugang.
 * Start: node tests/support/park-fixture-server.mjs
 * App:   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54339 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local npx next dev -p 3106
 * Login: http://localhost:54339/login?role=athlete|trainer|guardian */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const APP = process.env.PARK_FIXTURE_APP ?? "http://localhost:3106";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(await read("../fixtures/training-base.sql"));
await db.exec(await read("../../supabase/migrations/20260923202413_step_5_training_sessions.sql"));
await db.exec(await read("../fixtures/park-base.sql"));
await db.exec(await read("../../supabase/migrations/20260924135627_step_7_park_run_planner.sql"));
await db.exec(await read("../../supabase/migrations/20260926002019_step_7b_park_ground.sql"));

const users = [
  ["athlete", "00000000-0000-4000-8000-000000000001", "Alex", "athlete"],
  ["kim", "00000000-0000-4000-8000-000000000002", "Kim", "athlete"],
  ["trainer", "00000000-0000-4000-8000-000000000003", "Trainer", "trainer"],
  ["guardian", "00000000-0000-4000-8000-000000000004", "Mama", "guardian"],
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
  await db.query("insert into public.profiles values($1,$2,$3)", [u.id, u.display_name, u.account_type]);
  u.token =
    enc({ alg: "HS256", typ: "JWT" }) +
    "." +
    enc({ sub: u.id, exp: 4102444800, role: "authenticated", aud: "authenticated" }) +
    ".local-fixture";
}
const [alex, kim, trainer, guardian] = users;
await db.query("insert into public.relationships(trainer_id,athlete_id,active) values($1,$2,true),($1,$3,true)", [trainer.id, alex.id, kim.id]);
await db.query("insert into public.relationships(active,relationship_type,guardian_user_id,athlete_user_id) values(true,'guardian',$1,$2)", [guardian.id, alex.id]);
await db.query(
  "insert into public.events(created_by,title,type,starts_at) values($1,'Vereinstraining','training',now()+interval '2 days'),($1,'Bayern Cup','contest',now()+interval '10 days')",
  [alex.id],
);
await db.query(
  "insert into public.event_viewers select id,$1::uuid from public.events union all select id,$2::uuid from public.events",
  [trainer.id, guardian.id],
);

const asUser = (id, fn) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
const files = new Map();

/**
 * Liefert den Dateiinhalt eines Uploads: supabase-js sendet im Browser Multipart,
 * serverseitig (Buffer) den Rohinhalt.
 */
function uploadBody(req, buffer) {
  const match = /boundary=(.+)$/.exec(req.headers["content-type"] ?? "");
  if (!match) return buffer;
  const boundary = Buffer.from(`--${match[1]}`, "latin1");
  let start = 0;
  let last = buffer;
  while ((start = buffer.indexOf(boundary, start)) >= 0) {
    const next = buffer.indexOf(boundary, start + boundary.length);
    if (next < 0) break;
    const part = buffer.subarray(start + boundary.length, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, headerEnd).toString("latin1");
    const body = part.subarray(headerEnd + 4, part.length - 2);
    if (/filename=|name=""/.test(headers) || body.length > 64) last = body;
    start = next;
  }
  return last;
}
const TYPES = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", glb: "model/gltf-binary", gltf: "model/gltf+json", obj: "model/obj", bin: "application/octet-stream" };
const BUCKETS = "(skatepark-aerials|skatepark-models)";

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.end();
  const user = users.find((u) => req.headers.authorization === `Bearer ${u.token}`);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  try {
    if (url.pathname === "/login") {
      const u = users.find((x) => x.key === url.searchParams.get("role")) || alex;
      const cookie =
        "base64-" +
        enc({ access_token: u.token, refresh_token: "local-only", expires_at: 4102444800, expires_in: 999999999, token_type: "bearer", user: u });
      res.setHeader("Set-Cookie", `sb-127-auth-token=${cookie}; Path=/; SameSite=Lax`);
      res.writeHead(302, { Location: `${APP}/skateparks` });
      return res.end();
    }
    // Signierte URLs sind ohne Login abrufbar, wie bei Supabase.
    const signed = url.pathname.match(new RegExp(`^/storage/v1/object/sign/${BUCKETS}/(.+)$`));
    if (signed && req.method === "GET" && url.searchParams.get("token")) {
      const path = decodeURIComponent(signed[2]);
      const file = files.get(`${signed[1]}/${path}`);
      res.statusCode = file ? 200 : 404;
      res.setHeader("Content-Type", TYPES[path.split(".").pop()] ?? "application/octet-stream");
      return res.end(file ?? "");
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/auth/v1/user") {
      res.statusCode = user ? 200 : 401;
      return res.end(JSON.stringify(user || {}));
    }
    if (!user) {
      res.statusCode = 401;
      return res.end("{}");
    }
    const signedUrl = (bucket, path) => `/object/sign/${bucket}/${path}?token=local`;
    const batch = url.pathname.match(new RegExp(`^/storage/v1/object/sign/${BUCKETS}$`));
    if (batch && req.method === "POST") {
      const { paths } = JSON.parse(raw.toString() || "{}");
      return res.end(JSON.stringify((paths ?? []).map((path) => ({ path, error: null, signedURL: signedUrl(batch[1], path) }))));
    }
    const single = url.pathname.match(new RegExp(`^/storage/v1/object/sign/${BUCKETS}/(.+)$`));
    if (single && req.method === "POST")
      return res.end(JSON.stringify({ signedURL: signedUrl(single[1], decodeURIComponent(single[2])) }));
    const upload = url.pathname.match(new RegExp(`^/storage/v1/object/${BUCKETS}/(.+)$`));
    if (upload && req.method === "POST") {
      const [, bucket, encoded] = upload;
      const path = decodeURIComponent(encoded);
      await asUser(user.id, (tx) =>
        tx.query("insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)", [bucket, path, user.id]),
      );
      files.set(`${bucket}/${path}`, uploadBody(req, raw));
      return res.end(JSON.stringify({ Key: `${bucket}/${path}`, Id: path }));
    }
    const payload = raw.length ? JSON.parse(raw.toString()) : {};
    if (url.pathname === "/rest/v1/rpc/park_command") {
      const r = await asUser(user.id, (tx) =>
        tx.query("select public.park_command($1,$2,$3) data", [payload.request_id, payload.operation, JSON.stringify(payload.payload)]),
      );
      return res.end(JSON.stringify(r.rows[0].data));
    }
    if (url.pathname === "/rest/v1/rpc/park_directory") {
      const r = await asUser(user.id, (tx) => tx.query("select public.park_directory() data"));
      return res.end(JSON.stringify(r.rows[0].data));
    }
    if (url.pathname === "/rest/v1/rpc/park_detail") {
      const r = await asUser(user.id, (tx) => tx.query("select public.park_detail($1) data", [payload.target]));
      return res.end(JSON.stringify(r.rows[0].data));
    }
    if (url.pathname === "/rest/v1/rpc/get_people_directory") {
      const related =
        user === trainer ? [alex, kim] : user === alex ? [trainer] : user === kim ? [trainer] : [alex];
      return res.end(
        JSON.stringify(
          related.map((u) => ({
            ...u,
            roles: [],
            states: [],
            clubs: [],
            active_relationships: [u === alex && user === guardian ? "guardian" : "trainer_athlete"],
            pending_sent: [],
            pending_received: [],
          })),
        ),
      );
    }
    if (url.pathname === "/rest/v1/profiles") return res.end(JSON.stringify({ ...user, avatar_path: null }));
    if (["/rest/v1/guardian_approval_requests", "/rest/v1/account_deletion_requests"].includes(url.pathname))
      return res.end("null");
    res.setHeader("Content-Range", "*/0");
    res.end("[]");
  } catch (error) {
    res.statusCode = 400;
    res.end(JSON.stringify({ code: error.code || "XX000", message: error.message }));
  }
}).listen(54339, "127.0.0.1", () =>
  console.log("Isolierte Park-Fixture: http://localhost:54339/login?role=athlete"),
);
