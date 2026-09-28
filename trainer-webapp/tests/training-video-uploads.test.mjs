import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Prüft die Upload-Migration: Pfade, Rechte, Tageslimit und 14-Tage-Cleanup.
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const A = "00000000-0000-0000-0000-00000000000a"; // Athletin
const B = "00000000-0000-0000-0000-00000000000b"; // fremde Athletin
const T = "00000000-0000-0000-0000-00000000000c"; // Trainer von A
const SHARE = randomUUID();
let db;

before(async () => {
  db = new PGlite();
  await db.exec(await read("./fixtures/training-video-base.sql"));
  await db.exec(await read("./fixtures/release-scheduler.sql"));
  await db.exec(await read("../supabase/migrations/20260926090000_training_video_uploads.sql"));
  await db.query("insert into public.profiles values($1,'athlete'),($2,'athlete'),($3,'trainer')", [A, B, T]);
  await db.query("insert into public.relationships values($1,$2)", [T, A]);
  await db.query("insert into public.training_plan_snapshot_shares(id,recipient_user_id) values($1,$2)", [SHARE, A]);
  await db.query(
    "insert into public.training_trick_progress values($1,'t1',$2,'in_progress'),($1,'t2',$2,'in_progress'),($1,'t3',$2,'not_started')",
    [SHARE, A],
  );
});
after(async () => db?.close());

const as = (role, id, sql, params = []) =>
  db.transaction(async (tx) => {
    await tx.query(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id || ""]);
    return tx.query(sql, params);
  });
const path = (owner, ext = "mp4") => `${owner}/${randomUUID()}.${ext}`;
const upload = (id, name) =>
  as("authenticated", id, "insert into storage.objects(bucket_id,name,owner_id) values('training-evidence-videos',$1,$2)", [name, id]);
const report = (id, trick, fields) =>
  as(
    "authenticated",
    id,
    "insert into public.training_video_evidence(snapshot_share_id,trick_id,athlete_id,provider,storage_path,video_duration_seconds,athlete_comment) values($1,$2,$3,$4,$5,$6,$7) returning id",
    [SHARE, trick, id, fields.provider, fields.storagePath ?? null, fields.seconds ?? null, fields.note ?? ""],
  );

test("Bucket ist privat, 50 MB, nur MP4/MOV; Cleanup läuft täglich", async () => {
  const { rows } = await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id='training-evidence-videos'");
  assert.equal(rows[0].public, false);
  assert.equal(Number(rows[0].file_size_limit), 52428800);
  assert.deepEqual(rows[0].allowed_mime_types, ["video/mp4", "video/quicktime"]);
  const job = (await db.query("select schedule, command from cron.job where jobname='training-video-cleanup-daily'")).rows[0];
  assert.deepEqual(job, { schedule: "15 3 * * *", command: "select private.training_dispatch_video_cleanup()" });
});

test("Upload nur in den eigenen Ordner und nur als MP4/MOV", async () => {
  await upload(A, path(A, "mov"));
  await assert.rejects(upload(A, path(B)));
  await assert.rejects(upload(A, `${A}/${randomUUID()}.avi`));
  await assert.rejects(upload(B, path(B))); // B hat keinen geübten Trick
});

test("Meldung mit Video: eigenes, existierendes Video, max. 60 Sekunden", async () => {
  const own = path(A);
  await assert.rejects(report(A, "t1", { provider: "upload", storagePath: path(A), seconds: 12 }), "Datei fehlt");
  await upload(A, own);
  await assert.rejects(report(A, "t1", { provider: "upload", storagePath: own, seconds: 61 }), "zu lang");
  await assert.rejects(report(A, "t3", { provider: "upload", storagePath: own, seconds: 12 }), "Trick nicht geübt");
  await report(A, "t1", { provider: "upload", storagePath: own, seconds: 12 });
  // Gemeldete Videos kann die Athletin nicht mehr löschen, ungemeldete schon.
  await as("authenticated", A, "delete from storage.objects where name=$1", [own]);
  assert.equal((await db.query("select count(*)::int n from storage.objects where name=$1", [own])).rows[0].n, 1);
});

test("Meldung nur mit Notiz braucht Text", async () => {
  await assert.rejects(report(A, "t2", { provider: "note", note: "  " }));
  await report(A, "t2", { provider: "note", note: "4 von 5 sauber" });
});

test("Lesen dürfen nur Athletin und zugeordneter Trainer", async () => {
  const name = (await db.query("select name from storage.objects where owner_id=$1 limit 1", [A])).rows[0].name;
  const sees = async (id) => (await as("authenticated", id, "select count(*)::int n from storage.objects where name=$1", [name])).rows[0].n;
  assert.equal(await sees(A), 1);
  assert.equal(await sees(T), 1);
  assert.equal(await sees(B), 0);
});

test("Ohne geübten Trick keine Uploads; höchstens 10 Uploads pro 24 Stunden", async () => {
  // Beide geübten Tricks sind jetzt gemeldet → keine weiteren Uploads.
  await assert.rejects(upload(A, path(A)));
  await db.query("update public.training_trick_progress set status='in_progress' where trick_id='t3'");
  const count = (await db.query("select count(*)::int n from storage.objects where owner_id=$1", [A])).rows[0].n;
  for (let i = count; i < 10; i += 1) await upload(A, path(A));
  await assert.rejects(upload(A, path(A)));
});

test("Cleanup: Videos älter als 14 Tage und verwaiste Uploads älter als 1 Tag", async () => {
  const reported = (await db.query("select storage_path from public.training_video_evidence where provider='upload'")).rows[0].storage_path;
  await db.query("update storage.objects set created_at=now()-interval '15 days' where name=$1", [reported]);
  const orphan = (await db.query("select name from storage.objects where name<>$1 limit 1", [reported])).rows[0].name;
  await db.query("update storage.objects set created_at=now()-interval '2 days' where name=$1", [orphan]);

  await assert.rejects(as("authenticated", A, "select * from public.training_expired_video_objects(10)"));
  const expired = (await as("service_role", null, "select name from public.training_expired_video_objects(10)")).rows.map((r) => r.name);
  assert.deepEqual(expired.sort(), [orphan, reported].sort());

  const changed = (await as("service_role", null, "select public.training_mark_videos_removed($1) n", [[reported]])).rows[0].n;
  assert.equal(changed, 1);
  const row = (await db.query("select storage_path, video_removed_at, review_status from public.training_video_evidence where provider='upload'")).rows[0];
  assert.equal(row.storage_path, null);
  assert.ok(row.video_removed_at);
  assert.equal(row.review_status, "pending"); // Meldung bleibt erhalten
});

test("Cleanup-Dispatcher ruft den Worker nur mit Vault-Werten auf", async () => {
  await db.query("select private.training_dispatch_video_cleanup()");
  assert.equal((await db.query("select count(*)::int n from net.test_requests")).rows[0].n, 0);
  await db.query("insert into vault.decrypted_secrets values('carpool_worker_url','https://app.example/api/carpools/mail'),('carpool_cron_secret','s3cret')");
  await db.query("select private.training_dispatch_video_cleanup()");
  const request = (await db.query("select url, headers from net.test_requests")).rows[0];
  assert.equal(request.url, "https://app.example/api/training/video-cleanup");
  assert.equal(request.headers.Authorization, "Bearer s3cret");
});
