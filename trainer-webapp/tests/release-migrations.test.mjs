import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const migrations = [
  "20260901113922_add_guardian_registration_approval.sql",
  "20260903080920_carpool_release.sql",
  "20260903082255_carpool_mail_schedule.sql",
  "20260921102535_step_2_auth_onboarding.sql",
];
let db;

before(async () => {
  if (process.env.RELEASE_TEST_DATABASE_URL) {
    // Nur eine frische lokale Datenbank mit einem expliziten Schemaexport nutzen.
    // Das exportierte Anwendungsschema enthält keine produktiven Datensätze.
    const connectionString = process.env.RELEASE_TEST_DATABASE_URL;
    assert.ok(
      ["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname),
    );
    assert.ok(process.env.RELEASE_TEST_SCHEMA_PATH);
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
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from pg_tables where schemaname='public'",
        )
      ).rows[0].n,
      0,
    );
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private; create schema extensions;
      grant usage on schema auth,extensions to anon,authenticated,service_role;
      create extension pgcrypto with schema extensions;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      set check_function_bodies=off;
    `);
    await db.exec(await readFile(process.env.RELEASE_TEST_SCHEMA_PATH, "utf8"));
    // Nur der Schemaimport benötigt Vorwärtsreferenzen. Die Release-Migrationen
    // müssen anschließend mit regulärer Funktionsprüfung kompilieren.
    await db.exec("set check_function_bodies=on");
  } else {
    db = new PGlite();
    await db.exec(await read("./fixtures/guardian-base.sql"));
    // Ergänzt nur die bestehenden Terminverträge; beide Fachmigrationen folgen
    // tatsächlich nacheinander, statt eine Elternfreigabetabelle vorzutäuschen.
    await db.exec(`
      alter table public.organizations add column name text;
      alter table public.organizations add column parent_id uuid;
      alter table public.organizations add column state_code text;
      create table public.events(id uuid primary key,organization_id uuid,created_by uuid,title text,type text,starts_at timestamptz,ends_at timestamptz,location text);
      create table public.organization_memberships(organization_id uuid,user_id uuid,role public.member_role);
      create function private.is_organization_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_memberships where organization_id=target and user_id=auth.uid())$$;
      create function private.can_view_event_organization(target uuid) returns boolean language sql stable as $$select false$$;
      create function private.can_view_social_activity(target uuid) returns boolean language sql stable as $$select false$$;
      alter table public.events enable row level security;
      grant select on public.events to authenticated;
      create policy events_read on public.events for select to authenticated using(created_by=auth.uid() or private.is_organization_member(organization_id));
    `);
  }
  await db.exec(await read("./fixtures/release-scheduler.sql"));
  for (const name of migrations) {
    // Eigene Transaktion pro Migration entspricht dem Releaseablauf, insbesondere
    // der PostgreSQL-Regel zur Verwendung neu hinzugefügter Enum-Werte.
    const sql = await read(`../supabase/migrations/${name}`);
    await db.transaction((tx) => tx.exec(sql));
  }
  if (!process.env.RELEASE_TEST_DATABASE_URL) {
    await db.exec(
      "create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()",
    );
  }
});
after(async () => {
  await db?.close();
});

async function asRole(role, id, sql, params = []) {
  assert.ok(["anon", "authenticated", "service_role"].includes(role));
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      id || "",
    ]);
    return tx.query(sql, params);
  });
}

test("Alle vier Release-Migrationen installieren Tabellen, RLS und genau einen Scheduler", async () => {
  const { rows } = await db.query(
    "select relname,relrowsecurity from pg_class where relname in ('guardian_approval_requests','legal_document_acceptances','carpool_rides','carpool_requests','carpool_comments','carpool_preferences','carpool_wanted')",
  );
  assert.equal(rows.length, 7);
  assert.ok(rows.every((row) => row.relrowsecurity));
  assert.deepEqual(
    (await db.query("select jobname,schedule,command from cron.job")).rows,
    [
      {
        jobname: "carpool-mail-every-minute",
        schedule: "* * * * *",
        command: "select private.carpool_dispatch_mail_worker()",
      },
    ],
  );
});
test("Scheduler bleibt ohne Vault-Werte inaktiv und lehnt eine falsche URL ab", async () => {
  await db.query("select private.carpool_dispatch_mail_worker()");
  assert.equal(
    (await db.query("select count(*)::int n from net.test_requests")).rows[0].n,
    0,
  );
  await db.query(
    "insert into vault.decrypted_secrets values('carpool_worker_url','http://invalid.example/api/carpools/mail'),('carpool_cron_secret','synthetic-cron-value')",
  );
  await assert.rejects(
    db.query("select private.carpool_dispatch_mail_worker()"),
    /Invalid carpool worker URL/,
  );
  await db.query(
    "update vault.decrypted_secrets set decrypted_secret='https://trainer-webapp-ruby.vercel.app/api/carpools/mail' where name='carpool_worker_url'",
  );
});
test("Scheduler übergibt den Vault-Wert ausschließlich als Bearer-Header", async () => {
  await db.query("select private.carpool_dispatch_mail_worker()");
  assert.deepEqual(
    (
      await db.query(
        "select url,headers,timeout_milliseconds from net.test_requests",
      )
    ).rows,
    [
      {
        url: "https://trainer-webapp-ruby.vercel.app/api/carpools/mail",
        headers: { Authorization: "Bearer synthetic-cron-value" },
        timeout_milliseconds: 60000,
      },
    ],
  );
});
test("Browserrollen dürfen weder Scheduler auslösen noch Vault-Werte lesen", async () => {
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(
      asRole(
        role,
        randomUUID(),
        "select private.carpool_dispatch_mail_worker()",
      ),
      /permission denied/,
    );
    await assert.rejects(
      asRole(role, randomUUID(), "select * from vault.decrypted_secrets"),
      /permission denied/,
    );
  }
});

test("Migrationskette: Registrierung, Elternverknüpfung, Fahrten und letzter Platz funktionieren zusammen", async () => {
  const driver = randomUUID(),
    child = randomUUID(),
    other = randomUUID(),
    guardian = randomUUID(),
    outsider = randomUUID();
  const organization = randomUUID(),
    event = randomUUID();
  for (const id of [driver, guardian, child, other, outsider]) {
    const metadata = {
      display_name: "Release fixture",
      account_type: id === guardian ? "guardian" : "athlete",
      birth_date:
        id === child ? `${new Date().getFullYear() - 15}-01-01` : "2000-01-01",
      guardian_email: `${guardian}@example.invalid`,
      legal_terms_accepted: true,
      terms_version: "draft-2026-09-01",
      privacy_version: "draft-2026-09-01",
    };
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [id, `${id}@example.invalid`, metadata],
    );
  }
  const issued = await asRole(
    "service_role",
    null,
    "select * from public.rotate_guardian_approval_token($1)",
    [child],
  );
  await asRole(
    "anon",
    null,
    "select public.respond_guardian_approval($1,'approved','Test Guardian','draft-2026-09-01','draft-2026-09-01')",
    [issued.rows[0].approval_token],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.relationships where guardian_user_id=$1 and athlete_user_id=$2 and active",
        [guardian, child],
      )
    ).rows[0].n,
    1,
  );
  // Die echte Hierarchie verlangt Athletenmitgliedschaften auf Vereinsebene.
  const federal = randomUUID(),
    state = randomUUID();
  await db.query(
    "insert into public.organizations(id,name,level) values($1,'Release federation','federal')",
    [federal],
  );
  await db.query(
    "insert into public.organizations(id,name,level,parent_id,state_code) values($1,'Release state','state',$2,'BE')",
    [state, federal],
  );
  await db.query(
    "insert into public.organizations(id,name,level,parent_id,state_code) values($1,'Release club','club',$2,'BE')",
    [organization, state],
  );
  for (const id of [driver, child, other]) {
    await db.query(
      "insert into public.organization_memberships(organization_id,user_id,role) values($1,$2,'athlete')",
      [organization, id],
    );
  }
  await db.query(
    "insert into public.events(id,organization_id,created_by,title,type,starts_at,ends_at,location) values($1,$2,$3,'Release fixture','training','2099-09-05T12:00:00Z','2099-09-05T14:00:00Z','Park')",
    [event, organization, driver],
  );
  const command = (id, operation, payload) =>
    asRole("authenticated", id, "select public.carpool_command($1,$2,$3)", [
      randomUUID(),
      operation,
      JSON.stringify(payload),
    ]);
  await command(driver, "offer", {
    event_id: event,
    attested: true,
    legs: [
      {
        direction: "outbound",
        seats: 1,
        departure_at: "2099-09-05T10:00:00Z",
        origin: "Berlin",
        meeting_point: "Fixture",
        note: "",
      },
    ],
  });
  const ride = (
    await db.query("select id from public.carpool_rides where event_id=$1", [
      event,
    ])
  ).rows[0].id;
  await command(child, "request", { ride_id: ride });
  await command(other, "request", { ride_id: ride });
  const requests = (
    await db.query("select id from public.carpool_requests where ride_id=$1", [
      ride,
    ])
  ).rows;
  // Der native Modus verwendet zwei Pool-Verbindungen und echte Zeilensperren.
  // PGlite belegt hier nur das fachliche Ergebnis, nicht native Konkurrenz.
  const confirmations = await Promise.allSettled(
    requests.map((request) =>
      command(driver, "confirm", { ride_id: ride, request_id: request.id }),
    ),
  );
  assert.equal(
    confirmations.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.match(
    confirmations.find((result) => result.status === "rejected").reason.message,
    /CARPOOL_FULL/,
  );
  const parentView = await asRole(
    "authenticated",
    guardian,
    "select public.carpool_snapshot(null,$1) data",
    [ride],
  );
  assert.equal(parentView.rows[0].data.rides.length, 1);
  assert.equal(parentView.rows[0].data.rides[0].requests.length, 1);
  assert.equal(
    (
      await asRole(
        "authenticated",
        guardian,
        "select id from public.events where id=$1",
        [event],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await asRole(
        "authenticated",
        outsider,
        "select id from public.carpool_rides where id=$1",
        [ride],
      )
    ).rows.length,
    0,
  );
});
