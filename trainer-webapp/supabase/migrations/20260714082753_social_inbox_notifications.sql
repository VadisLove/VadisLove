-- Soziale Vernetzung, Gruppen, Postfach und echte Benachrichtigungen.
--
-- Die Migration trennt bewusst lose Freundschaften, fachliche Trainer-
-- Athlet-Beziehungen und Elternverknuepfungen. Erst eine bestaetigte Anfrage
-- erzeugt eine aktive Beziehung und erweitert damit die Sichtbarkeit.

create type public.relationship_type as enum (
  'friend',
  'trainer_athlete',
  'guardian'
);

create type public.group_member_role as enum ('owner', 'admin', 'member');

create type public.notification_type as enum (
  'relationship_request',
  'relationship_response',
  'membership_request',
  'membership_response',
  'group_invitation',
  'group_activity',
  'event_created',
  'training_plan_shared',
  'guardian_activity'
);

create type public.share_target_type as enum ('person', 'group');

create table public.relationship_requests (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  relationship_type public.relationship_type not null,
  trainer_user_id uuid references public.profiles(id) on delete cascade,
  athlete_user_id uuid references public.profiles(id) on delete cascade,
  guardian_user_id uuid references public.profiles(id) on delete cascade,
  status public.request_status not null default 'pending',
  message text not null default '',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_user_id <> recipient_user_id),
  check (char_length(message) <= 500),
  check (
    (
      relationship_type = 'friend'
      and trainer_user_id is null
      and athlete_user_id is null
      and guardian_user_id is null
    )
    or (
      relationship_type = 'trainer_athlete'
      and trainer_user_id is not null
      and athlete_user_id is not null
      and guardian_user_id is null
      and trainer_user_id <> athlete_user_id
    )
    or (
      relationship_type = 'guardian'
      and trainer_user_id is null
      and athlete_user_id is not null
      and guardian_user_id is not null
      and athlete_user_id <> guardian_user_id
    )
  )
);

create unique index relationship_requests_one_pending_pair_idx
  on public.relationship_requests (
    least(sender_user_id, recipient_user_id),
    greatest(sender_user_id, recipient_user_id),
    relationship_type
  )
  where status = 'pending';
create index relationship_requests_sender_status_idx
  on public.relationship_requests(sender_user_id, status, created_at desc);
create index relationship_requests_recipient_status_idx
  on public.relationship_requests(recipient_user_id, status, created_at desc);
create index relationship_requests_trainer_idx
  on public.relationship_requests(trainer_user_id)
  where trainer_user_id is not null;
create index relationship_requests_athlete_idx
  on public.relationship_requests(athlete_user_id)
  where athlete_user_id is not null;
create index relationship_requests_guardian_idx
  on public.relationship_requests(guardian_user_id)
  where guardian_user_id is not null;

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references public.profiles(id) on delete cascade,
  user_two_id uuid not null references public.profiles(id) on delete cascade,
  relationship_type public.relationship_type not null,
  trainer_user_id uuid references public.profiles(id) on delete cascade,
  athlete_user_id uuid references public.profiles(id) on delete cascade,
  guardian_user_id uuid references public.profiles(id) on delete cascade,
  created_by_request_id uuid references public.relationship_requests(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (user_one_id < user_two_id),
  check ((active and ended_at is null) or not active),
  check (
    (
      relationship_type = 'friend'
      and trainer_user_id is null
      and athlete_user_id is null
      and guardian_user_id is null
    )
    or (
      relationship_type = 'trainer_athlete'
      and trainer_user_id is not null
      and athlete_user_id is not null
      and guardian_user_id is null
    )
    or (
      relationship_type = 'guardian'
      and trainer_user_id is null
      and athlete_user_id is not null
      and guardian_user_id is not null
    )
  )
);

create unique index relationships_one_active_pair_idx
  on public.relationships(user_one_id, user_two_id, relationship_type)
  where active;
create index relationships_user_one_active_idx
  on public.relationships(user_one_id, active);
create index relationships_user_two_active_idx
  on public.relationships(user_two_id, active);
create index relationships_trainer_active_idx
  on public.relationships(trainer_user_id, active)
  where trainer_user_id is not null;
create index relationships_athlete_active_idx
  on public.relationships(athlete_user_id, active)
  where athlete_user_id is not null;
create index relationships_guardian_active_idx
  on public.relationships(guardian_user_id, active)
  where guardian_user_id is not null;
create index relationships_request_idx
  on public.relationships(created_by_request_id)
  where created_by_request_id is not null;

create table public.social_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(name)) between 2 and 80),
  check (char_length(description) <= 500)
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.social_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index group_memberships_user_idx
  on public.group_memberships(user_id, joined_at desc);
create index group_memberships_group_role_idx
  on public.group_memberships(group_id, role);

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.social_groups(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  status public.request_status not null default 'pending',
  message text not null default '',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (invited_by <> invited_user_id),
  check (char_length(message) <= 500)
);

create unique index group_invitations_one_pending_idx
  on public.group_invitations(group_id, invited_user_id)
  where status = 'pending';
create index group_invitations_invited_user_idx
  on public.group_invitations(invited_user_id, status, created_at desc);
create index group_invitations_invited_by_idx
  on public.group_invitations(invited_by, status, created_at desc);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  relationship_requests boolean not null default true,
  request_updates boolean not null default true,
  group_activity boolean not null default true,
  new_events boolean not null default true,
  training_plans boolean not null default true,
  guardian_activity boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  type public.notification_type not null,
  title text not null,
  message text not null,
  link text not null default '/postfach',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(title) between 1 and 120),
  check (char_length(message) between 1 and 500),
  check (left(link, 1) = '/')
);

create index notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;
create index notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index notifications_actor_idx
  on public.notifications(actor_user_id)
  where actor_user_id is not null;

-- Trainingsplaene koennen gezielt an eine Person oder eine Gruppe geschickt
-- werden. Die eigentlichen Planinhalte bleiben in der vorhandenen, versionierten
-- Trainingsplanstruktur.
create table public.training_plan_social_shares (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  target_type public.share_target_type not null,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.social_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (target_type = 'person' and recipient_user_id is not null and group_id is null)
    or (target_type = 'group' and recipient_user_id is null and group_id is not null)
  )
);

create unique index training_plan_social_shares_person_idx
  on public.training_plan_social_shares(training_plan_id, recipient_user_id)
  where target_type = 'person';
create unique index training_plan_social_shares_group_idx
  on public.training_plan_social_shares(training_plan_id, group_id)
  where target_type = 'group';
create index training_plan_social_shares_shared_by_idx
  on public.training_plan_social_shares(shared_by, created_at desc);
create index training_plan_social_shares_recipient_idx
  on public.training_plan_social_shares(recipient_user_id, created_at desc)
  where recipient_user_id is not null;
create index training_plan_social_shares_group_lookup_idx
  on public.training_plan_social_shares(group_id, created_at desc)
  where group_id is not null;

-- Solange der bestehende Trainingsplan-Editor seine Inhalte noch als
-- Dokumentzustand fuehrt, speichert diese Tabelle eine unveraenderliche Kopie
-- beim Teilen. Empfaenger koennen sie dadurch dauerhaft in ihrer Planansicht
-- oeffnen; spaetere voll relationale Plaene nutzen die Tabelle oberhalb.
create table public.training_plan_snapshot_shares (
  id uuid primary key default gen_random_uuid(),
  shared_by uuid not null references public.profiles(id) on delete cascade,
  target_type public.share_target_type not null,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.social_groups(id) on delete cascade,
  title text not null,
  plan_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  check (char_length(btrim(title)) between 1 and 160),
  check (jsonb_typeof(plan_snapshot) = 'object'),
  check (octet_length(plan_snapshot::text) <= 262144),
  check (
    (target_type = 'person' and recipient_user_id is not null and group_id is null)
    or (target_type = 'group' and recipient_user_id is null and group_id is not null)
  )
);

create index training_plan_snapshot_recipient_idx
  on public.training_plan_snapshot_shares(recipient_user_id, created_at desc)
  where recipient_user_id is not null;
create index training_plan_snapshot_group_idx
  on public.training_plan_snapshot_shares(group_id, created_at desc)
  where group_id is not null;
create index training_plan_snapshot_sender_idx
  on public.training_plan_snapshot_shares(shared_by, created_at desc);

-- Bestehende Konten erhalten Standardwerte. Neue Konten werden durch die unten
-- neu definierte Auth-Triggerfunktion automatisch ausgestattet.
insert into public.notification_preferences (user_id)
select profile.id
from public.profiles profile
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, account_type)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.email, ''),
    case new.raw_user_meta_data ->> 'account_type'
      when 'athlete' then 'athlete'::public.account_type
      when 'trainer' then 'trainer'::public.account_type
      when 'medical' then 'medical'::public.account_type
      when 'guardian' then 'guardian'::public.account_type
      when 'organization_staff' then 'organization_staff'::public.account_type
      else 'unspecified'::public.account_type
    end
  );

  insert into public.notification_preferences (user_id)
  values (new.id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Diese Helfer kapseln RLS-uebergreifende Nachschlageoperationen. Jeder Helfer
-- prueft die angemeldete Person explizit, obwohl er als SECURITY DEFINER laeuft.
create or replace function private.are_connected(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and first_user_id is not null
    and second_user_id is not null
    and exists (
      select 1
      from public.relationships relationship
      where relationship.active
        and relationship.user_one_id = least(first_user_id, second_user_id)
        and relationship.user_two_id = greatest(first_user_id, second_user_id)
    );
$$;

create or replace function private.shares_group_with(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and first_user_id is not null
    and second_user_id is not null
    and exists (
      select 1
      from public.group_memberships first_membership
      join public.group_memberships second_membership
        on second_membership.group_id = first_membership.group_id
      where first_membership.user_id = first_user_id
        and second_membership.user_id = second_user_id
    );
$$;

create or replace function private.can_view_social_activity(actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      actor_id = auth.uid()
      or private.are_connected(auth.uid(), actor_id)
      or private.shares_group_with(auth.uid(), actor_id)
    );
$$;

create or replace function private.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.group_memberships membership
      where membership.group_id = target_group_id
        and membership.user_id = auth.uid()
    );
$$;

create or replace function private.can_manage_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.group_memberships membership
      where membership.group_id = target_group_id
        and membership.user_id = auth.uid()
        and membership.role in ('owner', 'admin')
    );
$$;

create or replace function private.can_view_shared_training_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.training_plan_social_shares social_share
      where social_share.training_plan_id = target_plan_id
        and (
          social_share.recipient_user_id = auth.uid()
          or (
            social_share.group_id is not null
            and exists (
              select 1
              from public.group_memberships membership
              where membership.group_id = social_share.group_id
                and membership.user_id = auth.uid()
            )
          )
        )
    );
$$;

-- Erzwingt gueltige Rollenpaare auch bei manipulierten Requests.
create or replace function private.validate_relationship_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trainer_type public.account_type;
  athlete_type public.account_type;
  guardian_type public.account_type;
begin
  if tg_op = 'UPDATE' then
    if new.sender_user_id <> old.sender_user_id
      or new.recipient_user_id <> old.recipient_user_id
      or new.relationship_type <> old.relationship_type
      or new.trainer_user_id is distinct from old.trainer_user_id
      or new.athlete_user_id is distinct from old.athlete_user_id
      or new.guardian_user_id is distinct from old.guardian_user_id
      or new.message <> old.message then
      raise exception 'Request participants and type cannot be changed.';
    end if;

    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is null or new.sender_user_id <> auth.uid() then
    raise exception 'Authentication required.';
  end if;

  if new.relationship_type = 'trainer_athlete' then
    if array[new.sender_user_id, new.recipient_user_id]
      @> array[new.trainer_user_id, new.athlete_user_id] is not true then
      raise exception 'Trainer and athlete must be request participants.';
    end if;

    select account_type into trainer_type
    from public.profiles where id = new.trainer_user_id;
    select account_type into athlete_type
    from public.profiles where id = new.athlete_user_id;

    if trainer_type <> 'trainer' or athlete_type <> 'athlete' then
      raise exception 'Trainer-athlete requests require matching account types.';
    end if;
  elsif new.relationship_type = 'guardian' then
    if array[new.sender_user_id, new.recipient_user_id]
      @> array[new.guardian_user_id, new.athlete_user_id] is not true then
      raise exception 'Guardian and athlete must be request participants.';
    end if;

    select account_type into guardian_type
    from public.profiles where id = new.guardian_user_id;
    select account_type into athlete_type
    from public.profiles where id = new.athlete_user_id;

    if guardian_type <> 'guardian' or athlete_type <> 'athlete' then
      raise exception 'Guardian requests require matching account types.';
    end if;
  end if;

  return new;
end;
$$;

create trigger relationship_requests_validate
  before insert or update on public.relationship_requests
  for each row execute procedure private.validate_relationship_request();

-- Bestaetigte Anfragen werden atomar in aktive Beziehungen ueberfuehrt.
create or replace function private.apply_relationship_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name text;
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    new.responded_at := coalesce(new.responded_at, now());

    if new.status = 'approved' and not exists (
      select 1
      from public.relationships relationship
      where relationship.user_one_id = least(new.sender_user_id, new.recipient_user_id)
        and relationship.user_two_id = greatest(new.sender_user_id, new.recipient_user_id)
        and relationship.relationship_type = new.relationship_type
        and relationship.active
    ) then
      insert into public.relationships (
        user_one_id,
        user_two_id,
        relationship_type,
        trainer_user_id,
        athlete_user_id,
        guardian_user_id,
        created_by_request_id
      )
      values (
        least(new.sender_user_id, new.recipient_user_id),
        greatest(new.sender_user_id, new.recipient_user_id),
        new.relationship_type,
        new.trainer_user_id,
        new.athlete_user_id,
        new.guardian_user_id,
        new.id
      );
    end if;

    select display_name into sender_name
    from public.profiles where id = new.recipient_user_id;

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      message,
      link
    )
    select
      new.sender_user_id,
      new.recipient_user_id,
      'relationship_response',
      case when new.status = 'approved' then 'Anfrage angenommen' else 'Anfrage abgelehnt' end,
      sender_name || case
        when new.status = 'approved' then ' hat deine Anfrage angenommen.'
        else ' hat deine Anfrage abgelehnt.'
      end,
      '/postfach'
    where coalesce((
      select preference.request_updates
      from public.notification_preferences preference
      where preference.user_id = new.sender_user_id
    ), true);
  end if;

  return new;
end;
$$;

create trigger relationship_requests_apply_response
  before update of status on public.relationship_requests
  for each row execute procedure private.apply_relationship_response();

create or replace function private.notify_relationship_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name text;
begin
  select display_name into sender_name
  from public.profiles where id = new.sender_user_id;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select
    new.recipient_user_id,
    new.sender_user_id,
    'relationship_request',
    case new.relationship_type
      when 'friend' then 'Neue Freundschaftsanfrage'
      when 'trainer_athlete' then 'Neue Trainer-Anfrage'
      else 'Neue Elternverknuepfung'
    end,
    sender_name || ' moechte sich mit dir vernetzen.',
    '/postfach'
  where coalesce((
    select preference.relationship_requests
    from public.notification_preferences preference
    where preference.user_id = new.recipient_user_id
  ), true);

  -- Verknuepfte Eltern werden informiert, ohne die Aktion des Athleten zu
  -- blockieren oder eine zusaetzliche Zustimmung zu verlangen.
  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select
    relationship.guardian_user_id,
    new.sender_user_id,
    'guardian_activity',
    'Aktivitaet deines Athleten',
    sender_name || ' hat eine neue Kontaktanfrage verschickt.',
    '/postfach'
  from public.relationships relationship
  left join public.notification_preferences preference
    on preference.user_id = relationship.guardian_user_id
  where relationship.relationship_type = 'guardian'
    and relationship.active
    and relationship.athlete_user_id = new.sender_user_id
    and coalesce(preference.guardian_activity, true);

  return new;
end;
$$;

create trigger relationship_requests_notify
  after insert on public.relationship_requests
  for each row execute procedure private.notify_relationship_request();

-- Der Ersteller einer Gruppe wird automatisch Besitzer.
create or replace function private.add_group_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_memberships (group_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger social_groups_add_owner
  after insert on public.social_groups
  for each row execute procedure private.add_group_owner();

create or replace function private.process_group_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_name text;
  actor_name text;
begin
  if tg_op = 'INSERT' then
    select name into group_name from public.social_groups where id = new.group_id;
    select display_name into actor_name from public.profiles where id = new.invited_by;

    insert into public.notifications (
      user_id, actor_user_id, type, title, message, link
    )
    select
      new.invited_user_id,
      new.invited_by,
      'group_invitation',
      'Einladung in ' || group_name,
      actor_name || ' hat dich in die Gruppe eingeladen.',
      '/postfach'
    where coalesce((
      select preference.group_activity
      from public.notification_preferences preference
      where preference.user_id = new.invited_user_id
    ), true);

    return new;
  end if;

  if new.group_id <> old.group_id
    or new.invited_by <> old.invited_by
    or new.invited_user_id <> old.invited_user_id
    or new.message <> old.message then
    raise exception 'Invitation participants cannot be changed.';
  end if;

  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    new.responded_at := coalesce(new.responded_at, now());
    new.updated_at := now();

    if new.status = 'approved' then
      insert into public.group_memberships (group_id, user_id, role)
      values (new.group_id, new.invited_user_id, 'member')
      on conflict (group_id, user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger group_invitations_process
  before insert or update on public.group_invitations
  for each row execute procedure private.process_group_invitation();

-- Organisationsanfragen erscheinen ebenfalls im gemeinsamen Postfach.
create or replace function private.notify_membership_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
  organization_name text;
begin
  if tg_op = 'INSERT' then
    select display_name into actor_name from public.profiles where id = new.user_id;
    select name into organization_name from public.organizations where id = new.organization_id;

    insert into public.notifications (
      user_id, actor_user_id, type, title, message, link
    )
    select distinct
      manager.user_id,
      new.user_id,
      'membership_request',
      'Neue Beitrittsanfrage',
      actor_name || ' moechte ' || organization_name || ' beitreten.',
      '/postfach'
    from public.organization_memberships manager
    left join public.notification_preferences preference
      on preference.user_id = manager.user_id
    where manager.organization_id = new.organization_id
      and manager.role in ('federal_chair', 'specialist', 'club_board')
      and coalesce(preference.relationship_requests, true);

    insert into public.notifications (
      user_id, actor_user_id, type, title, message, link
    )
    select
      relationship.guardian_user_id,
      new.user_id,
      'guardian_activity',
      'Neue Beitrittsanfrage',
      actor_name || ' hat eine Anfrage an ' || organization_name || ' gestellt.',
      '/postfach'
    from public.relationships relationship
    left join public.notification_preferences preference
      on preference.user_id = relationship.guardian_user_id
    where relationship.relationship_type = 'guardian'
      and relationship.active
      and relationship.athlete_user_id = new.user_id
      and coalesce(preference.guardian_activity, true);
  elsif old.status = 'pending' and new.status in ('approved', 'rejected') then
    select name into organization_name from public.organizations where id = new.organization_id;

    insert into public.notifications (
      user_id, actor_user_id, type, title, message, link
    )
    select
      new.user_id,
      new.reviewed_by,
      'membership_response',
      case when new.status = 'approved' then 'Beitritt bestaetigt' else 'Beitritt abgelehnt' end,
      organization_name || case
        when new.status = 'approved' then ' hat deine Anfrage angenommen.'
        else ' hat deine Anfrage abgelehnt.'
      end,
      '/postfach'
    where coalesce((
      select preference.request_updates
      from public.notification_preferences preference
      where preference.user_id = new.user_id
    ), true);
  end if;

  return new;
end;
$$;

create trigger membership_requests_notify_insert
  after insert on public.membership_requests
  for each row execute procedure private.notify_membership_request();
create trigger membership_requests_notify_update
  after update of status on public.membership_requests
  for each row execute procedure private.notify_membership_request();

-- Neue Termine werden einmalig an bestaetigte Kontakte und Mitglieder
-- gemeinsamer Gruppen gemeldet. DISTINCT verhindert doppelte Hinweise.
create or replace function private.notify_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
begin
  select display_name into actor_name from public.profiles where id = new.created_by;

  insert into public.notifications (
    user_id, actor_user_id, type, title, message, link
  )
  select distinct
    recipient.user_id,
    new.created_by,
    'event_created',
    'Neuer Termin von ' || actor_name,
    actor_name || ' hat „' || new.title || '“ angelegt.',
    '/kalender'
  from (
    select case
      when relationship.user_one_id = new.created_by then relationship.user_two_id
      else relationship.user_one_id
    end as user_id
    from public.relationships relationship
    where relationship.active
      and new.created_by in (relationship.user_one_id, relationship.user_two_id)

    union

    select member.user_id
    from public.group_memberships actor_membership
    join public.group_memberships member
      on member.group_id = actor_membership.group_id
    where actor_membership.user_id = new.created_by
      and member.user_id <> new.created_by
  ) recipient
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
  where recipient.user_id <> new.created_by
    and coalesce(preference.new_events, true);

  return new;
end;
$$;

create trigger events_notify_social_circle
  after insert on public.events
  for each row execute procedure private.notify_new_event();

create or replace function private.notify_training_plan_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
  plan_title text;
begin
  select display_name into actor_name from public.profiles where id = new.shared_by;
  select title into plan_title from public.training_plans where id = new.training_plan_id;

  insert into public.notifications (
    user_id, actor_user_id, type, title, message, link
  )
  select distinct
    recipient.user_id,
    new.shared_by,
    'training_plan_shared',
    'Trainingsplan geteilt',
    actor_name || ' hat „' || plan_title || '“ mit dir geteilt.',
    '/trainingsplaene'
  from (
    select new.recipient_user_id as user_id
    where new.target_type = 'person'

    union

    select membership.user_id
    from public.group_memberships membership
    where new.target_type = 'group'
      and membership.group_id = new.group_id
      and membership.user_id <> new.shared_by
  ) recipient
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
  where recipient.user_id is not null
    and coalesce(preference.training_plans, true);

  return new;
end;
$$;

create trigger training_plan_social_shares_notify
  after insert on public.training_plan_social_shares
  for each row execute procedure private.notify_training_plan_share();

create or replace function private.notify_training_plan_snapshot_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
begin
  select display_name into actor_name from public.profiles where id = new.shared_by;

  insert into public.notifications (
    user_id, actor_user_id, type, title, message, link
  )
  select distinct
    recipient.user_id,
    new.shared_by,
    'training_plan_shared',
    'Trainingsplan geteilt',
    actor_name || ' hat „' || new.title || '“ mit dir geteilt.',
    '/trainingsplaene'
  from (
    select new.recipient_user_id as user_id
    where new.target_type = 'person'

    union

    select membership.user_id
    from public.group_memberships membership
    where new.target_type = 'group'
      and membership.group_id = new.group_id
      and membership.user_id <> new.shared_by
  ) recipient
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
  where recipient.user_id is not null
    and coalesce(preference.training_plans, true);

  return new;
end;
$$;

create trigger training_plan_snapshot_shares_notify
  after insert on public.training_plan_snapshot_shares
  for each row execute procedure private.notify_training_plan_snapshot_share();

-- Das globale Verzeichnis gibt bei noch nicht verbundenen Personen keine
-- E-Mail-Adresse preis. Anfrage- und Beziehungsstatus werden pro Typ geliefert,
-- damit die UI keine doppelten Requests anbietet.
drop function if exists public.get_people_directory();

create function public.get_people_directory()
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
      when profile.id = auth.uid()
        or private.are_connected(auth.uid(), profile.id)
      then profile.email
      else ''
    end as email,
    profile.account_type,
    coalesce((
      select array_agg(distinct membership.role order by membership.role)
      from public.organization_memberships membership
      where membership.user_id = profile.id
    ), '{}'::public.member_role[]) as roles,
    coalesce((
      select array_agg(distinct state_organization.name order by state_organization.name)
      from public.organization_memberships membership
      join public.organizations organization on organization.id = membership.organization_id
      join public.organizations state_organization on (
        (organization.level = 'state' and state_organization.id = organization.id)
        or (
          organization.level = 'club'
          and state_organization.id = organization.parent_id
          and state_organization.level = 'state'
        )
      )
      where membership.user_id = profile.id
    ), '{}'::text[]) as states,
    coalesce((
      select array_agg(distinct organization.name order by organization.name)
      from public.organization_memberships membership
      join public.organizations organization on organization.id = membership.organization_id
      where membership.user_id = profile.id
        and organization.level = 'club'
    ), '{}'::text[]) as clubs,
    coalesce((
      select array_agg(distinct relationship.relationship_type order by relationship.relationship_type)
      from public.relationships relationship
      where relationship.active
        and auth.uid() in (relationship.user_one_id, relationship.user_two_id)
        and profile.id in (relationship.user_one_id, relationship.user_two_id)
    ), '{}'::public.relationship_type[]) as active_relationships,
    coalesce((
      select array_agg(distinct request.relationship_type order by request.relationship_type)
      from public.relationship_requests request
      where request.status = 'pending'
        and request.sender_user_id = auth.uid()
        and request.recipient_user_id = profile.id
    ), '{}'::public.relationship_type[]) as pending_sent,
    coalesce((
      select array_agg(distinct request.relationship_type order by request.relationship_type)
      from public.relationship_requests request
      where request.status = 'pending'
        and request.recipient_user_id = auth.uid()
        and request.sender_user_id = profile.id
    ), '{}'::public.relationship_type[]) as pending_received
  from public.profiles profile
  where auth.uid() is not null
    and profile.id <> auth.uid()
  order by profile.display_name;
$$;

revoke execute on function public.get_people_directory() from public, anon;
grant execute on function public.get_people_directory() to authenticated;

-- RLS ist auf jeder neuen Tabelle aktiv. Direkte Schreibrechte werden nur
-- dort vergeben, wo die App sie wirklich benoetigt.
alter table public.relationship_requests enable row level security;
alter table public.relationships enable row level security;
alter table public.social_groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_invitations enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.training_plan_social_shares enable row level security;
alter table public.training_plan_snapshot_shares enable row level security;

create policy "relationship_requests_read_related"
  on public.relationship_requests for select
  to authenticated
  using (
    (select auth.uid()) in (sender_user_id, recipient_user_id)
  );

create policy "relationship_requests_create_self"
  on public.relationship_requests for insert
  to authenticated
  with check (
    sender_user_id = (select auth.uid())
    and recipient_user_id <> (select auth.uid())
    and status = 'pending'
    and responded_at is null
  );

create policy "relationship_requests_respond_or_withdraw"
  on public.relationship_requests for update
  to authenticated
  using (
    status = 'pending'
    and (select auth.uid()) in (sender_user_id, recipient_user_id)
  )
  with check (
    (
      recipient_user_id = (select auth.uid())
      and status in ('approved', 'rejected')
    )
    or (
      sender_user_id = (select auth.uid())
      and status = 'withdrawn'
    )
  );

create policy "relationships_read_participants"
  on public.relationships for select
  to authenticated
  using ((select auth.uid()) in (user_one_id, user_two_id));

create policy "social_groups_read_members"
  on public.social_groups for select
  to authenticated
  using (private.is_group_member(id));

create policy "social_groups_create_self"
  on public.social_groups for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "social_groups_update_managers"
  on public.social_groups for update
  to authenticated
  using (private.can_manage_group(id))
  with check (private.can_manage_group(id));

create policy "group_memberships_read_group"
  on public.group_memberships for select
  to authenticated
  using (private.is_group_member(group_id));

create policy "group_memberships_remove_self_or_manager"
  on public.group_memberships for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.can_manage_group(group_id)
  );

create policy "group_invitations_read_related"
  on public.group_invitations for select
  to authenticated
  using (
    invited_user_id = (select auth.uid())
    or invited_by = (select auth.uid())
    or private.can_manage_group(group_id)
  );

create policy "group_invitations_create_manager"
  on public.group_invitations for insert
  to authenticated
  with check (
    invited_by = (select auth.uid())
    and private.can_manage_group(group_id)
    and invited_user_id <> (select auth.uid())
    and status = 'pending'
  );

create policy "group_invitations_respond_or_withdraw"
  on public.group_invitations for update
  to authenticated
  using (
    status = 'pending'
    and (
      invited_user_id = (select auth.uid())
      or invited_by = (select auth.uid())
    )
  )
  with check (
    (
      invited_user_id = (select auth.uid())
      and status in ('approved', 'rejected')
    )
    or (
      invited_by = (select auth.uid())
      and status = 'withdrawn'
    )
  );

create policy "notification_preferences_read_self"
  on public.notification_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_preferences_create_self"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_preferences_update_self"
  on public.notification_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications_read_self"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications_update_self"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "training_plan_social_shares_read_related"
  on public.training_plan_social_shares for select
  to authenticated
  using (
    shared_by = (select auth.uid())
    or recipient_user_id = (select auth.uid())
    or (group_id is not null and private.is_group_member(group_id))
  );

create policy "training_plan_social_shares_create_owner"
  on public.training_plan_social_shares for insert
  to authenticated
  with check (
    shared_by = (select auth.uid())
    and exists (
      select 1
      from public.training_plans plan
      where plan.id = training_plan_id
        and plan.created_by = (select auth.uid())
    )
    and (
      (
        target_type = 'person'
        and private.are_connected((select auth.uid()), recipient_user_id)
      )
      or (
        target_type = 'group'
        and private.can_manage_group(group_id)
      )
    )
  );

create policy "training_plan_snapshot_shares_read_related"
  on public.training_plan_snapshot_shares for select
  to authenticated
  using (
    shared_by = (select auth.uid())
    or recipient_user_id = (select auth.uid())
    or (group_id is not null and private.is_group_member(group_id))
  );

create policy "training_plan_snapshot_shares_create_connected"
  on public.training_plan_snapshot_shares for insert
  to authenticated
  with check (
    shared_by = (select auth.uid())
    and (
      (
        target_type = 'person'
        and private.are_connected((select auth.uid()), recipient_user_id)
      )
      or (
        target_type = 'group'
        and private.can_manage_group(group_id)
      )
    )
  );

-- Freunde, Trainer/Athleten und Mitglieder gemeinsamer Gruppen duerfen die
-- Termine des jeweils anderen sehen und ueber die bestehende Teilnehmerlogik
-- selbst zu- oder absagen.
drop policy if exists "events_read_for_visible_organizations" on public.events;
create policy "events_read_for_visible_organizations"
  on public.events for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or private.can_view_event_organization(organization_id)
    or private.can_view_social_activity(created_by)
  );

drop policy if exists "plans_read_owner_or_shared" on public.training_plans;
create policy "plans_read_owner_or_shared"
  on public.training_plans for select
  to authenticated
  using (
    private.is_organization_member(organization_id)
    or private.can_view_shared_training_plan(id)
    or exists (
      select 1
      from public.training_plan_shares share
      where share.training_plan_id = id
        and private.is_organization_member(share.target_organization_id)
    )
  );

-- Trigger- und RLS-Helfer sind keine oeffentlichen API-Endpunkte.
revoke execute on function private.are_connected(uuid, uuid) from public, anon;
revoke execute on function private.shares_group_with(uuid, uuid) from public, anon;
revoke execute on function private.can_view_social_activity(uuid) from public, anon;
revoke execute on function private.is_group_member(uuid) from public, anon;
revoke execute on function private.can_manage_group(uuid) from public, anon;
revoke execute on function private.can_view_shared_training_plan(uuid) from public, anon;
revoke execute on function private.validate_relationship_request() from public, anon, authenticated;
revoke execute on function private.apply_relationship_response() from public, anon, authenticated;
revoke execute on function private.notify_relationship_request() from public, anon, authenticated;
revoke execute on function private.add_group_owner() from public, anon, authenticated;
revoke execute on function private.process_group_invitation() from public, anon, authenticated;
revoke execute on function private.notify_membership_request() from public, anon, authenticated;
revoke execute on function private.notify_new_event() from public, anon, authenticated;
revoke execute on function private.notify_training_plan_share() from public, anon, authenticated;
revoke execute on function private.notify_training_plan_snapshot_share() from public, anon, authenticated;
grant execute on function private.are_connected(uuid, uuid) to authenticated;
grant execute on function private.shares_group_with(uuid, uuid) to authenticated;
grant execute on function private.can_view_social_activity(uuid) to authenticated;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.can_manage_group(uuid) to authenticated;
grant execute on function private.can_view_shared_training_plan(uuid) to authenticated;

-- Seit April 2026 werden neue Tabellen nicht mehr automatisch ueber die Data
-- API freigegeben. Diese Grants sind deshalb explizit und weiterhin durch RLS
-- eingeschraenkt.
grant select, insert, update on public.relationship_requests to authenticated;
grant select on public.relationships to authenticated;
grant select, insert, update on public.social_groups to authenticated;
grant select, delete on public.group_memberships to authenticated;
grant select, insert, update on public.group_invitations to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert on public.training_plan_social_shares to authenticated;
grant select, insert on public.training_plan_snapshot_shares to authenticated;

select pg_notify('pgrst', 'reload schema');
