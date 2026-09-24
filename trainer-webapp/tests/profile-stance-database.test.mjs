import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Isolierte Datenbank ohne Nutzerdaten: echte Migration und bisherige Ladefunktion.
test("Stance-Migration erhält eigene Profilrechte und speichert alle Optionen", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function private.current_account_is_active() returns boolean language sql stable as
        $$select coalesce(current_setting('test.active',true),'true') = 'true'$$;
      create type public.profile_visibility as enum ('private','contacts','all_members');
      create type public.account_type as enum ('athlete');
      create table public.profiles(id uuid primary key,first_name text,last_name text,
        display_name text,email text,phone text,location text,bio text,disciplines text[],
        visibility public.profile_visibility,avatar_path text,account_type public.account_type);
      insert into public.profiles(id) values
        ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      grant usage on schema public,auth,private to authenticated;
      grant select(id), update on public.profiles to authenticated;
      alter table public.profiles enable row level security;
      create policy own_read on public.profiles for select to authenticated
        using(id=auth.uid() and private.current_account_is_active());
      create policy own_update on public.profiles for update to authenticated
        using(id=auth.uid() and private.current_account_is_active())
        with check(id=auth.uid() and private.current_account_is_active());
    `);
    const old = await readFile(new URL("../supabase/migrations/20260901114523_restrict_profile_contact_columns.sql", import.meta.url), "utf8");
    await db.exec(old.slice(old.indexOf("create or replace function public.get_own_profile()"), old.indexOf("-- Kontaktfelder")));
    await db.exec(await readFile(new URL("../supabase/migrations/20260924102610_add_profile_stance.sql", import.meta.url), "utf8"));
    assert.equal((await db.query("select count(*)::int as n from public.profiles where stance is null")).rows[0].n, 2);
    await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
    for (const stance of ["regular", "goofy", null]) {
      await db.query("update public.profiles set stance=$1 where id=auth.uid()", [stance]);
      const { rows } = await db.query("select id,stance from public.get_own_profile()");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].stance, stance);
    }
    await assert.rejects(db.query("update public.profiles set stance='switch' where id=auth.uid()"), /profiles_stance_check/);
    assert.equal((await db.query("update public.profiles set stance='goofy' where id='00000000-0000-0000-0000-000000000002' returning id")).rows.length, 0);
    await db.exec("select set_config('test.active','false',false)");
    assert.equal((await db.query("select * from public.get_own_profile()")).rows.length, 0);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from public.get_own_profile()"), /permission denied/);
  } finally { await db.close(); }
});
