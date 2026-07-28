-- Vollstaendiger Profilbereich mit sicheren Bildern, Mehrfachmitgliedschaften,
-- genau einem aktiven Startverband und 30-taegiger Kontowiederherstellung.

create type public.profile_visibility as enum (
  'all_members',
  'contacts',
  'private'
);

create type public.account_deletion_status as enum (
  'scheduled',
  'restored',
  'finalized'
);

alter table public.profiles
  add column first_name text not null default '',
  add column last_name text not null default '',
  add column phone text,
  add column location text,
  add column bio text,
  add column disciplines text[] not null default '{}',
  add column visibility public.profile_visibility not null default 'all_members',
  add column avatar_path text;

-- Bestehende Anzeigenamen bleiben ohne verlustbehaftete Namensheuristik erhalten.
update public.profiles
set first_name = display_name
where first_name = '';

-- Neue Registrierungen muessen das neue Pflichtfeld direkt befuellen. Die
-- bestehende Organisationsauswahl und Beitrittsanfrage bleiben unveraendert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_account_type public.account_type;
  selected_organization_id uuid;
  selected_organization_level public.organization_level;
  selected_role public.member_role;
  organization_value text;
  selected_display_name text;
begin
  selected_account_type := case new.raw_user_meta_data ->> 'account_type'
    when 'athlete' then 'athlete'::public.account_type
    when 'trainer' then 'trainer'::public.account_type
    when 'medical' then 'medical'::public.account_type
    when 'guardian' then 'guardian'::public.account_type
    when 'organization_staff' then 'organization_staff'::public.account_type
    else 'unspecified'::public.account_type
  end;
  selected_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  insert into public.profiles (
    id,
    display_name,
    first_name,
    email,
    account_type
  )
  values (
    new.id,
    selected_display_name,
    selected_display_name,
    coalesce(new.email, ''),
    selected_account_type
  );

  organization_value := new.raw_user_meta_data ->> 'registration_organization_id';
  if organization_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    selected_organization_id := organization_value::uuid;
  end if;

  if selected_organization_id is not null then
    select organization.level
    into selected_organization_level
    from public.organizations organization
    where organization.id = selected_organization_id;

    selected_role := case
      when selected_account_type = 'athlete' and selected_organization_level = 'club'
        then 'athlete'::public.member_role
      when selected_account_type = 'trainer' and selected_organization_level = 'club'
        then 'club_trainer'::public.member_role
      when selected_account_type = 'medical' and selected_organization_level = 'club'
        then 'medical'::public.member_role
      when selected_account_type = 'guardian' and selected_organization_level = 'club'
        then 'guardian'::public.member_role
      when selected_account_type = 'organization_staff' and selected_organization_level = 'state'
        then 'specialist'::public.member_role
      else null
    end;

    if selected_role is not null then
      insert into public.membership_requests (
        organization_id,
        user_id,
        requested_role,
        note
      )
      values (
        selected_organization_id,
        new.id,
        selected_role,
        'Bei der Registrierung ausgewählt.'
      )
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

alter table public.profiles
  add constraint profiles_first_name_length
    check (char_length(btrim(first_name)) between 1 and 80),
  add constraint profiles_last_name_length
    check (char_length(btrim(last_name)) <= 80),
  add constraint profiles_phone_length
    check (phone is null or char_length(phone) <= 40),
  add constraint profiles_location_length
    check (location is null or char_length(location) <= 120),
  add constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 1000),
  add constraint profiles_disciplines_count
    check (cardinality(disciplines) <= 20),
  add constraint profiles_disciplines_total_length
    check (char_length(array_to_string(disciplines, '')) <= 1200),
  add constraint profiles_avatar_path_format
    check (
      avatar_path is null
      or avatar_path ~ (
        '^' || id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
      )
    );

-- Ein anonymisiertes Profil bleibt als Referenz fuer historische Fachdatensaetze
-- erhalten, waehrend der Auth-Nutzer nach Ablauf endgueltig geloescht wird.
alter table public.profiles drop constraint profiles_id_fkey;

create table public.athlete_federation_affiliations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete restrict,
  federation_id uuid not null references public.organizations(id) on delete restrict,
  active boolean not null default true,
  selected_at timestamptz not null default now(),
  ended_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  check (
    (active and ended_at is null and invalidated_at is null)
    or
    (not active and ended_at is not null)
  )
);

create unique index athlete_federation_one_active_idx
  on public.athlete_federation_affiliations(athlete_id)
  where active;
create index athlete_federation_federation_idx
  on public.athlete_federation_affiliations(federation_id, active);
create index athlete_federation_athlete_history_idx
  on public.athlete_federation_affiliations(athlete_id, selected_at desc);

create table public.profile_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  subject_user_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    event_type in (
      'club_joined',
      'club_left',
      'federation_changed',
      'federation_invalidated',
      'account_deletion_scheduled',
      'account_restored',
      'account_finalized'
    )
  )
);

create index profile_audit_subject_idx
  on public.profile_audit_events(subject_user_id, created_at desc);
create index profile_audit_organization_idx
  on public.profile_audit_events(organization_id, created_at desc);
create index profile_audit_actor_idx
  on public.profile_audit_events(actor_user_id);

create table public.account_deletion_requests (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  status public.account_deletion_status not null default 'scheduled',
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '30 days'),
  restored_at timestamptz,
  finalized_at timestamptz,
  external_cleanup_completed_at timestamptz,
  avatar_path_snapshot text,
  updated_at timestamptz not null default now(),
  check (scheduled_for = requested_at + interval '30 days'),
  check (
    (status = 'scheduled' and restored_at is null and finalized_at is null)
    or (status = 'restored' and restored_at is not null and finalized_at is null)
    or (status = 'finalized' and finalized_at is not null)
  )
);

create index account_deletion_due_idx
  on public.account_deletion_requests(scheduled_for)
  where status = 'scheduled';
create index account_deletion_cleanup_idx
  on public.account_deletion_requests(finalized_at)
  where status = 'finalized' and external_cleanup_completed_at is null;

-- Neue Tabellen werden explizit fuer die Data API freigegeben. RLS bleibt die
-- eigentliche Zeilenautorisierung und Schreibzugriffe laufen nur ueber RPCs.
grant select on public.athlete_federation_affiliations to authenticated;
grant select on public.profile_audit_events to authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.athlete_federation_affiliations to service_role;
grant all on public.profile_audit_events to service_role;
grant all on public.account_deletion_requests to service_role;

alter table public.athlete_federation_affiliations enable row level security;
alter table public.profile_audit_events enable row level security;
alter table public.account_deletion_requests enable row level security;

-- Ein geplanter oder finalisierter Account ist sofort fachlich inaktiv.
create or replace function private.account_is_active(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and not exists (
      select 1
      from public.account_deletion_requests deletion
      where deletion.user_id = target_user_id
        and deletion.status in ('scheduled', 'finalized')
    );
$$;

create or replace function private.current_account_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.account_is_active((select auth.uid()));
$$;

-- Profilsichtbarkeit gilt fuer das Mitgliederverzeichnis. Zustaendige
-- Organisationsverantwortliche behalten den betrieblich notwendigen Zugriff.
create or replace function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and private.account_is_active(target_user_id)
    and exists (
      select 1
      from public.profiles target_profile
      where target_profile.id = target_user_id
        and (
          target_profile.visibility = 'all_members'
          or (
            target_profile.visibility = 'contacts'
            and private.are_connected((select auth.uid()), target_user_id)
          )
          or exists (
            select 1
            from public.organization_memberships target_membership
            where target_membership.user_id = target_user_id
              and private.can_manage_organization(
                target_membership.organization_id
              )
          )
        )
    );
$$;

revoke execute on function private.account_is_active(uuid)
  from public, anon, authenticated;
revoke execute on function private.current_account_is_active()
  from public, anon, authenticated;
revoke execute on function private.can_view_profile(uuid)
  from public, anon, authenticated;
grant execute on function private.account_is_active(uuid) to service_role;
grant execute on function private.current_account_is_active() to service_role;
grant execute on function private.can_view_profile(uuid) to service_role;

-- Bestehende, absichtlich exponierte SECURITY-DEFINER-RPCs umgehen RLS.
-- Sie erhalten deshalb denselben Aktivitaetscheck wie die neuen Workflows.
create or replace function public.create_state_organization_with_specialist(
  parent_organization_id uuid,
  organization_name text,
  organization_state_code text,
  specialist_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  specialist_id uuid;
  created_organization_id uuid;
  normalized_name text := btrim(organization_name);
  normalized_state_code text := upper(btrim(organization_state_code));
  normalized_email text := lower(btrim(specialist_email));
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.can_create_organization(parent_organization_id, 'state') then
    raise exception 'Not allowed to create this state organization.';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 120 then
    raise exception 'Invalid organization name.';
  end if;
  if char_length(normalized_state_code) <> 2 then
    raise exception 'Invalid state code.';
  end if;
  if exists (
    select 1
    from public.organizations organization
    where organization.parent_id = parent_organization_id
      and organization.level = 'state'
      and organization.state_code = normalized_state_code
  ) then
    raise exception 'State organization already exists.';
  end if;

  select profile.id
  into specialist_id
  from public.profiles profile
  where lower(profile.email) = normalized_email
    and profile.account_type = 'organization_staff'
  limit 1;
  if specialist_id is null then
    raise exception 'Specialist profile was not found.';
  end if;

  insert into public.organizations (
    parent_id,
    name,
    level,
    state_code,
    created_by
  )
  values (
    parent_organization_id,
    normalized_name,
    'state',
    normalized_state_code,
    actor_id
  )
  returning id into created_organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    assigned_by
  )
  values (
    created_organization_id,
    specialist_id,
    'specialist',
    actor_id
  );
  return created_organization_id;
end;
$$;

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
    where private.current_account_is_active()
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
        profile.id = (select auth.uid())
        or exists (
          select 1
          from public.relationships relationship
          where relationship.active
            and relationship.relationship_type = 'trainer_athlete'
            and (select auth.uid()) in (
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
          where own_membership.user_id = (select auth.uid())
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
  actor_id uuid := (select auth.uid());
  progress_row public.training_trick_progress%rowtype;
  actor_is_athlete boolean;
  actor_is_assigned_trainer boolean;
  athlete_has_trainer boolean;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  select progress.*
  into progress_row
  from public.training_trick_progress progress
  where progress.snapshot_share_id = p_snapshot_share_id
    and progress.trick_id = p_trick_id
  for update;
  if not found then
    raise exception 'Trick-Fortschritt wurde nicht gefunden.'
      using errcode = 'P0002';
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

drop policy if exists "profiles_read_authenticated" on public.profiles;
create policy "profiles_read_by_visibility"
  on public.profiles
  for select
  to authenticated
  using (
    (
      id = (select auth.uid())
      and private.current_account_is_active()
    )
    or private.can_view_profile(id)
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_active_self"
  on public.profiles
  for update
  to authenticated
  using (
    id = (select auth.uid())
    and private.current_account_is_active()
  )
  with check (
    id = (select auth.uid())
    and private.current_account_is_active()
  );

create policy "athlete_federations_read_related"
  on public.athlete_federation_affiliations
  for select
  to authenticated
  using (
    athlete_id = (select auth.uid())
    or private.can_manage_organization(federation_id)
  );

create policy "profile_audit_read_related"
  on public.profile_audit_events
  for select
  to authenticated
  using (
    subject_user_id = (select auth.uid())
    or (
      organization_id is not null
      and private.can_manage_organization(organization_id)
    )
  );

create policy "account_deletion_read_self"
  on public.account_deletion_requests
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- E-Mail und Kontotyp waren bislang durch eine breite UPDATE-Policy technisch
-- veraenderbar. Der Trigger schuetzt diese Autorisierungs- und Auth-Felder.
create or replace function private.protect_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if new.id is distinct from old.id
      or new.email is distinct from old.email
      or new.account_type is distinct from old.account_type then
      raise exception 'Protected profile fields cannot be changed here.'
        using errcode = '42501';
    end if;

    if new.display_name is distinct from old.display_name
      and new.first_name is not distinct from old.first_name
      and new.last_name is not distinct from old.last_name then
      raise exception 'Update first_name and last_name instead of display_name.'
        using errcode = '42501';
    end if;
  end if;

  new.first_name := btrim(new.first_name);
  new.last_name := btrim(new.last_name);
  new.phone := nullif(btrim(new.phone), '');
  new.location := nullif(btrim(new.location), '');
  new.bio := nullif(btrim(new.bio), '');
  new.disciplines := coalesce((
    select array_agg(distinct btrim(value) order by btrim(value))
    from unnest(new.disciplines) value
    where btrim(value) <> ''
  ), '{}'::text[]);

  if exists (
    select 1
    from unnest(new.disciplines) discipline
    where char_length(discipline) > 60
  ) then
    raise exception 'A discipline must not exceed 60 characters.'
      using errcode = '22023';
  end if;

  if new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name then
    new.display_name := btrim(concat_ws(' ', new.first_name, new.last_name));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_protect_update
  before update on public.profiles
  for each row execute procedure private.protect_profile_update();
revoke execute on function private.protect_profile_update()
  from public, anon, authenticated;

-- Direkte Mitgliedschaftsloeschungen wuerden Benachrichtigungen, Audit und
-- Nachfolgepruefung umgehen. Nur die gekennzeichneten Transaktionen duerfen
-- deshalb Datensaetze entfernen.
create or replace function private.guard_membership_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and coalesce(
      current_setting('trainer_hub.membership_delete_workflow', true),
      ''
    ) not in ('leave_club', 'account_finalization') then
    raise exception 'Memberships must be removed through a secured workflow.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger memberships_guard_delete
  before delete on public.organization_memberships
  for each row execute procedure private.guard_membership_delete();
revoke execute on function private.guard_membership_delete()
  from public, anon, authenticated;

-- Jede neue bestaetigte Vereinsmitgliedschaft wird fuer Nutzer, Verein und
-- Landesverband nachvollziehbar kommuniziert und protokolliert.
create or replace function private.notify_club_membership_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  club_name text;
  state_id uuid;
  member_name text;
begin
  select club.name, club.parent_id
  into club_name, state_id
  from public.organizations club
  where club.id = new.organization_id
    and club.level = 'club';

  if not found then
    return new;
  end if;

  select profile.display_name
  into member_name
  from public.profiles profile
  where profile.id = new.user_id;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    organization_id,
    new_values
  )
  values (
    'club_joined',
    new.assigned_by,
    new.user_id,
    new.organization_id,
    jsonb_build_object('role', new.role, 'joined_at', new.created_at)
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    new.user_id,
    'club_joined'::public.notification_type,
    'Vereinsbeitritt bestaetigt',
    member_name || ' ist ' || club_name || ' beigetreten.',
    '/profil'
  from (
    select new.user_id as user_id
    union
    select membership.user_id
    from public.organization_memberships membership
    where (
      membership.organization_id = new.organization_id
      and membership.role = 'club_board'
    ) or (
      membership.organization_id = state_id
      and membership.role = 'specialist'
    )
  ) recipient
  where recipient.user_id is not null;

  return new;
end;
$$;

create trigger memberships_notify_club_joined
  after insert on public.organization_memberships
  for each row execute procedure private.notify_club_membership_joined();
revoke execute on function private.notify_club_membership_joined()
  from public, anon, authenticated;

-- Die Zugehoerigkeit darf nur fuer Athleten und nur ueber einen tatsaechlich
-- vorhandenen Verein unterhalb des Landesverbandes aktiv werden.
create or replace function private.validate_athlete_federation_affiliation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active then
    if not exists (
      select 1
      from public.profiles profile
      where profile.id = new.athlete_id
        and profile.account_type = 'athlete'
    ) then
      raise exception 'Only athlete accounts can select a federation.'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.organization_memberships membership
      join public.organizations club
        on club.id = membership.organization_id
      where membership.user_id = new.athlete_id
        and club.level = 'club'
        and club.parent_id = new.federation_id
    ) then
      raise exception 'The athlete is not eligible for this federation.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger athlete_federation_validate
  before insert or update of athlete_id, federation_id, active
  on public.athlete_federation_affiliations
  for each row execute procedure private.validate_athlete_federation_affiliation();
revoke execute on function private.validate_athlete_federation_affiliation()
  from public, anon, authenticated;

-- Entfernt jemand seine letzte Vereinszuordnung im Startverband, wird die
-- Auswahl bewusst ungueltig. Es wird niemals automatisch ein Ersatz gewaehlt.
create or replace function private.invalidate_federation_after_membership_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_id uuid;
  invalidated_affiliation_id uuid;
  athlete_name text;
  state_name text;
begin
  select club.parent_id
  into state_id
  from public.organizations club
  where club.id = old.organization_id
    and club.level = 'club';

  if state_id is null or exists (
    select 1
    from public.organization_memberships remaining_membership
    join public.organizations remaining_club
      on remaining_club.id = remaining_membership.organization_id
    where remaining_membership.user_id = old.user_id
      and remaining_club.level = 'club'
      and remaining_club.parent_id = state_id
  ) then
    return old;
  end if;

  update public.athlete_federation_affiliations affiliation
  set
    active = false,
    ended_at = now(),
    invalidated_at = now(),
    invalidation_reason = 'last_eligible_club_left'
  where affiliation.athlete_id = old.user_id
    and affiliation.federation_id = state_id
    and affiliation.active
  returning affiliation.id into invalidated_affiliation_id;

  if invalidated_affiliation_id is null then
    return old;
  end if;

  select profile.display_name, federation.name
  into athlete_name, state_name
  from public.profiles profile
  cross join public.organizations federation
  where profile.id = old.user_id
    and federation.id = state_id;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    organization_id,
    old_values,
    new_values
  )
  values (
    'federation_invalidated',
    (select auth.uid()),
    old.user_id,
    state_id,
    jsonb_build_object(
      'affiliation_id', invalidated_affiliation_id,
      'federation_id', state_id,
      'active', true
    ),
    jsonb_build_object(
      'active', false,
      'reason', 'last_eligible_club_left',
      'invalidated_at', now()
    )
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    (select auth.uid()),
    'federation_invalidated'::public.notification_type,
    'Startverband nicht mehr gueltig',
    athlete_name || ' hat keine aktive Vereinsmitgliedschaft mehr in ' ||
      state_name || '.',
    '/profil#startverband'
  from (
    select old.user_id as user_id
    union
    select membership.user_id
    from public.organization_memberships membership
    where (
      membership.organization_id = state_id
      and membership.role = 'specialist'
    ) or (
      membership.organization_id = old.organization_id
      and membership.role = 'club_board'
    )
  ) recipient
  where recipient.user_id is not null;

  return old;
end;
$$;

create trigger memberships_invalidate_federation
  after delete on public.organization_memberships
  for each row execute procedure private.invalidate_federation_after_membership_delete();
revoke execute on function private.invalidate_federation_after_membership_delete()
  from public, anon, authenticated;

create or replace function public.leave_club_membership(
  p_club_id uuid,
  p_confirmed boolean
)
returns table (
  federation_became_invalid boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  state_id uuid;
  club_name text;
  actor_name text;
  removed_roles public.member_role[];
  had_active_federation boolean;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not p_confirmed then
    raise exception 'Explicit confirmation is required.' using errcode = '22023';
  end if;

  select club.parent_id, club.name
  into state_id, club_name
  from public.organizations club
  where club.id = p_club_id
    and club.level = 'club'
  for update;

  if not found then
    raise exception 'Club not found.' using errcode = '22023';
  end if;

  select array_agg(membership.role order by membership.role)
  into removed_roles
  from public.organization_memberships membership
  where membership.organization_id = p_club_id
    and membership.user_id = actor_id;

  if coalesce(cardinality(removed_roles), 0) = 0 then
    raise exception 'No active club membership found.' using errcode = '22023';
  end if;

  if 'club_board' = any(removed_roles)
    and not exists (
      select 1
      from public.organization_memberships successor
      where successor.organization_id = p_club_id
        and successor.role = 'club_board'
        and successor.user_id <> actor_id
    ) then
    raise exception 'A successor must be assigned before the last club administrator can leave.'
      using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.athlete_federation_affiliations affiliation
    where affiliation.athlete_id = actor_id
      and affiliation.federation_id = state_id
      and affiliation.active
  ) into had_active_federation;

  perform set_config(
    'trainer_hub.membership_delete_workflow',
    'leave_club',
    true
  );

  delete from public.organization_memberships membership
  where membership.organization_id = p_club_id
    and membership.user_id = actor_id;

  select profile.display_name
  into actor_name
  from public.profiles profile
  where profile.id = actor_id;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    organization_id,
    old_values,
    new_values
  )
  values (
    'club_left',
    actor_id,
    actor_id,
    p_club_id,
    jsonb_build_object('roles', to_jsonb(removed_roles)),
    jsonb_build_object('left_at', now())
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    actor_id,
    'club_left'::public.notification_type,
    'Vereinsaustritt',
    actor_name || ' hat ' || club_name || ' verlassen.',
    '/profil'
  from (
    select actor_id as user_id
    union
    select membership.user_id
    from public.organization_memberships membership
    where (
      membership.organization_id = p_club_id
      and membership.role = 'club_board'
    ) or (
      membership.organization_id = state_id
      and membership.role = 'specialist'
    )
  ) recipient
  where recipient.user_id is not null;

  return query
  select had_active_federation and not exists (
    select 1
    from public.athlete_federation_affiliations affiliation
    where affiliation.athlete_id = actor_id
      and affiliation.active
  );
end;
$$;

revoke execute on function public.leave_club_membership(uuid, boolean)
  from public, anon;
grant execute on function public.leave_club_membership(uuid, boolean)
  to authenticated;

create or replace function public.set_active_athlete_federation(
  p_federation_id uuid,
  p_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  old_affiliation public.athlete_federation_affiliations%rowtype;
  new_affiliation_id uuid;
  athlete_name text;
  old_federation_name text;
  new_federation_name text;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not p_confirmed then
    raise exception 'Explicit confirmation is required.' using errcode = '22023';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = actor_id
    and profile.account_type = 'athlete'
  for update;

  if not found then
    raise exception 'Only athlete accounts can select a federation.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organizations federation
    where federation.id = p_federation_id
      and federation.level = 'state'
  ) then
    raise exception 'Federation not found.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    join public.organizations club
      on club.id = membership.organization_id
    where membership.user_id = actor_id
      and club.level = 'club'
      and club.parent_id = p_federation_id
  ) then
    raise exception 'The athlete is not eligible for this federation.'
      using errcode = '23514';
  end if;

  select affiliation.*
  into old_affiliation
  from public.athlete_federation_affiliations affiliation
  where affiliation.athlete_id = actor_id
    and affiliation.active
  for update;

  if found and old_affiliation.federation_id = p_federation_id then
    return old_affiliation.id;
  end if;

  if old_affiliation.id is not null then
    update public.athlete_federation_affiliations
    set active = false, ended_at = now()
    where id = old_affiliation.id;
  end if;

  insert into public.athlete_federation_affiliations (
    athlete_id,
    federation_id
  )
  values (actor_id, p_federation_id)
  returning id into new_affiliation_id;

  select
    profile.display_name,
    old_federation.name,
    new_federation.name
  into athlete_name, old_federation_name, new_federation_name
  from public.profiles profile
  join public.organizations new_federation
    on new_federation.id = p_federation_id
  left join public.organizations old_federation
    on old_federation.id = old_affiliation.federation_id
  where profile.id = actor_id;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    organization_id,
    old_values,
    new_values
  )
  values (
    'federation_changed',
    actor_id,
    actor_id,
    p_federation_id,
    jsonb_build_object(
      'affiliation_id', old_affiliation.id,
      'federation_id', old_affiliation.federation_id
    ),
    jsonb_build_object(
      'affiliation_id', new_affiliation_id,
      'federation_id', p_federation_id,
      'selected_at', now()
    )
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    actor_id,
    'federation_changed'::public.notification_type,
    'Startverband geaendert',
    athlete_name || ' faehrt jetzt offiziell fuer ' ||
      new_federation_name ||
      case
        when old_federation_name is null then '.'
        else ' (vorher: ' || old_federation_name || ').'
      end,
    '/profil#startverband'
  from (
    select actor_id as user_id
    union
    select membership.user_id
    from public.organization_memberships membership
    join public.organizations organization
      on organization.id = membership.organization_id
    where (
      organization.id in (
        p_federation_id,
        old_affiliation.federation_id
      )
      and membership.role = 'specialist'
    ) or (
      organization.level = 'club'
      and organization.parent_id in (
        p_federation_id,
        old_affiliation.federation_id
      )
      and membership.role = 'club_board'
    )
  ) recipient
  where recipient.user_id is not null;

  return new_affiliation_id;
end;
$$;

revoke execute on function public.set_active_athlete_federation(uuid, boolean)
  from public, anon;
grant execute on function public.set_active_athlete_federation(uuid, boolean)
  to authenticated;

create or replace function public.schedule_account_deletion(
  p_confirmation text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  deletion_date timestamptz := now() + interval '30 days';
  actor_name text;
  avatar_snapshot text;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_confirmation <> 'LÖSCHEN' then
    raise exception 'The deletion confirmation is invalid.' using errcode = '22023';
  end if;

  -- Bundesvorsitz, Fachwart und Vereinsvorstand sind je Ebene die Rollen,
  -- deren letzter Inhaber nicht ohne geregelte Nachfolge verschwinden darf.
  if exists (
    select 1
    from public.organization_memberships own_membership
    join public.organizations organization
      on organization.id = own_membership.organization_id
    where own_membership.user_id = actor_id
      and (
        (organization.level = 'federal' and own_membership.role = 'federal_chair')
        or (organization.level = 'state' and own_membership.role = 'specialist')
        or (organization.level = 'club' and own_membership.role = 'club_board')
      )
      and not exists (
        select 1
        from public.organization_memberships successor
        where successor.organization_id = own_membership.organization_id
          and successor.role = own_membership.role
          and successor.user_id <> actor_id
      )
  ) then
    raise exception 'A successor must be assigned before the last organization administrator can delete the account.'
      using errcode = '23514';
  end if;

  select profile.display_name, profile.avatar_path
  into actor_name, avatar_snapshot
  from public.profiles profile
  where profile.id = actor_id
  for update;

  insert into public.account_deletion_requests (
    user_id,
    status,
    requested_at,
    scheduled_for,
    restored_at,
    finalized_at,
    external_cleanup_completed_at,
    avatar_path_snapshot,
    updated_at
  )
  values (
    actor_id,
    'scheduled',
    now(),
    deletion_date,
    null,
    null,
    null,
    avatar_snapshot,
    now()
  )
  on conflict (user_id) do update
  set
    status = 'scheduled',
    requested_at = excluded.requested_at,
    scheduled_for = excluded.scheduled_for,
    restored_at = null,
    finalized_at = null,
    external_cleanup_completed_at = null,
    avatar_path_snapshot = excluded.avatar_path_snapshot,
    updated_at = now();

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    new_values
  )
  values (
    'account_deletion_scheduled',
    actor_id,
    actor_id,
    jsonb_build_object('scheduled_for', deletion_date)
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    actor_id,
    'account_deletion_scheduled'::public.notification_type,
    'Profil-Loeschung geplant',
    case
      when recipient.user_id = actor_id then
        'Dein Profil wird am ' || to_char(deletion_date, 'DD.MM.YYYY') ||
        ' endgueltig anonymisiert.'
      else
        actor_name || ' hat die Profil-Loeschung zum ' ||
        to_char(deletion_date, 'DD.MM.YYYY') || ' geplant.'
    end,
    case
      when recipient.user_id = actor_id then '/konto-wiederherstellen'
      else '/organisation'
    end
  from (
    select actor_id as user_id
    union
    select manager.user_id
    from public.organization_memberships subject_membership
    join public.organization_memberships manager
      on manager.organization_id = subject_membership.organization_id
    join public.organizations organization
      on organization.id = manager.organization_id
    where subject_membership.user_id = actor_id
      and manager.user_id <> actor_id
      and (
        (organization.level = 'federal' and manager.role = 'federal_chair')
        or (organization.level = 'state' and manager.role = 'specialist')
        or (organization.level = 'club' and manager.role = 'club_board')
      )
  ) recipient;

  return deletion_date;
end;
$$;

revoke execute on function public.schedule_account_deletion(text)
  from public, anon;
grant execute on function public.schedule_account_deletion(text)
  to authenticated;

create or replace function public.restore_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.account_deletion_requests deletion
  set
    status = 'restored',
    restored_at = now(),
    updated_at = now()
  where deletion.user_id = actor_id
    and deletion.status = 'scheduled'
    and deletion.scheduled_for > now();

  if not found then
    raise exception 'The recovery period has expired or no deletion is scheduled.'
      using errcode = '22023';
  end if;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    new_values
  )
  values (
    'account_restored',
    actor_id,
    actor_id,
    jsonb_build_object('restored_at', now())
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  values (
    actor_id,
    actor_id,
    'account_restored'::public.notification_type,
    'Profil wiederhergestellt',
    'Dein Profil und deine Berechtigungen sind wieder aktiv.',
    '/profil'
  );

  return true;
end;
$$;

revoke execute on function public.restore_account() from public, anon;
grant execute on function public.restore_account() to authenticated;

-- Der Edge-Worker ruft diese Funktion erst nach Ablauf auf. Die Datenbank
-- anonymisiert transaktional; Storage- und Auth-Loeschung folgen serverseitig.
create or replace function public.finalize_due_account_deletion(
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  deletion public.account_deletion_requests%rowtype;
  former_name text;
  anonymized_email text;
begin
  select request.*
  into deletion
  from public.account_deletion_requests request
  where request.user_id = p_user_id
  for update;

  if not found
    or deletion.status <> 'scheduled'
    or deletion.scheduled_for > now() then
    raise exception 'Account deletion is not due.' using errcode = '22023';
  end if;

  select profile.display_name
  into former_name
  from public.profiles profile
  where profile.id = p_user_id
  for update;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    manager.user_id,
    null,
    'account_finalized'::public.notification_type,
    'Profil anonymisiert',
    'Ein zuvor angekuendigtes Profil wurde nach Ablauf der Wiederherstellungsfrist anonymisiert.',
    '/organisation'
  from public.organization_memberships subject_membership
  join public.organization_memberships manager
    on manager.organization_id = subject_membership.organization_id
  join public.organizations organization
    on organization.id = manager.organization_id
  where subject_membership.user_id = p_user_id
    and manager.user_id <> p_user_id
    and (
      (organization.level = 'federal' and manager.role = 'federal_chair')
      or (organization.level = 'state' and manager.role = 'specialist')
      or (organization.level = 'club' and manager.role = 'club_board')
    );

  insert into public.profile_audit_events (
    event_type,
    subject_user_id,
    old_values,
    new_values
  )
  values (
    'account_finalized',
    p_user_id,
    '{}'::jsonb,
    jsonb_build_object('finalized_at', now(), 'anonymized', true)
  );

  perform set_config(
    'trainer_hub.membership_delete_workflow',
    'account_finalization',
    true
  );

  delete from public.organization_memberships where user_id = p_user_id;
  delete from public.membership_requests where user_id = p_user_id;
  delete from public.relationship_requests
    where sender_user_id = p_user_id or recipient_user_id = p_user_id;
  delete from public.relationships
    where user_one_id = p_user_id or user_two_id = p_user_id;
  delete from public.group_memberships where user_id = p_user_id;
  delete from public.group_invitations
    where invited_user_id = p_user_id or invited_by = p_user_id;
  delete from public.notification_preferences where user_id = p_user_id;
  delete from public.notifications
    where user_id = p_user_id or actor_user_id = p_user_id;

  -- Veranstaltungszuordnungen bleiben fuer Auswertungen bestehen, enthalten
  -- nach der Anonymisierung aber keine zusaetzliche Einladungsadresse mehr.
  update public.event_participants
  set invited_email = null
  where user_id = p_user_id;

  anonymized_email :=
    'deleted-' ||
    left(encode(digest(p_user_id::text, 'sha256'), 'hex'), 20) ||
    '@invalid.local';

  update public.profiles
  set
    display_name = 'Geloeschtes Konto',
    first_name = 'Geloeschtes Konto',
    last_name = '',
    email = anonymized_email,
    account_type = 'unspecified',
    phone = null,
    location = null,
    bio = null,
    disciplines = '{}',
    visibility = 'private',
    avatar_path = null,
    updated_at = now()
  where id = p_user_id;

  update public.account_deletion_requests
  set
    status = 'finalized',
    finalized_at = now(),
    updated_at = now()
  where user_id = p_user_id;

  return deletion.avatar_path_snapshot;
end;
$$;

revoke execute on function public.finalize_due_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_due_account_deletion(uuid)
  to service_role;

-- Deaktivierte Konten duerfen mit noch nicht abgelaufenen Access Tokens keine
-- bestehenden Data-API-Policies weiterverwenden. Eine restriktive Policy wird
-- deshalb auf alle bisherigen oeffentlichen RLS-Tabellen gelegt.
do $$
declare
  target_table record;
begin
  for target_table in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity
      and tablename not in ('profiles', 'account_deletion_requests')
  loop
    execute format(
      'create policy %I on %I.%I as restrictive for all to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active())',
      'active_account_required',
      target_table.schemaname,
      target_table.tablename
    );
  end loop;
end
$$;

-- Das Personenverzeichnis respektiert jetzt Deaktivierung und Sichtbarkeit,
-- ohne verbundene E-Mail-Adressen fuer Fremde offenzulegen.
create or replace function public.get_people_directory()
returns table (
  id uuid,
  display_name text,
  email text,
  account_type public.account_type,
  roles public.member_role[],
  states text[],
  clubs text[],
  active_relationships public.relationship_type[],
  pending_sent public.relationship_type[],
  pending_received public.relationship_type[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.display_name,
    case
      when private.are_connected((select auth.uid()), profile.id)
      then profile.email
      else ''
    end,
    profile.account_type,
    coalesce((
      select array_agg(distinct membership.role order by membership.role)
      from public.organization_memberships membership
      where membership.user_id = profile.id
    ), '{}'::public.member_role[]),
    coalesce((
      select array_agg(distinct state_organization.name order by state_organization.name)
      from public.organization_memberships membership
      join public.organizations organization
        on organization.id = membership.organization_id
      join public.organizations state_organization on (
        (organization.level = 'state' and state_organization.id = organization.id)
        or (
          organization.level = 'club'
          and state_organization.id = organization.parent_id
          and state_organization.level = 'state'
        )
      )
      where membership.user_id = profile.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(distinct organization.name order by organization.name)
      from public.organization_memberships membership
      join public.organizations organization
        on organization.id = membership.organization_id
      where membership.user_id = profile.id
        and organization.level = 'club'
    ), '{}'::text[]),
    coalesce((
      select array_agg(distinct relationship.relationship_type order by relationship.relationship_type)
      from public.relationships relationship
      where relationship.active
        and (select auth.uid()) in (
          relationship.user_one_id,
          relationship.user_two_id
        )
        and profile.id in (
          relationship.user_one_id,
          relationship.user_two_id
        )
    ), '{}'::public.relationship_type[]),
    coalesce((
      select array_agg(distinct request.relationship_type order by request.relationship_type)
      from public.relationship_requests request
      where request.status = 'pending'
        and request.sender_user_id = (select auth.uid())
        and request.recipient_user_id = profile.id
    ), '{}'::public.relationship_type[]),
    coalesce((
      select array_agg(distinct request.relationship_type order by request.relationship_type)
      from public.relationship_requests request
      where request.status = 'pending'
        and request.recipient_user_id = (select auth.uid())
        and request.sender_user_id = profile.id
    ), '{}'::public.relationship_type[])
  from public.profiles profile
  where (select auth.uid()) is not null
    and profile.id <> (select auth.uid())
    and private.can_view_profile(profile.id)
  order by profile.display_name;
$$;

-- Privater 5-MB-Bucket; der Dateiname enthaelt neben der eigenen User-ID eine
-- zufaellige UUID. Lesen folgt derselben Profilsichtbarkeit wie die App.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "profile_photos_read_visible"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and private.current_account_is_active()
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpe?g|png|webp)$'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.can_view_profile(
        ((storage.foldername(name))[1])::uuid
      )
    )
  );

create policy "profile_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and private.current_account_is_active()
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ (
      '^' || (select auth.uid())::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
    )
  );

create policy "profile_photos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and private.current_account_is_active()
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-photos'
    and private.current_account_is_active()
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "profile_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and private.current_account_is_active()
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
