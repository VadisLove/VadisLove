import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const D = "00000000-0000-0000-0000-000000000001",
  A = "00000000-0000-0000-0000-000000000002",
  B = "00000000-0000-0000-0000-000000000003",
  G = "00000000-0000-0000-0000-000000000004",
  X = "00000000-0000-0000-0000-000000000005",
  BLOCKED = "00000000-0000-0000-0000-000000000006";
const E = "20000000-0000-0000-0000-000000000001";
let db;
before(async () => {
  // Optional: dieselbe Suite auf einem frischen nativen PostgreSQL mit getrennten
  // Verbindungen ausführen, um tatsächliche Zeilensperren zu prüfen.
  if (process.env.CARPOOL_NATIVE_PG_MODULE) {
    const connectionString = process.env.CARPOOL_TEST_DATABASE_URL;
    if (
      !connectionString ||
      !["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname)
    )
      throw Error("Only isolated loopback test databases are allowed");
    const { default: pg } = await import(process.env.CARPOOL_NATIVE_PG_MODULE);
    const pool = new pg.Pool({ connectionString });
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
      new URL("./fixtures/carpool-base.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260903080920_carpool_release.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const [id, name] of [
    [D, "Driver"],
    [A, "Athlete"],
    [B, "Other athlete"],
    [G, "Guardian"],
    [X, "Outsider"],
    [BLOCKED, "Blocked"],
  ])
    await db.query("insert into public.profiles values($1,$2,$3)", [
      id,
      name,
      `${name.replaceAll(" ", "")}@example.invalid`,
    ]);
  await db.query(
    "insert into public.events values($1,'10000000-0000-0000-0000-000000000001',$2,'training','2099-09-05T12:00:00Z','2099-09-05T14:00:00Z','Park')",
    [E, D],
  );
  await db.query(
    "insert into public.relationships values($1,$2,true,'guardian')",
    [G, A],
  );
  await db.query(
    "insert into public.guardian_approval_requests values($1,'2099-01-01','approved'),($2,'2099-01-01','pending')",
    [A, BLOCKED],
  );
});
after(async () => {
  await db?.close();
});
const user = (id, fn) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
const command = (id, op, payload, key = randomUUID()) =>
  user(id, (tx) =>
    tx.query("select public.carpool_command($1,$2,$3)", [
      key,
      op,
      JSON.stringify(payload),
    ]),
  );
const snapshot = (id, event = E, ride = null) =>
  user(
    id,
    async (tx) =>
      (
        await tx.query("select public.carpool_snapshot($1,$2) data", [
          event,
          ride,
        ])
      ).rows[0].data,
  );
const leg = (direction = "outbound", seats = 1) => ({
  direction,
  seats,
  departure_at: "2099-09-05T10:00:00Z",
  origin: "Berlin",
  meeting_point: "Park entrance",
  note: "Helmet",
});
async function offer(direction = "outbound", seats = 1, driver = D) {
  await command(driver, "offer", {
    event_id: E,
    attested: true,
    legs: [leg(direction, seats)],
  });
  return (
    await db.query(
      "select id from public.carpool_rides order by created_at desc,id desc limit 1",
    )
  ).rows[0].id;
}
async function request(actor, ride) {
  await command(actor, "request", { ride_id: ride });
  return (
    await db.query(
      "select id from public.carpool_requests where ride_id=$1 and passenger_id=$2 and status='pending'",
      [ride, actor],
    )
  ).rows[0].id;
}
async function clear() {
  await db.exec(
    "delete from private.carpool_mail;delete from public.notifications;delete from public.carpool_rides;delete from public.carpool_wanted;",
  );
}

test("Hin- und Rückfahrt werden atomar angelegt; Minderjährige und gesperrte Konten dürfen nicht anbieten", async () => {
  await command(D, "offer", {
    event_id: E,
    attested: true,
    legs: [leg(), leg("return")],
  });
  assert.equal((await snapshot(D)).rides.length, 2);
  await assert.rejects(
    command(A, "offer", { event_id: E, attested: true, legs: [leg()] }),
    /CARPOOL_ADULT_REQUIRED/,
  );
  await assert.rejects(
    command(D, "offer", { event_id: E, attested: false, legs: [leg()] }),
    /CARPOOL_ADULT_REQUIRED/,
  );
  await assert.rejects(
    command(BLOCKED, "offer", { event_id: E, attested: true, legs: [leg()] }),
    /CARPOOL_FORBIDDEN/,
  );
});
test("Letzter Platz: zwei konkurrierend gestartete Bestätigungen ergeben genau eine Zusage", async () => {
  await clear();
  const ride = await offer();
  const a = await request(A, ride);
  const b = await request(B, ride);
  const results = await Promise.allSettled([
    command(D, "confirm", { ride_id: ride, request_id: a }),
    command(D, "confirm", { ride_id: ride, request_id: b }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    results.find((r) => r.status === "rejected").reason.message,
    /CARPOOL_FULL/,
  );
  assert.equal((await snapshot(D)).rides[0].confirmed_count, 1);
});
test("Idempotente Anfrage erzeugt weder doppelte Buchung noch doppelte Nachrichten", async () => {
  await clear();
  const ride = await offer(),
    key = randomUUID();
  await command(A, "request", { ride_id: ride }, key);
  const count = (
    await db.query("select count(*)::int n from private.carpool_mail")
  ).rows[0].n;
  await command(A, "request", { ride_id: ride }, key);
  assert.equal(
    (await db.query("select count(*)::int n from private.carpool_mail")).rows[0]
      .n,
    count,
  );
  assert.equal((await snapshot(A)).rides[0].requests.length, 1);
  await assert.rejects(
    command(B, "request", { ride_id: ride }, key),
    /CARPOOL_FORBIDDEN/,
  );
});
test("Eltern sehen nur die Fahrt ihres Kindes, ohne Terminzugriff oder Buchungsrechte", async () => {
  await clear();
  const ride = await offer("outbound", 2);
  const other = await offer("return");
  const a = await request(A, ride);
  await request(B, ride);
  const parent = await snapshot(G, null, ride);
  assert.equal(parent.rides.length, 1);
  assert.equal(parent.rides[0].requests.length, 1);
  assert.equal(parent.rides[0].can_comment, false);
  assert.equal((await snapshot(G, null, other)).rides.length, 0);
  assert.equal(
    (await user(G, (tx) => tx.query("select * from public.events"))).rows
      .length,
    0,
  );
  await assert.rejects(
    command(G, "confirm", { ride_id: ride, request_id: a }),
    /CARPOOL_FORBIDDEN/,
  );
  assert.ok(
    (await db.query("select * from public.notifications where user_id=$1", [G]))
      .rows.length > 0,
  );
  await command(D, "confirm", { ride_id: ride, request_id: a });
  await command(G, "comment", { ride_id: ride, body: "Thank you" });
  assert.equal((await snapshot(G, null, ride)).rides[0].comments.length, 1);
});
test("Fremde Nutzer können weder direkt lesen/schreiben noch Mail-Worker aufrufen", async () => {
  assert.equal((await snapshot(X)).rides.length, 0);
  for (const table of [
    "carpool_rides",
    "carpool_requests",
    "carpool_wanted",
    "carpool_comments",
  ])
    assert.equal(
      (await user(X, (tx) => tx.query(`select * from public.${table}`))).rows
        .length,
      0,
    );
  await assert.rejects(
    user(X, (tx) => tx.exec("insert into public.carpool_rides default values")),
    /permission denied/,
  );
  await assert.rejects(
    user(A, (tx) =>
      tx.exec("update public.carpool_requests set status='confirmed'"),
    ),
    /permission denied/,
  );
  await assert.rejects(
    user(A, (tx) => tx.exec("select * from private.carpool_mail")),
    /permission denied/,
  );
  await assert.rejects(
    user(A, (tx) => tx.exec("select public.carpool_claim_mail()")),
    /permission denied/,
  );
  await assert.rejects(
    user(BLOCKED, (tx) => tx.exec("select public.carpool_snapshot()")),
    /CARPOOL_FORBIDDEN/,
  );
});
test("Pro Richtung eine Anfrage; Rückfahrt kann bei anderem Fahrer gebucht werden", async () => {
  await clear();
  const outbound = await offer();
  const alternative = await offer();
  const back = await offer("return", 1, B);
  const outboundRequest = await request(A, outbound);
  await assert.rejects(request(A, alternative), /duplicate key/);
  const returnRequest = await request(A, back);
  await command(D, "confirm", {
    ride_id: outbound,
    request_id: outboundRequest,
  });
  await command(B, "confirm", { ride_id: back, request_id: returnRequest });
  assert.equal(
    (await snapshot(A)).rides
      .flatMap((r) => r.requests)
      .filter((q) => q.status === "confirmed").length,
    2,
  );
});
test("Absage gibt Platz frei, danach ist Fahrerwechsel möglich", async () => {
  await clear();
  const ride = await offer();
  const a = await request(A, ride);
  await command(D, "confirm", { ride_id: ride, request_id: a });
  await command(A, "cancel_request", { ride_id: ride, request_id: a });
  assert.equal((await snapshot(D)).rides[0].confirmed_count, 0);
  const other = await offer();
  await request(A, other);
});
test("Änderungen erfordern neue Kenntnisnahme und schützen gegen veraltete Revisionen", async () => {
  await clear();
  const ride = await offer();
  const a = await request(A, ride);
  await command(D, "confirm", { ride_id: ride, request_id: a });
  await command(D, "edit", {
    ride_id: ride,
    revision: 1,
    ...leg(),
    meeting_point: "New entrance",
  });
  let r = (await snapshot(A)).rides[0];
  assert.equal(r.revision, 2);
  assert.equal(r.requests[0].acknowledged_revision, 1);
  await assert.rejects(
    command(A, "acknowledge", { ride_id: ride, request_id: a, revision: 1 }),
    /CARPOOL_STALE/,
  );
  await command(A, "acknowledge", {
    ride_id: ride,
    request_id: a,
    revision: 2,
  });
  await assert.rejects(
    command(D, "edit", { ride_id: ride, revision: 2, ...leg(), seats: 0 }),
    /CARPOOL_CAPACITY/,
  );
  await assert.rejects(
    command(D, "edit", { ride_id: ride, ...leg() }),
    /CARPOOL_STALE/,
  );
});
test("Terminänderung sperrt Bestätigung bis zur Prüfung durch Fahrer", async () => {
  await clear();
  const ride = await offer();
  const a = await request(A, ride);
  await db.query("update public.events set location='Other park' where id=$1", [
    E,
  ]);
  await assert.rejects(
    command(D, "confirm", { ride_id: ride, request_id: a }),
    /CARPOOL_REVIEW/,
  );
  await command(D, "review", { ride_id: ride, revision: 2 });
  await command(D, "confirm", { ride_id: ride, request_id: a });
});
test("Fahrtabsage benachrichtigt und storniert alle offenen Buchungen", async () => {
  await clear();
  const ride = await offer();
  await request(A, ride);
  await command(D, "cancel_ride", { ride_id: ride });
  const r = (await snapshot(A)).rides[0];
  assert.equal(r.status, "cancelled");
  assert.equal(r.requests[0].status, "cancelled");
});
test("Gesuche sind bearbeitbar und verschwinden nach erfolgreicher Buchung", async () => {
  await clear();
  await command(A, "wanted", {
    event_id: E,
    direction: "outbound",
    origin: "Berlin",
    note: "",
  });
  assert.equal((await snapshot(D)).wanted.length, 1);
  const ride = await offer();
  const a = await request(A, ride);
  await command(D, "confirm", { ride_id: ride, request_id: a });
  assert.equal((await snapshot(D)).wanted.length, 0);
});
test("Keine Anfragen nach Abfahrt; Datums- und Textgrenzen greifen auch direkt in SQL", async () => {
  await clear();
  const ride = await offer();
  await db.query(
    "update public.carpool_rides set departure_at=now()-interval '1 minute' where id=$1",
    [ride],
  );
  await assert.rejects(request(A, ride), /CARPOOL_DEPARTED/);
  await assert.rejects(
    command(D, "offer", {
      event_id: E,
      attested: true,
      legs: [{ ...leg(), origin: "" }],
    }),
    /check constraint/,
  );
});
test("E-Mail-Lease, Wiederholung, Idempotenzfenster und Benachrichtigungsschalter", async () => {
  await clear();
  const ride = await offer();
  await command(G, "preferences", {
    own_app: true,
    own_email: true,
    guardian_app: false,
    guardian_email: false,
    locale: "en",
  });
  await request(A, ride);
  assert.equal(
    (await db.query("select * from public.notifications where user_id=$1", [G]))
      .rows.length,
    0,
  );
  const service = (fn) =>
    db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return fn(tx);
    });
  const batch = (
    await service((tx) => tx.query("select * from public.carpool_claim_mail()"))
  ).rows;
  assert.ok(batch.length > 0);
  assert.equal(
    (
      await service((tx) =>
        tx.query("select * from public.carpool_claim_mail()"),
      )
    ).rows.length,
    0,
  );
  const job = batch[0];
  await service((tx) =>
    tx.query("select public.carpool_finish_mail($1,$2,true)", [
      job.id,
      job.lease_id,
    ]),
  );
  assert.ok(
    (
      await db.query("select sent_at from private.carpool_mail where id=$1", [
        job.id,
      ])
    ).rows[0].sent_at,
  );
  await db.exec(
    "update private.carpool_mail set first_attempt_at=now()-interval '25 hours',available_at=now() where sent_at is null",
  );
  assert.equal(
    (
      await service((tx) =>
        tx.query("select * from public.carpool_claim_mail()"),
      )
    ).rows.length,
    0,
  );
});
test("Anonyme Aufrufe und Kommentare vor Bestätigung bleiben gesperrt", async () => {
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.exec("select public.carpool_snapshot()");
    }),
    /permission denied/,
  );
  await clear();
  const ride = await offer();
  await request(A, ride);
  await assert.rejects(
    command(A, "comment", { ride_id: ride, body: "Not confirmed" }),
    /CARPOOL_FORBIDDEN/,
  );
  await assert.rejects(
    command(X, "comment", { ride_id: ride, body: "Unrelated" }),
    /CARPOOL_FORBIDDEN/,
  );
});
test("Beendete Elternverknüpfung entfernt Fahrt- und Kommentarzugriff sofort", async () => {
  await clear();
  const ride = await offer();
  const a = await request(A, ride);
  await command(D, "confirm", { ride_id: ride, request_id: a });
  await db.query(
    "update public.relationships set active=false where guardian_user_id=$1",
    [G],
  );
  assert.equal((await snapshot(G, null, ride)).rides.length, 0);
  await assert.rejects(
    command(G, "comment", { ride_id: ride, body: "Former guardian" }),
    /CARPOOL_FORBIDDEN/,
  );
  await db.query(
    "update public.relationships set active=true where guardian_user_id=$1",
    [G],
  );
});
test("Gelöschter Termin storniert Fahrten, Historie bleibt für Betroffene erreichbar", async () => {
  await clear();
  const ride = await offer();
  await request(A, ride);
  await db.query("delete from public.events where id=$1", [E]);
  const r = (await snapshot(A, null, ride)).rides[0];
  assert.equal(r.event_id, null);
  assert.equal(r.status, "cancelled");
  assert.equal(r.requests[0].status, "cancelled");
});
