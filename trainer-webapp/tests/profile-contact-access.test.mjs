import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260901114523_restrict_profile_contact_columns.sql",
  import.meta.url,
);
const profileRepositoryUrl = new URL(
  "../src/data/profile-repository.ts",
  import.meta.url,
);
const calendarActionsUrl = new URL(
  "../src/app/kalender/actions.ts",
  import.meta.url,
);
const eventRepositoryUrl = new URL(
  "../src/data/supabase-event-repository.ts",
  import.meta.url,
);

const [sql, profileRepository, calendarActions, eventRepository] =
  await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(profileRepositoryUrl, "utf8"),
    readFile(calendarActionsUrl, "utf8"),
    readFile(eventRepositoryUrl, "utf8"),
  ]);

test("entfernt den direkten Data-API-Zugriff auf Profil-Kontaktfelder", () => {
  assert.match(
    sql,
    /revoke select on public\.profiles from authenticated/i,
  );

  const publicColumnGrant = sql.match(
    /grant select\s*\(([\s\S]*?)\)\s*on public\.profiles to authenticated/i,
  );
  assert.ok(publicColumnGrant, "Ein expliziter Grant fuer oeffentliche Spalten fehlt.");
  assert.match(publicColumnGrant[1], /\bid\b/i);
  assert.match(publicColumnGrant[1], /\bdisplay_name\b/i);
  assert.match(publicColumnGrant[1], /\baccount_type\b/i);
  assert.match(publicColumnGrant[1], /\bbio\b/i);
  assert.match(publicColumnGrant[1], /\bdisciplines\b/i);
  assert.match(publicColumnGrant[1], /\bvisibility\b/i);
  assert.doesNotMatch(
    publicColumnGrant[1],
    /\b(email|phone|location)\b/i,
  );
});

test("bindet Detail- und E-Mail-RPCs an das aktive eigene Konto", () => {
  assert.match(
    sql,
    /function private\.current_profile_email\(\)[\s\S]*profile\.id = \(select auth\.uid\(\)\)[\s\S]*private\.current_account_is_active\(\)/i,
  );
  assert.match(
    sql,
    /function public\.get_own_profile\(\)[\s\S]*profile\.id = \(select auth\.uid\(\)\)[\s\S]*private\.current_account_is_active\(\)/i,
  );
  assert.match(
    sql,
    /revoke execute on function public\.get_own_profile\(\)[\s\S]*from public, anon/i,
  );
  assert.match(profileRepository, /\.rpc\("get_own_profile"\)/i);
});

test("loest Termineinladungen nur fuer berechtigte Verwalter auf", () => {
  assert.match(
    sql,
    /function public\.resolve_event_participant_profile[\s\S]*event\.created_by = actor_id[\s\S]*private\.can_manage_organization\(event\.organization_id\)[\s\S]*private\.can_view_profile_contact_data\(profile\.id\)/i,
  );
  assert.match(
    sql,
    /function private\.can_view_profile_contact_data[\s\S]*target_user_id = \(select auth\.uid\(\)\)[\s\S]*private\.are_connected[\s\S]*private\.can_manage_organization/i,
  );
  assert.match(
    calendarActions,
    /\.rpc\(\s*"resolve_event_participant_profile"/i,
  );
  assert.doesNotMatch(
    `${calendarActions}\n${eventRepository}`,
    /profiles:user_id\([^)]*\bemail\b/i,
  );
});

test("erhaelt eigene E-Mail-Vergleiche ohne allgemeines Spaltenrecht", () => {
  assert.match(sql, /function public\.get_current_profile_email\(\)/i);
  assert.match(
    sql,
    /account_invitations_read_related[\s\S]*email = private\.current_profile_email\(\)/i,
  );
  assert.match(
    sql,
    /participants_read_related[\s\S]*invited_email = private\.current_profile_email\(\)/i,
  );
  assert.match(
    `${calendarActions}\n${eventRepository}`,
    /\.rpc\(\s*"get_current_profile_email"/i,
  );
});
