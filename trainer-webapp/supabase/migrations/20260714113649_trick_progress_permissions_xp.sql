-- Persistenter Trick-Fortschritt fuer geteilte Trainingsplaene.
-- Die Momentaufnahme des Plans bleibt unveraendert; nur der Status je Athlet
-- wird separat gespeichert und kann dadurch zwischen Konten synchronisiert werden.
do $$
begin
  create type public.trick_progress_status as enum (
    'not_started',
    'in_progress',
    'awaiting_confirmation',
    'confirmed'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.training_trick_progress (
  id uuid primary key default gen_random_uuid(),
  snapshot_share_id uuid not null
    references public.training_plan_snapshot_shares(id) on delete cascade,
  trick_id text not null,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status public.trick_progress_status not null default 'not_started',
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (snapshot_share_id, trick_id),
  check (char_length(btrim(trick_id)) between 1 and 160),
  check (
    (status = 'confirmed' and confirmed_by is not null and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_by is null and confirmed_at is null)
  )
);

create index if not exists training_trick_progress_athlete_idx
  on public.training_trick_progress(athlete_id, status, updated_at desc);

create index if not exists training_trick_progress_share_idx
  on public.training_trick_progress(snapshot_share_id);

create index if not exists training_trick_progress_confirmer_idx
  on public.training_trick_progress(confirmed_by)
  where confirmed_by is not null;

-- Beruecksichtigt sowohl den Kontotyp als auch Trainerrollen in Organisationen.
create or replace function private.is_trainer_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and (
        profile.account_type = 'trainer'
        or exists (
          select 1
          from public.organization_memberships membership
          where membership.user_id = profile.id
            and membership.role in ('federal_trainer', 'state_trainer', 'club_trainer')
        )
      )
  );
$$;

create or replace function private.has_active_trainer_athlete_relationship(
  p_trainer_id uuid,
  p_athlete_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_trainer_id = (select auth.uid())
    and private.is_trainer_profile(p_trainer_id)
    and exists (
      select 1
      from public.relationships relationship
      where relationship.active
        and relationship.relationship_type = 'trainer_athlete'
        and p_trainer_id in (relationship.user_one_id, relationship.user_two_id)
        and p_athlete_id in (relationship.user_one_id, relationship.user_two_id)
    );
$$;

-- Neue personenbezogene Planfreigaben erhalten automatisch Fortschrittszeilen
-- fuer die Tricks des jeweiligen Empfaengers.
create or replace function private.initialize_training_trick_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_type <> 'person' or new.recipient_user_id is null then
    return new;
  end if;

  insert into public.training_trick_progress (
    snapshot_share_id,
    trick_id,
    athlete_id,
    status,
    confirmed_by,
    confirmed_at
  )
  select
    new.id,
    trick.value->>'id',
    new.recipient_user_id,
    case
      when trick.value->>'status' in (
        'not_started', 'in_progress', 'awaiting_confirmation', 'confirmed'
      ) then (trick.value->>'status')::public.trick_progress_status
      else 'not_started'::public.trick_progress_status
    end,
    case when trick.value->>'status' = 'confirmed' then new.shared_by else null end,
    case when trick.value->>'status' = 'confirmed' then now() else null end
  from jsonb_array_elements(coalesce(new.plan_snapshot->'tricks', '[]'::jsonb)) trick(value)
  where trick.value->>'id' is not null
    and trick.value->>'athleteId' = new.recipient_user_id::text
  on conflict (snapshot_share_id, trick_id) do nothing;

  return new;
end;
$$;

drop trigger if exists training_plan_snapshot_initialize_progress
  on public.training_plan_snapshot_shares;
create trigger training_plan_snapshot_initialize_progress
  after insert on public.training_plan_snapshot_shares
  for each row execute procedure private.initialize_training_trick_progress();

-- Bereits vorhandene Freigaben werden einmalig in dieselbe Struktur ueberfuehrt.
insert into public.training_trick_progress (
  snapshot_share_id,
  trick_id,
  athlete_id,
  status,
  confirmed_by,
  confirmed_at
)
select
  share.id,
  trick.value->>'id',
  share.recipient_user_id,
  case
    when trick.value->>'status' in (
      'not_started', 'in_progress', 'awaiting_confirmation', 'confirmed'
    ) then (trick.value->>'status')::public.trick_progress_status
    else 'not_started'::public.trick_progress_status
  end,
  case when trick.value->>'status' = 'confirmed' then share.shared_by else null end,
  case when trick.value->>'status' = 'confirmed' then share.created_at else null end
from public.training_plan_snapshot_shares share
cross join lateral jsonb_array_elements(
  coalesce(share.plan_snapshot->'tricks', '[]'::jsonb)
) trick(value)
where share.target_type = 'person'
  and share.recipient_user_id is not null
  and trick.value->>'id' is not null
  and trick.value->>'athleteId' = share.recipient_user_id::text
on conflict (snapshot_share_id, trick_id) do nothing;

alter table public.training_trick_progress enable row level security;

create policy "training_trick_progress_read_related"
  on public.training_trick_progress for select
  to authenticated
  using (
    athlete_id = (select auth.uid())
    or (select private.has_active_trainer_athlete_relationship(
      (select auth.uid()),
      athlete_id
    ))
    or exists (
      select 1
      from public.training_plan_snapshot_shares share
      where share.id = snapshot_share_id
        and share.shared_by = (select auth.uid())
    )
  );

-- Einziger Schreibweg fuer Trickstatus. Die Funktion prueft Identitaet,
-- Beziehung und erlaubte Statusuebergaenge vor jedem Update explizit.
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
    and p_status = 'confirmed' then
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

-- Liefert eine datenschutzfreundliche Rangliste: eigenes Profil,
-- Trainer-Athlet-Kontakte sowie Athleten aus gemeinsamen sozialen Gruppen.
create or replace function public.get_training_xp_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  xp_total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with visible_athletes as (
    select profile.id, profile.display_name
    from public.profiles profile
    where auth.uid() is not null
      and (
        profile.account_type = 'athlete'
        or exists (
          select 1
          from public.organization_memberships membership
          where membership.user_id = profile.id
            and membership.role = 'athlete'
        )
      )
      and (
        profile.id = auth.uid()
        or exists (
          select 1
          from public.relationships relationship
          where relationship.active
            and relationship.relationship_type = 'trainer_athlete'
            and auth.uid() in (
              relationship.user_one_id,
              relationship.user_two_id
            )
            and profile.id in (
              relationship.user_one_id,
              relationship.user_two_id
            )
        )
        or exists (
          select 1
          from public.group_memberships own_membership
          join public.group_memberships athlete_membership
            on athlete_membership.group_id = own_membership.group_id
          where own_membership.user_id = auth.uid()
            and athlete_membership.user_id = profile.id
        )
      )
  )
  select
    athlete.id,
    athlete.display_name,
    (count(progress.id) filter (where progress.status = 'confirmed') * 100)::integer
  from visible_athletes athlete
  left join public.training_trick_progress progress
    on progress.athlete_id = athlete.id
  group by athlete.id, athlete.display_name
  order by 3 desc, athlete.display_name;
$$;

revoke all on public.training_trick_progress from anon;
revoke insert, update, delete on public.training_trick_progress from authenticated;
grant select on public.training_trick_progress to authenticated;

revoke execute on function private.is_trainer_profile(uuid)
  from public, anon, authenticated;
revoke execute on function private.has_active_trainer_athlete_relationship(uuid, uuid)
  from public, anon;
revoke execute on function private.initialize_training_trick_progress()
  from public, anon, authenticated;
grant execute on function private.has_active_trainer_athlete_relationship(uuid, uuid)
  to authenticated;

revoke execute on function public.update_training_trick_progress(
  uuid,
  text,
  public.trick_progress_status
) from public, anon;
grant execute on function public.update_training_trick_progress(
  uuid,
  text,
  public.trick_progress_status
) to authenticated;

revoke execute on function public.get_training_xp_leaderboard() from public, anon;
grant execute on function public.get_training_xp_leaderboard() to authenticated;

grant usage on type public.trick_progress_status to authenticated;

select pg_notify('pgrst', 'reload schema');
