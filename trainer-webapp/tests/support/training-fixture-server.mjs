/** Ausschließlich lokaler Browserprüfstand: echte Trainings-SQL-Funktionen,
 * synthetische Identitäten, kein Produktionszugang und keine externen Nachrichten. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  await readFile(
    new URL("../fixtures/training-base.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(
  await readFile(
    new URL(
      "../../supabase/migrations/20260923141926_step_5_training_sessions.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const users = [
  ["athlete", "00000000-0000-0000-0000-000000000001", "Alex", "athlete"],
  ["kim", "00000000-0000-0000-0000-000000000002", "Kim", "athlete"],
  ["trainer", "00000000-0000-0000-0000-000000000003", "Trainer", "trainer"],
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
  await db.query("insert into public.profiles values($1,$2,$3)", [
    u.id,
    u.display_name,
    u.account_type,
  ]);
  u.token =
    enc({ alg: "HS256", typ: "JWT" }) +
    "." +
    enc({
      sub: u.id,
      exp: 4102444800,
      role: "authenticated",
      aud: "authenticated",
    }) +
    ".local-fixture";
}
await db.query(
  "insert into public.relationships values($1,$2,true),($1,$3,true)",
  [users[2].id, users[0].id, users[1].id],
);
const asUser = (id, fn) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const user = users.find(
    (u) => req.headers.authorization === `Bearer ${u.token}`,
  );
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    if (url.pathname === "/login") {
      const u =
        users.find((u) => u.key === url.searchParams.get("role")) || users[0];
      const cookie =
        "base64-" +
        enc({
          access_token: u.token,
          refresh_token: "local-only",
          expires_at: 4102444800,
          expires_in: 999999999,
          token_type: "bearer",
          user: u,
        });
      res.setHeader(
        "Set-Cookie",
        `sb-127-auth-token=${cookie}; Path=/; SameSite=Lax`,
      );
      res.writeHead(302, { Location: "http://localhost:3105/trainingsplaene" });
      res.end();
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      res.statusCode = user ? 200 : 401;
      res.end(JSON.stringify(user || {}));
      return;
    }
    if (!user) {
      res.statusCode = 401;
      res.end("{}");
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const payload = body ? JSON.parse(body) : {};
    if (url.pathname === "/rest/v1/rpc/training_command") {
      const r = await asUser(user.id, (tx) =>
        tx.query("select public.training_command($1,$2,$3) data", [
          payload.request_id,
          payload.operation,
          JSON.stringify(payload.payload),
        ]),
      );
      res.end(JSON.stringify(r.rows[0].data));
      return;
    }
    if (url.pathname === "/rest/v1/rpc/training_workspace_data") {
      const r = await asUser(user.id, (tx) =>
        tx.query("select public.training_workspace_data() data"),
      );
      res.end(JSON.stringify(r.rows[0].data));
      return;
    }
    if (url.pathname === "/rest/v1/rpc/get_people_directory") {
      res.end(
        JSON.stringify(
          users
            .filter((u) => u.id !== user.id)
            .map((u) => ({
              ...u,
              roles: [],
              states: [],
              clubs: [],
              active_relationships: ["trainer_athlete"],
              pending_sent: [],
              pending_received: [],
            })),
        ),
      );
      return;
    }
    if (url.pathname === "/rest/v1/profiles") {
      res.end(JSON.stringify({ ...user, avatar_path: null }));
      return;
    }
    if (
      [
        "/rest/v1/guardian_approval_requests",
        "/rest/v1/account_deletion_requests",
      ].includes(url.pathname)
    ) {
      res.end("null");
      return;
    }
    res.setHeader("Content-Range", "*/0");
    res.end("[]");
  } catch (error) {
    res.statusCode = 400;
    res.end(
      JSON.stringify({ code: error.code || "XX000", message: error.message }),
    );
  }
}).listen(54338, "127.0.0.1", () =>
  console.log(
    "Isolierte Trainings-Fixture: http://localhost:54338/login?role=athlete",
  ),
);
