import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Schritt 7c: täglicher Aufruf der Park-Speicherbereinigung über pg_cron und pg_net.
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
let db;

before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create schema private;");
  await db.exec(await read("./fixtures/release-scheduler.sql"));
  await db.exec(await read("../supabase/migrations/20260929120100_step_7c_park_cleanup_schedule.sql"));
});
after(async () => db?.close());

test("Park-Speicherbereinigung läuft täglich um 03:45 Uhr", async () => {
  const job = (await db.query("select schedule, command from cron.job where jobname='park-storage-cleanup-daily'")).rows[0];
  assert.deepEqual(job, { schedule: "45 3 * * *", command: "select private.park_dispatch_storage_cleanup()" });
});

test("Dispatcher ruft den Worker nur mit Vault-Werten auf", async () => {
  await db.query("select private.park_dispatch_storage_cleanup()");
  assert.equal((await db.query("select count(*)::int n from net.test_requests")).rows[0].n, 0);
  await db.query("insert into vault.decrypted_secrets values('carpool_worker_url','https://app.example/api/carpools/mail'),('carpool_cron_secret','s3cret')");
  await db.query("select private.park_dispatch_storage_cleanup()");
  const request = (await db.query("select url, headers from net.test_requests")).rows[0];
  assert.equal(request.url, "https://app.example/api/parks/storage-cleanup");
  assert.equal(request.headers.Authorization, "Bearer s3cret");
});
