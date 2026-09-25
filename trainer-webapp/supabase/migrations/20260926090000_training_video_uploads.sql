-- Trick-Videos direkt hochladen (Aufnahme oder Galerie) statt YouTube-Link.
--
-- Einschränkungen:
--   * privater Bucket, nur MP4/MOV, höchstens 50 MB und 60 Sekunden
--   * Upload nur für Athlet*innen mit einem Trick im Status „Geübt“
--   * höchstens 10 Uploads pro Athlet*in in 24 Stunden
--   * lesen dürfen nur der/die Athlet*in selbst und zugeordnete Trainer*innen
--   * gemeldete Videos kann der/die Athlet*in nicht mehr heimlich löschen
-- Aufräumen:
--   * täglich 03:15 Uhr ruft pg_cron den Vercel-Worker auf, der Videos
--     älter als 14 Tage (und nie gemeldete Uploads älter als 1 Tag) über die
--     Storage-API löscht; der Nachweis bleibt ohne Video erhalten.

-- ---------------------------------------------------------------------------
-- Nachweis-Tabelle: Quelle youtube | upload | note
-- ---------------------------------------------------------------------------

alter table public.training_video_evidence
  drop constraint training_video_evidence_provider_check,
  drop constraint training_video_evidence_video_id_check,
  alter column video_id drop not null,
  alter column attempt_count drop not null,
  alter column self_rating drop not null,
  add column storage_path text,
  add column video_duration_seconds smallint,
  add column video_removed_at timestamptz;

alter table public.training_video_evidence
  add constraint training_video_evidence_source_check check (
    (
      provider = 'youtube'
      and video_id ~ '^[A-Za-z0-9_-]{11}$'
      and storage_path is null
    )
    or (
      provider = 'upload'
      and video_id is null
      and video_duration_seconds between 1 and 60
      and (
        -- Nach Ablauf der 14 Tage bleibt nur der Löschzeitpunkt stehen.
        (storage_path is null and video_removed_at is not null)
        or (
          video_removed_at is null
          and storage_path ~ (
            '^' || athlete_id::text ||
            '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|mov)$'
          )
        )
      )
    )
    or (
      provider = 'note'
      and video_id is null
      and storage_path is null
      and char_length(btrim(athlete_comment)) > 0
    )
  );

create index training_video_evidence_storage_path_idx
  on public.training_video_evidence(storage_path)
  where storage_path is not null;

-- Einreichungsdaten bleiben unveränderlich. Einzige Ausnahme: der Cleanup
-- entfernt nach Ablauf den Speicherpfad (über private.training_mark_videos_removed).
create or replace function private.validate_training_video_evidence_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.training_video_cleanup', true) = 'on' then
    if new.storage_path is null
      and new.video_removed_at is not null
      and (to_jsonb(new) - array['storage_path', 'video_removed_at'])
        = (to_jsonb(old) - array['storage_path', 'video_removed_at']) then
      return new;
    end if;
    raise exception 'Cleanup darf nur den Videopfad entfernen.' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  if new.snapshot_share_id is distinct from old.snapshot_share_id
    or new.trick_id is distinct from old.trick_id
    or new.athlete_id is distinct from old.athlete_id
    or new.provider is distinct from old.provider
    or new.video_id is distinct from old.video_id
    or new.storage_path is distinct from old.storage_path
    or new.video_duration_seconds is distinct from old.video_duration_seconds
    or new.video_removed_at is distinct from old.video_removed_at
    or new.athlete_comment is distinct from old.athlete_comment
    or new.attempt_count is distinct from old.attempt_count
    or new.self_rating is distinct from old.self_rating
    or new.submitted_at is distinct from old.submitted_at then
    raise exception 'Einreichungsdaten duerfen nachtraeglich nicht veraendert werden.'
      using errcode = '42501';
  end if;

  if old.review_status <> 'pending'
    or new.review_status not in ('approved', 'changes_requested')
    or new.reviewed_by is distinct from auth.uid()
    or new.reviewed_at is null then
    raise exception 'Diese Pruefentscheidung ist nicht erlaubt.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Der Status-Sync reagiert nur auf Prüfentscheidungen, nicht auf den Cleanup.
create or replace function private.sync_training_video_evidence_progress()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.update_training_trick_progress(
      new.snapshot_share_id,
      new.trick_id,
      'awaiting_confirmation'::public.trick_progress_status
    );
  elsif new.review_status is distinct from old.review_status then
    perform public.update_training_trick_progress(
      new.snapshot_share_id,
      new.trick_id,
      case
        when new.review_status = 'approved'
          then 'confirmed'::public.trick_progress_status
        else 'in_progress'::public.trick_progress_status
      end
    );
  end if;

  return new;
end;
$$;

-- Ein hochgeladenes Video muss existieren und der meldenden Person gehören.
drop policy "training_video_evidence_create_own_assignment"
  on public.training_video_evidence;

create policy "training_video_evidence_create_own_assignment"
  on public.training_video_evidence for insert
  to authenticated
  with check (
    athlete_id = (select auth.uid())
    and review_status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and video_removed_at is null
    and (
      provider <> 'upload'
      or exists (
        select 1
        from storage.objects object
        where object.bucket_id = 'training-evidence-videos'
          and object.name = training_video_evidence.storage_path
          and object.owner_id = (select auth.uid())::text
      )
    )
    and exists (
      select 1
      from public.training_trick_progress progress
      join public.training_plan_snapshot_shares share
        on share.id = progress.snapshot_share_id
      where progress.snapshot_share_id = training_video_evidence.snapshot_share_id
        and progress.trick_id = training_video_evidence.trick_id
        and progress.athlete_id = (select auth.uid())
        and progress.status = 'in_progress'
        and share.target_type = 'person'
        and share.recipient_user_id = (select auth.uid())
    )
  );

grant insert (
  storage_path,
  video_duration_seconds
) on public.training_video_evidence to authenticated;

-- ---------------------------------------------------------------------------
-- Privater Video-Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-evidence-videos',
  'training-evidence-videos',
  false,
  52428800,
  array['video/mp4', 'video/quicktime']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Hilfsfunktion für die Upload-Policy (security definer, damit die
-- Zählung nicht an der eigenen Select-Policy hängt).
create or replace function private.can_upload_training_video(actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.training_trick_progress progress
      where progress.athlete_id = actor
        and progress.status = 'in_progress'
    )
    and (
      select count(*)
      from storage.objects object
      where object.bucket_id = 'training-evidence-videos'
        and object.owner_id = actor::text
        and object.created_at > now() - interval '24 hours'
    ) < 10;
$$;

revoke all on function private.can_upload_training_video(uuid) from public, anon;
grant execute on function private.can_upload_training_video(uuid) to authenticated;

create policy "training_videos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'training-evidence-videos'
    and private.current_account_is_active()
    and owner_id = (select auth.uid())::text
    and name ~ (
      '^' || (select auth.uid())::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|mov)$'
    )
    and private.can_upload_training_video((select auth.uid()))
  );

create policy "training_videos_read_athlete_and_trainer"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'training-evidence-videos'
    and private.current_account_is_active()
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|mov)$'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.has_active_trainer_athlete_relationship(
        (select auth.uid()),
        ((storage.foldername(name))[1])::uuid
      )
    )
  );

-- Entfernen ist nur vor dem Melden möglich (z. B. „Entfernen“ im Sheet).
create policy "training_videos_delete_unreported_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'training-evidence-videos'
    and owner_id = (select auth.uid())::text
    and not exists (
      select 1
      from public.training_video_evidence evidence
      where evidence.storage_path = storage.objects.name
    )
  );

-- ---------------------------------------------------------------------------
-- Aufräumen nach 14 Tagen (nur Service-Rolle)
-- ---------------------------------------------------------------------------

-- Liefert Dateien, die gelöscht werden sollen: gemeldete Videos älter als
-- 14 Tage sowie nie gemeldete Uploads älter als 1 Tag.
create or replace function public.training_expired_video_objects(max_items integer default 200)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select object.name
  from storage.objects object
  where object.bucket_id = 'training-evidence-videos'
    and (
      object.created_at < now() - interval '14 days'
      or (
        object.created_at < now() - interval '1 day'
        and not exists (
          select 1
          from public.training_video_evidence evidence
          where evidence.storage_path = object.name
        )
      )
    )
  order by object.created_at
  limit least(greatest(coalesce(max_items, 200), 1), 1000);
$$;

-- Markiert Nachweise, deren Datei über die Storage-API gelöscht wurde.
create or replace function public.training_mark_videos_removed(paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  perform set_config('app.training_video_cleanup', 'on', true);
  update public.training_video_evidence
  set storage_path = null,
      video_removed_at = now()
  where storage_path = any(paths);
  get diagnostics changed = row_count;
  perform set_config('app.training_video_cleanup', 'off', true);
  return changed;
end;
$$;

revoke all on function public.training_expired_video_objects(integer) from public, anon, authenticated;
revoke all on function public.training_mark_videos_removed(text[]) from public, anon, authenticated;
grant execute on function public.training_expired_video_objects(integer) to service_role;
grant execute on function public.training_mark_videos_removed(text[]) to service_role;

-- Derselbe Cron-Schlüssel und dieselbe Basis-URL wie die Mail-Worker.
create or replace function private.training_dispatch_video_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  worker_secret text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'carpool_worker_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'carpool_cron_secret';
  if base_url is null or worker_secret is null then
    raise warning 'Training video cleanup is not configured';
    return;
  end if;
  perform net.http_get(
    url := regexp_replace(base_url, '/api/carpools/mail$', '/api/training/video-cleanup'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function private.training_dispatch_video_cleanup() from public, anon, authenticated;

select cron.schedule(
  'training-video-cleanup-daily',
  '15 3 * * *',
  'select private.training_dispatch_video_cleanup()'
);

select pg_notify('pgrst', 'reload schema');
