import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260901113922_add_guardian_registration_approval.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");

test("Elternfreigaben und Dokumentannahmen sind per RLS lesegeschuetzt", () => {
  assert.match(migration, /alter table public\.guardian_approval_requests enable row level security/i);
  assert.match(migration, /alter table public\.legal_document_acceptances enable row level security/i);
  assert.match(migration, /revoke all on table public\.guardian_approval_requests from anon, authenticated/i);
  assert.match(migration, /grant select on table public\.guardian_approval_requests to authenticated/i);
});

test("Freigabelinks werden nur gehasht gespeichert und koennen rotiert werden", () => {
  assert.match(migration, /token_hash text not null unique/i);
  assert.match(migration, /extensions\.digest\(approval_token, 'sha256'\)/i);
  assert.match(migration, /create or replace function public\.rotate_guardian_approval_token\(target_minor_user_id uuid\)/i);
});

test("Geburtsdatum und Token-Metadaten werden nach der Alterspruefung entfernt", () => {
  const approvalTable = migration.match(
    /create table public\.guardian_approval_requests \(([\s\S]*?)\n\);/i,
  )?.[1] || "";
  assert.match(migration, /raw_user_meta_data.*- array\[/is);
  assert.match(migration, /'birth_date'/i);
  assert.match(migration, /'guardian_approval_token_hash'/i);
  assert.doesNotMatch(approvalTable, /birth_date\s+date/i);
});

test("Nicht freigegebene Minderjaehrige gelten im zentralen RLS-Helfer als inaktiv", () => {
  assert.match(migration, /approval\.guardian_required_until > current_date/i);
  assert.match(migration, /approval\.status <> 'approved'/i);
});

test("Der Aktivitaetscheck wird als restriktive Policy auf Fachdaten erzwungen", () => {
  assert.match(migration, /create policy "active_accounts_only"/i);
  assert.match(migration, /as restrictive for all to authenticated/i);
  assert.match(migration, /private\.current_account_is_active\(\)/i);
  assert.doesNotMatch(
    migration.match(/foreach protected_table in array array\[([\s\S]*?)\]/i)?.[1] || "",
    /guardian_approval_requests|legal_document_acceptances|account_deletion_requests/i,
  );
});
