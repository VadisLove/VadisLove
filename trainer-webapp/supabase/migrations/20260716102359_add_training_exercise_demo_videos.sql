-- Trainer-Demonstrationen bleiben wie Athletennachweise ausserhalb der
-- unveraenderlichen Plan-Snapshots. Gespeichert werden ausschliesslich der
-- feste Provider und die bereits validierte YouTube-ID, niemals die rohe URL.
do $$
begin
  create type public.training_demo_visibility as enum (
    'assigned',
    'public'
  );
exception
  when duplicate_object then null;
end
$$;

create table public.training_exercise_demo_videos (
  id uuid primary key default gen_random_uuid(),
  origin_snapshot_share_id uuid not null
    references public.training_plan_snapshot_shares(id) on delete cascade,
  source_plan_id text not null,
  trick_id text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  video_id text not null,
  title text not null,
  trainer_note text not null default '',
  visibility public.training_demo_visibility not null default 'assigned',
  created_at timestamptz not null default now(),
  check (char_length(btrim(source_plan_id)) between 1 and 160),
  check (char_length(btrim(trick_id)) between 1 and 160),
  check (provider = 'youtube'),
  check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  check (char_length(btrim(title)) between 1 and 160),
  check (char_length(trainer_note) <= 2000),
  unique (source_plan_id, trick_id, created_by, provider, video_id)
);

create index training_exercise_demo_videos_plan_trick_idx
  on public.training_exercise_demo_videos(source_plan_id, trick_id, created_at desc);

create index training_exercise_demo_videos_creator_idx
  on public.training_exercise_demo_videos(created_by, created_at desc);

alter table public.training_exercise_demo_videos enable row level security;

-- Allgemein freigegebene Demos sind nur fuer angemeldete Konten sichtbar.
-- Bei eingeschraenkten Demos muss eine persoenliche Planfreigabe mit derselben
-- logischen Plan-ID und derselben Uebung fuer das aktuelle Konto existieren.
create policy "training_exercise_demo_videos_read_allowed"
  on public.training_exercise_demo_videos for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      visibility = 'public'
      or created_by = (select auth.uid())
      or exists (
        select 1
        from public.training_plan_snapshot_shares share
        where share.target_type = 'person'
          and share.recipient_user_id = (select auth.uid())
          and share.plan_snapshot ->> 'id' = source_plan_id
          and exists (
            select 1
            from jsonb_array_elements(coalesce(share.plan_snapshot -> 'tricks', '[]'::jsonb)) trick
            where trick ->> 'id' = trick_id
          )
      )
    )
  );

-- Ein Demo darf nur der Trainer anlegen, der die zugrunde liegende
-- persoenliche Planfreigabe selbst erstellt hat. Die Uebungs-ID muss wirklich
-- im Snapshot vorkommen; so lassen sich keine fremden Plan-IDs unterschieben.
create policy "training_exercise_demo_videos_create_by_sharing_trainer"
  on public.training_exercise_demo_videos for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.training_plan_snapshot_shares share
      where share.id = origin_snapshot_share_id
        and share.shared_by = (select auth.uid())
        and share.target_type = 'person'
        and (select private.has_active_trainer_athlete_relationship(
          (select auth.uid()),
          share.recipient_user_id
        ))
        and share.plan_snapshot ->> 'id' = source_plan_id
        and exists (
          select 1
          from jsonb_array_elements(coalesce(share.plan_snapshot -> 'tricks', '[]'::jsonb)) trick
          where trick ->> 'id' = trick_id
        )
    )
  );

revoke all on public.training_exercise_demo_videos from anon;
revoke all on public.training_exercise_demo_videos from authenticated;
grant select, insert on public.training_exercise_demo_videos to authenticated;
grant usage on type public.training_demo_visibility to authenticated;

select pg_notify('pgrst', 'reload schema');
