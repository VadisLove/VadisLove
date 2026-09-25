-- Isoliertes Abbild der produktiven Nachweis-Tabelle (Stand 20260716) samt
-- Storage-/Cron-Doubles für die Upload-Migration. Keine Echtdaten.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
grant usage on schema public, auth, private to authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function private.current_account_is_active() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create table public.profiles(id uuid primary key, account_type text);
create table public.relationships(trainer_id uuid, athlete_id uuid);
create function private.has_active_trainer_athlete_relationship(t uuid, a uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.relationships r where r.trainer_id=t and r.athlete_id=a) $$;
create type public.trick_progress_status as enum ('not_started','in_progress','awaiting_confirmation','confirmed');
create type public.training_evidence_review_status as enum ('pending','approved','changes_requested');
create table public.training_plan_snapshot_shares(id uuid primary key, target_type text default 'person', recipient_user_id uuid);
create table public.training_trick_progress(snapshot_share_id uuid, trick_id text, athlete_id uuid, status public.trick_progress_status, primary key(snapshot_share_id, trick_id));
grant select on public.training_plan_snapshot_shares, public.training_trick_progress to authenticated;
-- Vereinfachter Statuswechsel; die echte Funktion prüft zusätzlich Rollen.
create function public.update_training_trick_progress(s uuid, t text, p public.trick_progress_status) returns void language sql security definer set search_path='' as $$ update public.training_trick_progress set status=p where snapshot_share_id=s and trick_id=t $$;

create table public.training_video_evidence (
  id uuid primary key default gen_random_uuid(),
  snapshot_share_id uuid not null references public.training_plan_snapshot_shares(id) on delete cascade,
  trick_id text not null,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  video_id text not null,
  athlete_comment text not null default '',
  attempt_count integer not null,
  self_rating smallint not null,
  submitted_at timestamptz not null default now(),
  review_status public.training_evidence_review_status not null default 'pending',
  trainer_feedback text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  check (char_length(btrim(trick_id)) between 1 and 160),
  check (provider = 'youtube'),
  check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  check (char_length(athlete_comment) <= 2000),
  check (attempt_count between 1 and 100000),
  check (self_rating between 1 and 5)
);
create unique index training_video_evidence_one_pending_idx on public.training_video_evidence(snapshot_share_id, trick_id, athlete_id) where review_status = 'pending';
create function private.validate_training_video_evidence_review() returns trigger language plpgsql as $$ begin return new; end $$;
create function private.sync_training_video_evidence_progress() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger training_video_evidence_validate_review before update on public.training_video_evidence for each row execute procedure private.validate_training_video_evidence_review();
create trigger training_video_evidence_sync_progress after insert or update on public.training_video_evidence for each row execute procedure private.sync_training_video_evidence_progress();
alter table public.training_video_evidence enable row level security;
create policy "training_video_evidence_read_related" on public.training_video_evidence for select to authenticated using (athlete_id = auth.uid() or private.has_active_trainer_athlete_relationship(auth.uid(), athlete_id));
create policy "training_video_evidence_create_own_assignment" on public.training_video_evidence for insert to authenticated with check (athlete_id = auth.uid());
grant select, insert on public.training_video_evidence to authenticated;
grant select, update on public.training_video_evidence to service_role;

create schema storage;
grant usage on schema storage to authenticated, service_role;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, created_at timestamptz default now());
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
grant select on storage.objects to service_role;
