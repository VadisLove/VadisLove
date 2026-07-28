import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260728091747_profile_security_workflows.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

test("erzwingt höchstens einen aktiven Startverband datenbankseitig", () => {
  assert.match(sql, /create unique index athlete_federation_one_active_idx[\s\S]*where active;/i);
  assert.match(sql, /validate_athlete_federation_affiliation/i);
  assert.match(sql, /The athlete is not eligible for this federation/i);
});

test("macht Vereins-Austritt und Startverbandswechsel transaktional und nachvollziehbar", () => {
  assert.match(sql, /function public\.leave_club_membership/i);
  assert.match(sql, /function public\.set_active_athlete_federation/i);
  assert.match(sql, /memberships_invalidate_federation/i);
  assert.match(sql, /federation_invalidated/i);
  assert.match(sql, /profile_audit_events/i);
  assert.match(sql, /'club_left'::public\.notification_type/i);
  assert.match(sql, /'federation_changed'::public\.notification_type/i);
});

test("schützt die letzte verantwortliche Person vor Austritt und Kontolöschung", () => {
  const successorChecks = sql.match(/successor must be assigned/gi) || [];
  assert.ok(successorChecks.length >= 2);
  assert.match(sql, /organization\.level = 'federal'[\s\S]*'federal_chair'/i);
  assert.match(sql, /organization\.level = 'state'[\s\S]*'specialist'/i);
  assert.match(sql, /organization\.level = 'club'[\s\S]*'club_board'/i);
});

test("deaktiviert sofort, erlaubt 30 Tage Wiederherstellung und finalisiert serverseitig", () => {
  assert.match(sql, /scheduled_for timestamptz not null default \(now\(\) \+ interval '30 days'\)/i);
  assert.match(sql, /function public\.schedule_account_deletion/i);
  assert.match(sql, /function public\.restore_account/i);
  assert.match(sql, /scheduled_for > now\(\)/i);
  assert.match(sql, /function public\.finalize_due_account_deletion/i);
  assert.match(sql, /grant execute on function public\.finalize_due_account_deletion\(uuid\)[\s\S]*to service_role/i);
  assert.match(sql, /delete from public\.group_invitations[\s\S]*invited_by = p_user_id/i);
  assert.match(sql, /update public\.event_participants[\s\S]*set invited_email = null/i);
  assert.match(sql, /display_name = 'Geloeschtes Konto'/i);
});

test("sichert Profilfelder, Bilder und deaktivierte Sessions über RLS", () => {
  assert.match(sql, /Protected profile fields cannot be changed here/i);
  assert.match(sql, /create policy "profiles_update_active_self"/i);
  assert.match(sql, /'active_account_required'/i);
  assert.match(sql, /create policy %I[\s\S]*as restrictive/i);
  assert.match(sql, /bucket_id = 'profile-photos'[\s\S]*owner_id = \(select auth\.uid\(\)\)::text/i);
  assert.match(sql, /profile_photos_read_visible[\s\S]*private\.current_account_is_active\(\)/i);
  assert.match(sql, /private\.can_view_profile/i);
  assert.match(sql, /file_size_limit[\s\S]*5242880/i);
});
