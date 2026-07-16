-- Private YouTube-Nachweise bleiben dauerhaft ausserhalb des Plan-Snapshots.
-- Die Tabelle speichert keine rohe URL, sondern nur den festen Provider und
-- die validierte Video-ID. Externe Inhalte werden von Postgres nie abgerufen.
do $$
begin
  create type public.training_evidence_review_status as enum (
    'pending',
    'approved',
    'changes_requested'
  );
exception
  when duplicate_object then null;
end
$$;

create table public.training_video_evidence (
  id uuid primary key default gen_random_uuid(),
  snapshot_share_id uuid not null
    references public.training_plan_snapshot_shares(id) on delete cascade,
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
  check (self_rating between 1 and 5),
  check (char_length(trainer_feedback) <= 2000),
  check (
    (review_status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (
      review_status = 'approved'
      and reviewed_by is not null
      and reviewed_at is not null
    )
    or (
      review_status = 'changes_requested'
      and reviewed_by is not null
      and reviewed_at is not null
      and char_length(btrim(trainer_feedback)) > 0
    )
  )
);

create unique index training_video_evidence_one_pending_idx
  on public.training_video_evidence(snapshot_share_id, trick_id, athlete_id)
  where review_status = 'pending';

create index training_video_evidence_athlete_history_idx
  on public.training_video_evidence(athlete_id, submitted_at desc);

create index training_video_evidence_review_queue_idx
  on public.training_video_evidence(review_status, submitted_at asc)
  where review_status = 'pending';

create index training_video_evidence_share_trick_idx
  on public.training_video_evidence(snapshot_share_id, trick_id, submitted_at desc);

-- Der vorhandene Statusweg bleibt die einzige Stelle fuer Statuswechsel und XP.
-- Zugeordnete Trainer duerfen nun zusaetzlich eine Einreichung zur Ueberarbeitung
-- von "wartet" zurueck auf "in Arbeit" setzen.
create or replace function public.update_training_trick_progress(
  p_snapshot_share_id uuid,
  p_trick_id text,
  p_status public.trick_progress_status
)
returns table (
  athlete_user_id uuid,
  current_status public.trick_progress_status,
  xp_total integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  progress_row public.training_trick_progress%rowtype;
  actor_is_athlete boolean;
  actor_is_assigned_trainer boolean;
  athlete_has_trainer boolean;
begin
  if actor_id is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  select progress.*
  into progress_row
  from public.training_trick_progress progress
  where progress.snapshot_share_id = p_snapshot_share_id
    and progress.trick_id = p_trick_id
  for update;

  if not found then
    raise exception 'Trick-Fortschritt wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  actor_is_athlete := actor_id = progress_row.athlete_id;
  actor_is_assigned_trainer := private.has_active_trainer_athlete_relationship(
    actor_id,
    progress_row.athlete_id
  );

  select exists (
    select 1
    from public.relationships relationship
    where relationship.active
      and relationship.relationship_type = 'trainer_athlete'
      and progress_row.athlete_id in (
        relationship.user_one_id,
        relationship.user_two_id
      )
      and private.is_trainer_profile(
        case
          when relationship.user_one_id = progress_row.athlete_id
            then relationship.user_two_id
          else relationship.user_one_id
        end
      )
  ) into athlete_has_trainer;

  if p_status = progress_row.status then
    null;
  elsif actor_is_athlete and (
    (progress_row.status = 'not_started' and p_status = 'in_progress')
    or (progress_row.status = 'in_progress' and p_status = 'awaiting_confirmation')
    or (
      progress_row.status = 'awaiting_confirmation'
      and p_status = 'confirmed'
      and not athlete_has_trainer
    )
  ) then
    null;
  elsif actor_is_assigned_trainer
    and progress_row.status = 'awaiting_confirmation'
    and p_status in ('confirmed', 'in_progress') then
    null;
  else
    raise exception 'Dieser Statuswechsel ist fuer das Konto nicht erlaubt.'
      using errcode = '42501';
  end if;

  update public.training_trick_progress progress
  set
    status = p_status,
    confirmed_by = case when p_status = 'confirmed' then actor_id else null end,
    confirmed_at = case when p_status = 'confirmed' then now() else null end,
    updated_at = now()
  where progress.id = progress_row.id;

  return query
  select
    progress_row.athlete_id,
    p_status,
    (count(*) filter (where progress.status = 'confirmed') * 100)::integer
  from public.training_trick_progress progress
  where progress.athlete_id = progress_row.athlete_id;
end;
$$;

-- Unveraenderliche Einreichungsdaten koennen auch bei einem direkten Data-API-
-- Aufruf nicht nachtraeglich einem anderen Athleten oder Video zugeordnet werden.
create or replace function private.validate_training_video_evidence_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  if new.snapshot_share_id is distinct from old.snapshot_share_id
    or new.trick_id is distinct from old.trick_id
    or new.athlete_id is distinct from old.athlete_id
    or new.provider is distinct from old.provider
    or new.video_id is distinct from old.video_id
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

create trigger training_video_evidence_validate_review
  before update on public.training_video_evidence
  for each row execute procedure private.validate_training_video_evidence_review();

-- Status und Nachweis werden in derselben Datenbanktransaktion geschrieben.
-- Scheitert der Statuswechsel, wird auch die Einreichung bzw. Pruefung verworfen.
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

create trigger training_video_evidence_sync_progress
  after insert or update on public.training_video_evidence
  for each row execute procedure private.sync_training_video_evidence_progress();

alter table public.training_video_evidence enable row level security;

create policy "training_video_evidence_read_related"
  on public.training_video_evidence for select
  to authenticated
  using (
    athlete_id = (select auth.uid())
    or (select private.has_active_trainer_athlete_relationship(
      (select auth.uid()),
      athlete_id
    ))
  );

create policy "training_video_evidence_create_own_assignment"
  on public.training_video_evidence for insert
  to authenticated
  with check (
    athlete_id = (select auth.uid())
    and review_status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
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

create policy "training_video_evidence_review_assigned_trainer"
  on public.training_video_evidence for update
  to authenticated
  using (
    review_status = 'pending'
    and (select private.has_active_trainer_athlete_relationship(
      (select auth.uid()),
      athlete_id
    ))
  )
  with check (
    review_status in ('approved', 'changes_requested')
    and reviewed_by = (select auth.uid())
    and reviewed_at is not null
    and (select private.has_active_trainer_athlete_relationship(
      (select auth.uid()),
      athlete_id
    ))
  );

revoke all on public.training_video_evidence from anon;
revoke all on public.training_video_evidence from authenticated;
grant select, insert on public.training_video_evidence to authenticated;
grant update (
  review_status,
  trainer_feedback,
  reviewed_by,
  reviewed_at
) on public.training_video_evidence to authenticated;
grant usage on type public.training_evidence_review_status to authenticated;

revoke execute on function private.validate_training_video_evidence_review()
  from public, anon, authenticated;
revoke execute on function private.sync_training_video_evidence_progress()
  from public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');
