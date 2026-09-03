/** Lokaler Supabase-Vertrag für Browser-Abnahmen, ausschließlich synthetische
 * Daten. Bindet nur Loopback; keine Produktionstokens oder externen E-Mails. */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  await readFile(
    new URL("../fixtures/carpool-base.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(
  await readFile(
    new URL(
      "../../supabase/migrations/20260903080920_carpool_release.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const eventId = "20000000-0000-0000-0000-000000000001";
const users = {
  driver: {
    id: "00000000-0000-0000-0000-000000000001",
    display_name: "Alex Fahrer",
    account_type: "trainer",
  },
  athlete: {
    id: "00000000-0000-0000-0000-000000000002",
    display_name: "Sam Athlet",
    account_type: "athlete",
  },
  guardian: {
    id: "00000000-0000-0000-0000-000000000004",
    display_name: "Robin Eltern",
    account_type: "guardian",
  },
};
for (const [key, u] of Object.entries(users)) {
  u.email = `${key}@example.invalid`;
  u.aud = "authenticated";
  u.user_metadata = {};
  u.app_metadata = {};
  u.created_at = new Date().toISOString();
  await db.query("insert into public.profiles values($1,$2,$3)", [
    u.id,
    u.display_name,
    u.email,
  ]);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: u.id, exp: 4102444800, role: "authenticated", aud: "authenticated" })}.fixture-signature`;
  u.token = token;
  const value =
    "base64-" +
    enc({
      access_token: token,
      refresh_token: "fixture-only",
      expires_at: 4102444800,
      expires_in: 99999999,
      token_type: "bearer",
      user: u,
    });
  await writeFile(
    `/tmp/carpool-${key}-state.json`,
    JSON.stringify({
      cookies: [
        {
          name: "sb-127-auth-token",
          value,
          domain: "localhost",
          path: "/",
          expires: 4102444800,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
  );
}
await db.query(
  "insert into public.events values($1,'10000000-0000-0000-0000-000000000001',$2,'training','2099-09-05T12:00:00Z','2099-09-05T14:00:00Z','Skatepark')",
  [eventId, users.driver.id],
);
await db.query(
  "insert into public.relationships values($1,$2,true,'guardian')",
  [users.guardian.id, users.athlete.id],
);
await db.query(
  "insert into public.guardian_approval_requests values($1,'2099-01-01','approved')",
  [users.athlete.id],
);
const asUser = (id, fn) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const u = Object.values(users).find(
    (u) => req.headers.authorization === `Bearer ${u.token}`,
  );
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    if (url.pathname === "/auth/v1/user") {
      res.statusCode = u ? 200 : 401;
      res.end(JSON.stringify(u || { message: "Unauthorized" }));
      return;
    }
    if (!u) {
      res.statusCode = 401;
      res.end("{}");
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const payload = body ? JSON.parse(body) : {};
    if (url.pathname === "/rest/v1/rpc/carpool_snapshot") {
      const result = await asUser(u.id, (tx) =>
        tx.query("select public.carpool_snapshot($1,$2) data", [
          payload.target_event,
          payload.target_ride,
        ]),
      );
      res.end(JSON.stringify(result.rows[0].data));
      return;
    }
    if (url.pathname === "/rest/v1/rpc/carpool_command") {
      await asUser(u.id, (tx) =>
        tx.query("select public.carpool_command($1,$2,$3)", [
          payload.command_id,
          payload.operation,
          JSON.stringify(payload.payload),
        ]),
      );
      res.end("null");
      return;
    }
    if (url.pathname === "/rest/v1/profiles") {
      res.end(JSON.stringify({ ...u, avatar_path: null }));
      return;
    }
    if (url.pathname === "/rest/v1/events") {
      res.end(
        JSON.stringify([
          {
            id: eventId,
            organization_id: "10000000-0000-0000-0000-000000000001",
            created_by: users.driver.id,
            title: "Training im Skatepark",
            type: "training",
            starts_at: "2099-09-05T12:00:00Z",
            ends_at: "2099-09-05T14:00:00Z",
            location: "Skatepark",
            state_code: "BE",
            region_name: "Berlin",
            capacity: 10,
            description: "Gemeinsames Training",
            event_participants: [],
          },
        ]),
      );
      return;
    }
    if (
      url.pathname.endsWith("/guardian_approval_requests") ||
      url.pathname.endsWith("/account_deletion_requests")
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
}).listen(54339, "127.0.0.1", () =>
  console.log("Synthetic carpool fixture: http://127.0.0.1:54339"),
);
