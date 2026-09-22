import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "00000000-0000-0000-0000-000000000001";
const ATHLETE = "00000000-0000-0000-0000-000000000002";
const OTHER = "00000000-0000-0000-0000-000000000005";
const GUARDIAN = "00000000-0000-0000-0000-000000000004";
const ORG = "10000000-0000-0000-0000-000000000001";
let db;

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const asUser = (id, fn) => db.transaction(async (tx) => {
  await tx.exec("set local role authenticated");
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  return fn(tx);
});
const asService = (fn) => db.transaction(async (tx) => {
  await tx.exec("set local role service_role");
  return fn(tx);
});

before(async () => {
  // Optional läuft dieselbe Suite gegen einen isolierten nativen PostgreSQL.
  // So werden Rollen, Trigger und SQL-Verhalten zusätzlich zur PGlite-Prüfung verifiziert.
  if (process.env.CALENDAR_NATIVE_PG_MODULE) {
    const connectionString = process.env.CALENDAR_TEST_DATABASE_URL;
    if (
      !connectionString ||
      !["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname)
    ) throw Error("Only isolated loopback test databases are allowed");
    const { default: pg } = await import(pathToFileURL(process.env.CALENDAR_NATIVE_PG_MODULE));
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
  await db.exec(await read("./fixtures/carpool-base.sql"));
  await db.exec(await read("./fixtures/calendar-communication-base.sql"));
  await db.exec(await read("../supabase/migrations/20260903080920_carpool_release.sql"));
  await db.exec(await read("../supabase/migrations/20260922122040_step_4_calendar_communication.sql"));
  for (const [id, name, email] of [
    [OWNER, "Owner", "owner@example.invalid"],
    [ATHLETE, "Athlete", "athlete@example.invalid"],
    [OTHER, "Outsider", "outsider@example.invalid"],
    [GUARDIAN, "Guardian", "guardian@example.invalid"],
  ]) await db.query("insert into public.profiles values($1,$2,$3)", [id, name, email]);
  await db.query("insert into public.relationships values($1,$2,true,'guardian')", [GUARDIAN, ATHLETE]);
  await db.query("insert into public.guardian_approval_requests values($1,'2099-01-01','approved')", [ATHLETE]);
});

after(async () => db?.close());

const eventPayload = (overrides = {}) => ({
  organization_id: ORG,
  title: "Training",
  description: "Test",
  type: "training",
  starts_at: "2098-06-01T16:00:00Z",
  ends_at: "2098-06-01T18:00:00Z",
  location: "Park",
  state_code: "BE",
  region_name: "Berlin",
  capacity: 12,
  response_deadline: "2098-05-29T16:00:00Z",
  ...overrides,
});

test("Serien erhalten stabile Zuordnung und gefährliche Links werden atomar abgelehnt", async () => {
  const created = await asUser(OWNER, (tx) => tx.query(
    "select public.create_calendar_events($1,3,$2) id",
    [JSON.stringify(eventPayload()), JSON.stringify([{ label: "Info", url: "https://example.org/info" }])],
  ));
  assert.equal(created.rows.length, 3);
  const series = await db.query("select series_id,series_position,starts_at from public.events order by starts_at");
  assert.equal(new Set(series.rows.map((row) => row.series_id)).size, 1);
  assert.deepEqual(series.rows.map((row) => row.series_position), [0, 1, 2]);
  await assert.rejects(
    asUser(OWNER, (tx) => tx.query("select public.create_calendar_events($1,1,$2)", [JSON.stringify(eventPayload()), JSON.stringify([{ label: "X", url: "javascript:alert(1)" }])])),
    /CALENDAR_INVALID_LINK/,
  );
  await assert.rejects(
    asUser(OWNER, (tx) => tx.query("select public.create_calendar_events($1,1,$2)", [JSON.stringify(eventPayload()), JSON.stringify([{ label: "X", url: "https://user:secret@example.org" }])])),
    /CALENDAR_INVALID_LINK/,
  );
});

test("Nur der Ersteller ändert Kommunikation; wichtige Serienänderungen erzeugen einzelne Revisionen", async () => {
  const target = (await db.query("select id from public.events order by starts_at limit 1")).rows[0].id;
  await asUser(OWNER, (tx) => tx.query(
    "insert into public.event_participants(event_id,user_id,invited_email,invited_by,status) values($1,$2,'outsider@example.invalid',$3,'declined')",
    [target, OTHER, OWNER],
  ));
  await assert.rejects(
    asUser(ATHLETE, (tx) => tx.query("select public.update_calendar_event($1,$2,'single',false)", [target, JSON.stringify({ ...eventPayload(), location: "Neu", links: [] })])),
    /CALENDAR_FORBIDDEN/,
  );
  const updated = await asUser(OWNER, (tx) => tx.query(
    "select public.update_calendar_event($1,$2,'future',false)",
    [target, JSON.stringify({ ...eventPayload(), location: "Neue Halle", links: [{ label: "Plan", url: "https://example.org/plan" }] })],
  ));
  assert.equal(updated.rows.length, 3);
  assert.deepEqual((await db.query("select communication_revision from public.events order by starts_at")).rows.map((row) => row.communication_revision), [1, 1, 1]);
  assert.equal((await db.query("select count(*)::int count from public.event_communication_revisions")).rows[0].count, 3);
  assert.equal((await db.query("select acknowledged_revision from public.event_participants where event_id=$1 and user_id=$2", [target, OTHER])).rows[0].acknowledged_revision, 1);
});

test("Teilnahme, verspätete Antwort, freiwillige Erinnerung und Kenntnisnahme bleiben getrennt", async () => {
  const event = (await db.query("select id,communication_revision from public.events order by starts_at limit 1")).rows[0];
  await asUser(OWNER, (tx) => tx.query(
    "insert into public.event_participants(event_id,user_id,invited_email,invited_by) values($1,$2,'athlete@example.invalid',$3)",
    [event.id, ATHLETE, OWNER],
  ));
  assert.equal((await db.query("select reminder_enabled from public.event_participants where user_id=$1", [ATHLETE])).rows[0].reminder_enabled, false);
  await asUser(ATHLETE, (tx) => tx.query("select public.set_event_reminder($1,true)", [event.id]));
  await db.query("update public.events set response_deadline='2020-01-01T00:00:00Z' where id=$1", [event.id]);
  await asUser(ATHLETE, (tx) => tx.query(
    "update public.event_participants set status='confirmed',responded_at=now() where event_id=$1 and user_id=$2",
    [event.id, ATHLETE],
  ));
  const participant = (await db.query("select status,response_is_late,reminder_enabled,acknowledged_revision from public.event_participants where user_id=$1", [ATHLETE])).rows[0];
  assert.equal(participant.status, "confirmed");
  assert.equal(participant.response_is_late, true);
  await asUser(ATHLETE, (tx) => tx.query("select public.acknowledge_event_revision($1,$2)", [event.id, event.communication_revision]));
  const after = (await db.query("select status,acknowledged_revision from public.event_participants where user_id=$1", [ATHLETE])).rows[0];
  assert.equal(after.status, "confirmed");
  assert.equal(after.acknowledged_revision, event.communication_revision);
});

test("Aktiv verknüpfte Eltern erhalten begrenzte Hinweise, aber kein Antwortrecht", async () => {
  const event = (await db.query("select id from public.events order by starts_at limit 1")).rows[0];
  await asUser(OWNER, (tx) => tx.query(
    "select public.update_calendar_event($1,$2,'single',true)",
    [event.id, JSON.stringify({ ...eventPayload(), title: "Wichtig", links: [] })],
  ));
  const guardianNotice = await db.query("select link,message from public.notifications where user_id=$1 order by created_at desc limit 1", [GUARDIAN]);
  assert.equal(guardianNotice.rows[0].link, "/postfach");
  assert.doesNotMatch(guardianNotice.rows[0].message, /Park|Berlin|2098/);
  await assert.rejects(
    asUser(GUARDIAN, (tx) => tx.query("select public.acknowledge_event_revision($1,2)", [event.id])),
    /CALENDAR_FORBIDDEN/,
  );
  const noticeCount = (await db.query("select count(*)::int count from public.notifications where user_id=$1", [GUARDIAN])).rows[0].count;
  await db.query("update public.guardian_approval_requests set status='pending' where minor_user_id=$1", [ATHLETE]);
  await asUser(OWNER, (tx) => tx.query(
    "select public.update_calendar_event($1,$2,'single',true)",
    [event.id, JSON.stringify({ ...eventPayload(), title: "Noch wichtiger", location: "Andere Halle", links: [] })],
  ));
  assert.equal((await db.query("select count(*)::int count from public.notifications where user_id=$1", [GUARDIAN])).rows[0].count, noticeCount);
  await db.query("update public.guardian_approval_requests set status='approved' where minor_user_id=$1", [ATHLETE]);
});

test("Feed-Token sind gehasht, sofort widerrufbar und für Fremde unsichtbar", async () => {
  const hash = "a".repeat(64);
  await asUser(ATHLETE, (tx) => tx.query("select public.rotate_calendar_feed_token($1)", [hash]));
  assert.equal((await asUser(ATHLETE, (tx) => tx.query("select count(*)::int count from public.calendar_feed_tokens"))).rows[0].count, 1);
  assert.equal((await asUser(OTHER, (tx) => tx.query("select count(*)::int count from public.calendar_feed_tokens"))).rows[0].count, 0);
  await asUser(ATHLETE, (tx) => tx.query("select public.revoke_calendar_feed_token()"));
  assert.equal((await db.query("select count(*)::int count from public.calendar_feed_tokens where revoked_at is null")).rows[0].count, 0);
  await assert.rejects(
    asUser(ATHLETE, (tx) => tx.query("update public.calendar_feed_tokens set revoked_at=null where user_id=$1", [ATHLETE])),
    /CALENDAR_FORBIDDEN/,
  );
});

test("Reminder entstehen nur nach Opt-in, vor der Frist und je Stufe höchstens einmal", async () => {
  const event = (await db.query("select id from public.events where status='scheduled' order by starts_at desc limit 1")).rows[0];
  await asUser(OWNER, (tx) => tx.query(
    "insert into public.event_participants(event_id,user_id,invited_email,invited_by) values($1,$2,'outsider@example.invalid',$3)",
    [event.id, OTHER, OWNER],
  ));
  await db.query("update public.events set response_deadline=now()+interval '23 hours' where id=$1", [event.id]);
  await asService((tx) => tx.query("select * from public.calendar_claim_mail()"));
  assert.equal((await db.query("select count(*)::int count from private.calendar_communication_mail where kind='reminder' and user_id=$1", [OTHER])).rows[0].count, 0);

  await asUser(OTHER, (tx) => tx.query("select public.set_event_reminder($1,true)", [event.id]));
  await db.query("update public.event_participants set reminder_enabled_at=now()-interval '2 days' where event_id=$1 and user_id=$2", [event.id, OTHER]);
  await asService(async (tx) => {
    await tx.query("select * from public.calendar_claim_mail()");
    await tx.query("select * from public.calendar_claim_mail()");
  });
  assert.equal((await db.query("select count(*)::int count from private.calendar_communication_mail where kind='reminder' and user_id=$1 and reminder_stage=24", [OTHER])).rows[0].count, 1);
  assert.equal((await db.query("select count(*)::int count from public.notifications where user_id=$1 and dedupe_key like 'calendar:reminder:%'", [OTHER])).rows[0].count, 1);

  await db.query("update public.events set response_deadline=now()-interval '1 minute' where id=$1", [event.id]);
  await db.query("update private.calendar_communication_mail set available_at=now()-interval '1 minute',lease_id=null where user_id=$1 and kind='reminder'", [OTHER]);
  const afterDeadline = await asService((tx) => tx.query("select * from public.calendar_claim_mail()"));
  assert.equal(afterDeadline.rows.some((row) => row.email === "outsider@example.invalid" && row.subject === "Rückmeldung zum Termin offen"), false);
});

test("Konkurrierende Worker-Claims liefern dieselbe Zustellung höchstens einmal aus", async () => {
  const event = (await db.query("select id from public.events order by starts_at desc limit 1")).rows[0];
  const mailId = "40000000-0000-0000-0000-000000000001";
  await db.query(`insert into private.calendar_communication_mail(
    id,event_id,user_id,kind,dedupe_key,subject,body,link
  ) values($1,$2,$3,'changed','calendar:concurrent:test','Änderung','Bitte prüfen.',$4)`, [mailId, event.id, OTHER, `/kalender?event=${event.id}`]);
  const claim = () => asService((tx) => tx.query("select * from public.calendar_claim_mail()"));
  const claims = process.env.CALENDAR_NATIVE_PG_MODULE
    ? await Promise.all([claim(), claim()])
    : [await claim(), await claim()];
  assert.equal(claims.flatMap((result) => result.rows).filter((row) => row.id === mailId).length, 1);
});

test("Kommunizierte Absage bleibt erhalten und storniert vorhandene Fahrten", async () => {
  const event = (await db.query("select id from public.events order by starts_at limit 1")).rows[0];
  const ride = "30000000-0000-0000-0000-000000000001";
  await db.query("insert into public.carpool_rides(id,event_id,driver_id,direction,departure_at,origin,meeting_point,seats) values($1,$2,$3,'outbound','2098-06-01T15:00:00Z','A','B',2)", [ride, event.id, OWNER]);
  const result = await asUser(OWNER, (tx) => tx.query("select public.delete_or_cancel_calendar_event($1) result", [event.id]));
  assert.equal(result.rows[0].result, "cancelled");
  assert.equal((await db.query("select status from public.events where id=$1", [event.id])).rows[0].status, "cancelled");
  assert.equal((await db.query("select status from public.carpool_rides where id=$1", [ride])).rows[0].status, "cancelled");
  await assert.rejects(
    asUser(ATHLETE, (tx) => tx.query(
      "update public.event_participants set status='declined',responded_at=now() where event_id=$1 and user_id=$2",
      [event.id, ATHLETE],
    )),
    /CALENDAR_EVENT_CLOSED/,
  );
});
