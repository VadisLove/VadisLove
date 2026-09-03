import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

let db;
const version = "draft-2026-09-01";
const hash = (value) => createHash("sha256").update(value).digest("hex");
before(async () => {
  // Optional gegen eine bereits migrierte Kopie des vollständigen App-Schemas testen.
  // Echte Produktionsdatenbanken sind durch die Loopback-Prüfung ausgeschlossen.
  if (process.env.GUARDIAN_TEST_DATABASE_URL) {
    const connectionString = process.env.GUARDIAN_TEST_DATABASE_URL;
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname));
    const { default: pg } = await import(process.env.CARPOOL_NATIVE_PG_MODULE);
    const client = new pg.Client({ connectionString });
    await client.connect();
    db = { query: (...args) => client.query(...args), exec: (sql) => client.query(sql), close: () => client.end() };
  } else {
    db = new PGlite();
    await db.exec(await readFile(new URL("./fixtures/guardian-base.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260901113922_add_guardian_registration_approval.sql", import.meta.url), "utf8"));
    await db.exec("create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()");
  }
});
after(async () => { await db?.close(); });

async function register(overrides = {}) {
  const id = randomUUID();
  const metadata = {
    display_name: "Release fixture",
    account_type: "athlete",
    birth_date: "2000-01-01",
    legal_terms_accepted: true,
    terms_version: version,
    privacy_version: version,
    ...overrides,
  };
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [id, `${id}@example.invalid`, metadata]);
  return id;
}
async function role(name, id, callback) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${name}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id || ""]);
    const result = await callback();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
async function pending() {
  return register({ birth_date: `${new Date().getFullYear() - 15}-01-01`, guardian_email: `guardian-${randomUUID()}@example.invalid`, guardian_approval_token_hash: hash("attacker-selected-token-which-is-long-enough") });
}
async function issue(id) {
  return role("service_role", null, async () => (await db.query("select * from public.rotate_guardian_approval_token($1)", [id])).rows[0]);
}
async function approve(token, terms = version, name = "Test Guardian") {
  return role("anon", null, () => db.query("select public.respond_guardian_approval($1,'approved',$2,$3,$4) as status", [token, name, terms, version]));
}

test("Registrierung lehnt fehlendes Alter, Unter-13-Jährige und fehlende Dokumentversionen ab", async () => {
  for (const metadata of [{birth_date: null}, {birth_date: ""}, {birth_date: "2099-01-01"}, {terms_version: null}, {privacy_version: null}]) {
    await assert.rejects(register(metadata), /birth date|age 13|legal documents/i);
  }
});
test("Erwachsene erhalten ein aktives Konto; Geburtsdaten werden aus Auth-Metadaten entfernt", async () => {
  const id = await register();
  const { rows } = await db.query("select private.account_is_active($1) as active,raw_user_meta_data as metadata from auth.users where id=$1", [id]);
  assert.equal(rows[0].active, true);
  assert.equal(rows[0].metadata.birth_date, undefined);
});
test("Minderjährige können weder einen selbst gewählten Token nutzen noch einen neuen abrufen", async () => {
  const id = await pending();
  await assert.rejects(approve("attacker-selected-token-which-is-long-enough"), /not found/i);
  await assert.rejects(role("authenticated", id, () => db.query("select * from public.rotate_guardian_approval_token($1)", [id])), /permission denied/i);
  await assert.rejects(role("anon", null, () => db.query("select * from public.rotate_guardian_approval_token($1)", [id])), /permission denied/i);
  const { rows } = await role("authenticated", id, () => db.query("select id from public.profiles where id=$1", [id]));
  assert.equal(rows.length, 0);
});
test("Server versendet an die gespeicherte Elternadresse; Freigabe aktiviert das Konto genau einmal", async () => {
  const id = await pending();
  const token = await issue(id);
  assert.match(token.guardian_email, /^guardian-/);
  assert.equal((await approve(token.approval_token)).rows[0].status, "approved");
  assert.equal((await approve(token.approval_token)).rows[0].status, "approved");
  assert.equal((await db.query("select private.account_is_active($1) as active", [id])).rows[0].active, true);
  assert.equal((await db.query("select count(*)::int as count from public.notifications where user_id=$1 and type='guardian_activity'", [id])).rows[0].count, 1);
});
test("Direkte Freigabe mit fehlendem Namen oder fehlender Dokumentannahme bleibt gesperrt", async () => {
  const id = await pending(); const token = await issue(id);
  await assert.rejects(approve(token.approval_token, null), /version mismatch/i);
  await assert.rejects(approve(token.approval_token, version, null), /name is required/i);
  assert.equal((await db.query("select private.account_is_active($1) as active", [id])).rows[0].active, false);
});
test("Tokenrotation ist begrenzt und macht den vorherigen Link unbrauchbar", async () => {
  const id = await pending(); const first = await issue(id);
  assert.equal(await issue(id), undefined);
  await db.query("update public.guardian_approval_requests set token_issued_at=now()-interval '2 minutes' where minor_user_id=$1", [id]);
  const second = await issue(id);
  assert.notEqual(first.approval_token, second.approval_token);
  await assert.rejects(approve(first.approval_token), /not found/i);
  await approve(second.approval_token);
});
