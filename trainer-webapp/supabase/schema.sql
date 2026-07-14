-- Trainer Hub MVP: relationales Grundschema für Supabase/PostgreSQL.
-- Die Tabellen sind nach Fachbereichen getrennt und vermeiden WordPress-artige
-- Metadatenfelder, damit Beziehungen und Berechtigungen eindeutig bleiben.

create extension if not exists "pgcrypto";
create schema if not exists private;

create type public.organization_level as enum ('federal', 'state', 'club');
create type public.member_role as enum (
  'federal_chair',
  'specialist',
  'federal_trainer',
  'state_trainer',
  'club_trainer',
  'club_board',
  'athlete',
  'guardian',
  'medical'
);
create type public.request_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.event_type as enum ('training', 'contest', 'medical', 'meeting');
create type public.attendance_status as enum ('open', 'confirmed', 'declined');
create type public.account_type as enum (
  'unspecified',
  'athlete',
  'trainer',
  'medical',
  'guardian',
  'organization_staff'
);

-- Ergänzt den Supabase-Auth-Nutzer um fachlich benötigte Profildaten.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  account_type public.account_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Erstellt zu jedem neuen Auth-Nutzer automatisch das fachliche Profil.
-- Der Anzeigename kann beim Anlegen als Metadatum übergeben werden und fällt
-- andernfalls auf den Teil der E-Mail-Adresse vor dem @ zurück.
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Die Trigger-Funktion darf nicht direkt über die Data API aufgerufen werden.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Organisationen bilden Bund, Landesverbände und Vereine in einem Baum ab.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.organizations(id) on delete restrict,
  name text not null,
  level public.organization_level not null,
  state_code char(2),
  region_name text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Eine Mitgliedschaft verbindet Person, Rolle und konkrete Organisation.
-- Dadurch kann eine Person unterschiedliche Rollen in mehreren Ebenen besitzen.
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, role)
);

create index memberships_user_id_idx on public.organization_memberships(user_id);
create index memberships_organization_id_idx on public.organization_memberships(organization_id);
create index memberships_assigned_by_idx on public.organization_memberships(assigned_by);

-- Beitrittsanfragen erlauben das Onboarding ohne freie Selbstzuordnung.
-- Erst eine berechtigte Person kann daraus eine echte Mitgliedschaft machen.
create table public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role public.member_role not null,
  status public.request_status not null default 'pending',
  note text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index membership_requests_one_pending_idx
  on public.membership_requests(organization_id, user_id, requested_role)
  where status = 'pending';
create index membership_requests_user_idx on public.membership_requests(user_id);
create index membership_requests_organization_idx
  on public.membership_requests(organization_id, status);
create index membership_requests_reviewed_by_idx
  on public.membership_requests(reviewed_by);

-- Offene Konto-Einladungen speichern noch keine Organisationszuordnung.
-- Die eingeladene Person kann nach dem ersten Login Verein oder Verband
-- selbst nachtragen bzw. einen passenden Beitritt beantragen.
create table public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  target_role public.member_role not null,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status public.invitation_status not null default 'pending',
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(btrim(email))),
  check (char_length(email) between 3 and 320),
  check ((status = 'accepted') = (accepted_by is not null and accepted_at is not null))
);

create unique index account_invitations_one_pending_email_role_idx
  on public.account_invitations(email, target_role)
  where status = 'pending';
create index account_invitations_invited_by_idx
  on public.account_invitations(invited_by, created_at desc);
create index account_invitations_email_status_idx
  on public.account_invitations(email, status);
create index account_invitations_expires_at_idx
  on public.account_invitations(expires_at)
  where status = 'pending';

-- Trainer-Athleten-Zuordnungen sind unabhängig von Mitgliedschaftsrollen.
-- Ein Landestrainer kann dadurch beispielsweise Athleten aus mehreren Vereinen
-- seines Landesverbandes betreuen, ohne deren Vereinsmitgliedschaft zu ändern.
create table public.trainer_athlete_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trainer_user_id uuid not null references public.profiles(id) on delete cascade,
  athlete_user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (trainer_user_id <> athlete_user_id),
  check ((active and ended_at is null) or (not active))
);

create unique index trainer_athlete_one_active_idx
  on public.trainer_athlete_assignments(
    organization_id,
    trainer_user_id,
    athlete_user_id
  )
  where active;
create index trainer_athlete_trainer_idx
  on public.trainer_athlete_assignments(trainer_user_id, active);
create index trainer_athlete_athlete_idx
  on public.trainer_athlete_assignments(athlete_user_id, active);
create index trainer_athlete_organization_idx
  on public.trainer_athlete_assignments(organization_id, active);
create index trainer_athlete_assigned_by_idx
  on public.trainer_athlete_assignments(assigned_by);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text not null default '',
  type public.event_type not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '',
  state_code char(2),
  region_name text,
  capacity integer not null default 0 check (capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index events_organization_starts_idx on public.events(organization_id, starts_at);
create index events_organization_idx on public.events(organization_id);
create index events_state_starts_idx on public.events(state_code, starts_at);
create index events_type_starts_idx on public.events(type, starts_at);
create index events_created_by_idx on public.events(created_by);

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  invited_email text not null,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status public.attendance_status not null default 'open',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, invited_email)
);

create index event_participants_event_idx on public.event_participants(event_id);
create index event_participants_user_idx on public.event_participants(user_id);
create index event_participants_invited_by_idx on public.event_participants(invited_by);

-- Neue Termine enthalten den Ersteller sofort als bestätigten Teilnehmer. Der
-- Trigger greift für einzelne Termine, Serien und weitere Importwege gleich.
create or replace function private.add_event_creator_as_participant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.event_participants (
    event_id,
    user_id,
    invited_email,
    invited_by,
    status,
    responded_at
  )
  select
    new.id,
    profile.id,
    lower(btrim(profile.email)),
    profile.id,
    'confirmed'::public.attendance_status,
    now()
  from public.profiles profile
  where profile.id = new.created_by
  on conflict (event_id, invited_email) do update
    set user_id = excluded.user_id,
        status = 'confirmed'::public.attendance_status,
        responded_at = excluded.responded_at;

  return new;
end;
$$;

create trigger events_add_creator_as_participant
  after insert on public.events
  for each row execute function private.add_event_creator_as_participant();

-- Der Plan ist der stabile fachliche Datensatz; Inhalte liegen versioniert vor.
create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  category text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_plan_versions (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (training_plan_id, version_number)
);

create index training_plan_versions_plan_idx
  on public.training_plan_versions(training_plan_id, version_number desc);
create index training_plan_versions_created_by_idx
  on public.training_plan_versions(created_by);

create table public.training_plan_shares (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  target_organization_id uuid not null references public.organizations(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (training_plan_id, target_organization_id)
);

create index training_plans_organization_idx on public.training_plans(organization_id);
create index training_plans_created_by_idx on public.training_plans(created_by);
create index training_plan_shares_target_organization_idx
  on public.training_plan_shares(target_organization_id);
create index training_plan_shares_shared_by_idx
  on public.training_plan_shares(shared_by);
create index organizations_parent_idx on public.organizations(parent_id);
create index organizations_created_by_idx on public.organizations(created_by);

create or replace function private.role_allowed_for_level(
  target_level public.organization_level,
  target_role public.member_role
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case target_level
    when 'federal' then target_role in (
      'federal_chair',
      'federal_trainer',
      'medical'
    )
    when 'state' then target_role in (
      'specialist',
      'state_trainer',
      'medical'
    )
    when 'club' then target_role in (
      'club_board',
      'club_trainer',
      'athlete',
      'guardian',
      'medical'
    )
    else false
  end;
$$;

create or replace function private.validate_organization_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_level public.organization_level;
begin
  if new.level = 'federal' then
    if new.parent_id is not null then
      raise exception 'A federal organization cannot have a parent.';
    end if;
    return new;
  end if;

  if new.parent_id is null then
    raise exception 'State and club organizations require a parent.';
  end if;

  select organization.level
  into parent_level
  from public.organizations organization
  where organization.id = new.parent_id;

  if parent_level is null then
    raise exception 'The parent organization does not exist.';
  end if;

  if new.level = 'state' and parent_level <> 'federal' then
    raise exception 'A state organization must belong to a federal organization.';
  end if;

  if new.level = 'club' and parent_level <> 'state' then
    raise exception 'A club must belong to a state organization.';
  end if;

  return new;
end;
$$;

create trigger organizations_validate_hierarchy
  before insert or update of parent_id, level on public.organizations
  for each row execute procedure private.validate_organization_hierarchy();

create or replace function private.validate_membership_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  organization_level public.organization_level;
  membership_role public.member_role;
begin
  select organization.level
  into organization_level
  from public.organizations organization
  where organization.id = new.organization_id;

  membership_role := case
    when tg_table_name = 'membership_requests' then new.requested_role
    else new.role
  end;

  if not private.role_allowed_for_level(organization_level, membership_role) then
    raise exception 'The selected role is not valid for this organization level.';
  end if;

  return new;
end;
$$;

create trigger memberships_validate_role
  before insert or update of organization_id, role
  on public.organization_memberships
  for each row execute procedure private.validate_membership_role();

create trigger membership_requests_validate_role
  before insert or update of organization_id, requested_role
  on public.membership_requests
  for each row execute procedure private.validate_membership_role();

create or replace function private.apply_approved_membership_request()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status = 'approved' then
    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      assigned_by
    )
    values (
      new.organization_id,
      new.user_id,
      new.requested_role,
      new.reviewed_by
    )
    on conflict (organization_id, user_id, role) do nothing;
  end if;

  return new;
end;
$$;

create trigger membership_requests_apply_approval
  after update of status on public.membership_requests
  for each row execute procedure private.apply_approved_membership_request();

-- Prüft direkte Mitgliedschaften.
create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
  );
$$;

-- Prüft, ob eine Organisation gleich oder unterhalb einer anderen liegt.
create or replace function private.organization_is_same_or_descendant(
  ancestor_organization_id uuid,
  candidate_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive descendants as (
    select organization.id
    from public.organizations organization
    where organization.id = ancestor_organization_id

    union all

    select child.id
    from public.organizations child
    join descendants parent on child.parent_id = parent.id
  )
  select exists (
    select 1
    from descendants
    where id = candidate_organization_id
  );
$$;

-- Sichtbarkeit wird nach unten vererbt: Verantwortliche eines Verbandes sehen
-- seine untergeordneten Organisationen und deren Mitgliedschaften.
create or replace function private.can_view_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.user_id = auth.uid()
      and private.organization_is_same_or_descendant(
        membership.organization_id,
        target_organization_id
      )
      and membership.role in (
        'federal_chair',
        'specialist',
        'federal_trainer',
        'state_trainer',
        'club_board',
        'club_trainer'
      )
  )
  or private.is_organization_member(target_organization_id);
$$;

-- Termine folgen einer breiteren Sichtbarkeit als Organisations- und
-- Personendaten: Mitglieder einer untergeordneten Organisation dürfen auch
-- Termine ihrer übergeordneten Landes- und Bundesverbände sehen.
create or replace function private.can_view_event_organization(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      private.can_view_organization(target_organization_id)
      or exists (
        select 1
        from public.organization_memberships membership
        where membership.user_id = auth.uid()
          and private.organization_is_same_or_descendant(
            target_organization_id,
            membership.organization_id
          )
      )
    );
$$;

-- Jedes bestätigte Mitglied darf alle Terminarten in der eigenen Organisation
-- anlegen. Der Termin-Typ bleibt für eine stabile Funktionssignatur erhalten.
create or replace function private.can_create_event(
  target_organization_id uuid,
  target_event_type public.event_type
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = (select auth.uid())
        and membership.organization_id = $1
    );
$$;

create or replace function private.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.organizations source_organization
      on source_organization.id = membership.organization_id
    join public.organizations target_organization
      on target_organization.id = target_organization_id
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and (
        (target_organization.level = 'federal' and membership.role = 'federal_chair')
        or (target_organization.level = 'state' and membership.role = 'specialist')
        or (target_organization.level = 'club' and membership.role = 'club_board')
      )
  )
  or exists (
    select 1
    from public.organization_memberships membership
    join public.organizations source_organization
      on source_organization.id = membership.organization_id
    join public.organizations target_organization
      on target_organization.id = target_organization_id
    where membership.user_id = auth.uid()
      and target_organization.parent_id = source_organization.id
      and (
        (
          source_organization.level = 'federal'
          and target_organization.level = 'state'
          and membership.role = 'federal_chair'
        )
        or (
          source_organization.level = 'state'
          and target_organization.level = 'club'
          and membership.role = 'specialist'
        )
      )
  );
$$;

create or replace function private.can_assign_membership(
  target_organization_id uuid,
  target_role public.member_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations target_organization
    join public.organization_memberships actor_membership
      on actor_membership.user_id = auth.uid()
    join public.organizations actor_organization
      on actor_organization.id = actor_membership.organization_id
    where target_organization.id = target_organization_id
      and (
        (
          actor_organization.id = target_organization.id
          and actor_membership.role = 'federal_chair'
          and target_role in ('federal_chair', 'federal_trainer', 'medical')
        )
        or (
          target_organization.parent_id = actor_organization.id
          and actor_membership.role = 'federal_chair'
          and target_role = 'specialist'
        )
        or (
          actor_organization.id = target_organization.id
          and actor_membership.role = 'specialist'
          and target_role in ('specialist', 'state_trainer', 'medical')
        )
        or (
          target_organization.parent_id = actor_organization.id
          and actor_membership.role = 'specialist'
          and target_role = 'club_board'
        )
        or (
          actor_organization.id = target_organization.id
          and actor_membership.role = 'club_board'
          and target_role in (
            'club_board',
            'club_trainer',
            'athlete',
            'guardian',
            'medical'
          )
        )
      )
  );
$$;

-- Konto-Einladungen sind bewusst organisationslos. Die Berechtigung richtet
-- sich deshalb nach den Rollen, die die einladende Person irgendwo innehat:
-- Trainer laden sportliche Rollen ein, Fachwarte Landes-/Vereinsrollen und
-- Bundesvorsitzende alle nicht-medizinischen Rollen. Medical bleibt vorerst
-- gesperrt, bis der spätere Bundes-/Landesprozess fachlich geklärt ist.
create or replace function private.can_invite_account_role(
  target_role public.member_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_role <> 'medical'
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = auth.uid()
        and (
          (
            membership.role in (
              'club_trainer',
              'state_trainer',
              'federal_trainer'
            )
            and target_role in ('athlete', 'guardian')
          )
          or (
            membership.role = 'specialist'
            and target_role in (
              'specialist',
              'state_trainer',
              'club_board',
              'club_trainer',
              'athlete',
              'guardian'
            )
          )
          or (
            membership.role = 'federal_chair'
            and target_role in (
              'federal_chair',
              'specialist',
              'federal_trainer',
              'state_trainer',
              'club_trainer',
              'club_board',
              'athlete',
              'guardian'
            )
          )
        )
    );
$$;

create or replace function private.can_create_organization(
  parent_organization_id uuid,
  target_level public.organization_level
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations parent_organization
    join public.organization_memberships membership
      on membership.organization_id = parent_organization.id
    where parent_organization.id = parent_organization_id
      and membership.user_id = auth.uid()
      and (
        (
          parent_organization.level = 'federal'
          and target_level = 'state'
          and membership.role = 'federal_chair'
        )
        or (
          parent_organization.level = 'state'
          and target_level = 'club'
          and membership.role = 'specialist'
        )
      )
  );
$$;

-- Liefert nur die Informationen, die eine eingeladene Person vor dem Login
-- sehen darf. Gespeichert wird ausschließlich der Hash des Einladungs-Tokens.
create or replace function public.get_account_invitation(
  invitation_token text
)
returns table (
  email text,
  target_role public.member_role,
  status public.invitation_status,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    invitation.email,
    invitation.target_role,
    invitation.status,
    invitation.expires_at
  from public.account_invitations invitation
  where invitation.token_hash = encode(digest(invitation_token, 'sha256'), 'hex')
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  limit 1;
$$;

-- Zeigt registrierte Konten nur für Personen, die auch Rollen vergeben dürfen.
-- So können neue Accounts administriert werden, ohne Profile allgemein für
-- alle angemeldeten Nutzer sichtbar zu machen.
create or replace function public.get_assignable_profiles()
returns table (
  id uuid,
  display_name text,
  email text,
  account_type public.account_type,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.display_name,
    profile.email,
    profile.account_type,
    profile.created_at
  from public.profiles profile
  where auth.uid() is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = auth.uid()
        and membership.role in ('federal_chair', 'specialist', 'club_board')
    )
  order by profile.created_at desc, profile.display_name;
$$;

-- Liefert die konkreten Organisation/Rolle-Kombinationen, die der aktuelle
-- Nutzer vergeben darf. Das Formular nutzt diese Liste, die finale Prüfung
-- passiert beim Insert in organization_memberships nochmals per RLS.
create or replace function public.get_role_assignment_options()
returns table (
  organization_id uuid,
  role public.member_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    organization.id,
    role_option.role
  from public.organizations organization
  cross join unnest(enum_range(null::public.member_role)) as role_option(role)
  where auth.uid() is not null
    and private.can_assign_membership(organization.id, role_option.role);
$$;

-- Liefert das Personenverzeichnis mit allen fachlichen Zuordnungen.
-- Verwaltungsrollen sehen zusätzlich noch unzugeordnete Profile, damit neu
-- registrierte Accounts anschließend einer Organisation zugewiesen werden
-- können. Andere Nutzer sehen sich selbst und Personen aus ihrem Sichtbereich.
create or replace function public.get_people_directory()
returns table (
  id uuid,
  display_name text,
  email text,
  account_type public.account_type,
  roles public.member_role[],
  states text[],
  clubs text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.display_name,
    profile.email,
    profile.account_type,
    coalesce(
      array_agg(distinct membership.role)
        filter (where membership.role is not null),
      '{}'::public.member_role[]
    ) as roles,
    coalesce(
      array_agg(distinct state_organization.name)
        filter (where state_organization.name is not null),
      '{}'::text[]
    ) as states,
    coalesce(
      array_agg(distinct organization.name)
        filter (where organization.level = 'club'),
      '{}'::text[]
    ) as clubs
  from public.profiles profile
  left join public.organization_memberships membership
    on membership.user_id = profile.id
  left join public.organizations organization
    on organization.id = membership.organization_id
  left join public.organizations state_organization
    on (
      organization.level = 'state'
      and state_organization.id = organization.id
    )
    or (
      organization.level = 'club'
      and state_organization.id = organization.parent_id
      and state_organization.level = 'state'
    )
  where auth.uid() is not null
    and (
      profile.id = auth.uid()
      or exists (
        select 1
        from public.organization_memberships actor_membership
        where actor_membership.user_id = auth.uid()
          and actor_membership.role in (
            'federal_chair',
            'specialist',
            'club_board'
          )
      )
      or exists (
        select 1
        from public.organization_memberships visible_membership
        where visible_membership.user_id = profile.id
          and private.can_view_organization(
            visible_membership.organization_id
          )
      )
    )
  group by
    profile.id,
    profile.display_name,
    profile.email,
    profile.account_type
  order by profile.display_name;
$$;

-- Legt einen Landesverband und seinen ersten Fachwart in einer Transaktion an.
-- Die E-Mail-Suche bleibt innerhalb der Funktion, damit Profile nicht allgemein
-- für alle angemeldeten Nutzer lesbar gemacht werden müssen.
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
  actor_id uuid := auth.uid();
  specialist_id uuid;
  created_organization_id uuid;
  normalized_name text := btrim(organization_name);
  normalized_state_code text := upper(btrim(organization_state_code));
  normalized_email text := lower(btrim(specialist_email));
begin
  if actor_id is null then
    raise exception 'Authentication required.';
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

create or replace function private.can_assign_athlete(
  scope_organization_id uuid,
  trainer_id uuid,
  athlete_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select trainer_id = auth.uid()
    and exists (
      select 1
      from public.organization_memberships trainer_membership
      where trainer_membership.user_id = trainer_id
        and trainer_membership.organization_id = scope_organization_id
        and trainer_membership.role in (
          'federal_trainer',
          'state_trainer',
          'club_trainer'
        )
    )
    and exists (
      select 1
      from public.organization_memberships athlete_membership
      where athlete_membership.user_id = athlete_id
        and athlete_membership.role = 'athlete'
        and private.organization_is_same_or_descendant(
          scope_organization_id,
          athlete_membership.organization_id
        )
    );
$$;

-- Die RLS-Helfer prüfen intern immer auth.uid(). Anonyme Aufrufe werden
-- dennoch explizit ausgeschlossen und nur angemeldeten Nutzern erlaubt.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke execute on function private.role_allowed_for_level(
  public.organization_level,
  public.member_role
) from public, anon, authenticated;
revoke execute on function private.validate_organization_hierarchy()
  from public, anon, authenticated;
revoke execute on function private.validate_membership_role()
  from public, anon, authenticated;
revoke execute on function private.apply_approved_membership_request()
  from public, anon, authenticated;
revoke execute on function private.add_event_creator_as_participant()
  from public, anon, authenticated;
revoke execute on function private.is_organization_member(uuid) from public, anon;
revoke execute on function private.organization_is_same_or_descendant(uuid, uuid) from public, anon;
revoke execute on function private.can_view_organization(uuid) from public, anon;
revoke execute on function private.can_view_event_organization(uuid) from public, anon;
revoke execute on function private.can_create_event(uuid, public.event_type) from public, anon;
revoke execute on function private.can_manage_organization(uuid) from public, anon;
revoke execute on function private.can_assign_membership(uuid, public.member_role) from public, anon;
revoke execute on function private.can_invite_account_role(public.member_role) from public, anon;
revoke execute on function private.can_create_organization(uuid, public.organization_level) from public, anon;
revoke execute on function private.can_assign_athlete(uuid, uuid, uuid) from public, anon;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.organization_is_same_or_descendant(uuid, uuid) to authenticated;
grant execute on function private.can_view_organization(uuid) to authenticated;
grant execute on function private.can_view_event_organization(uuid) to authenticated;
grant execute on function private.can_create_event(uuid, public.event_type) to authenticated;
grant execute on function private.can_manage_organization(uuid) to authenticated;
grant execute on function private.can_assign_membership(uuid, public.member_role) to authenticated;
grant execute on function private.can_invite_account_role(public.member_role) to authenticated;
grant execute on function private.can_create_organization(uuid, public.organization_level) to authenticated;
grant execute on function private.can_assign_athlete(uuid, uuid, uuid) to authenticated;
revoke execute on function public.create_state_organization_with_specialist(
  uuid,
  text,
  text,
  text
) from public, anon;
revoke execute on function public.get_account_invitation(text) from public;
revoke execute on function public.get_assignable_profiles() from public, anon;
revoke execute on function public.get_role_assignment_options() from public, anon;
revoke execute on function public.get_people_directory() from public, anon;
grant execute on function public.create_state_organization_with_specialist(
  uuid,
  text,
  text,
  text
) to authenticated;
grant execute on function public.get_account_invitation(text) to anon, authenticated;
grant execute on function public.get_assignable_profiles() to authenticated;
grant execute on function public.get_role_assignment_options() to authenticated;
grant execute on function public.get_people_directory() to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.membership_requests enable row level security;
alter table public.account_invitations enable row level security;
alter table public.trainer_athlete_assignments enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_plan_versions enable row level security;
alter table public.training_plan_shares enable row level security;

create policy "profiles_read_authenticated"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = profiles.id
        and private.can_view_organization(membership.organization_id)
    )
  );

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "organizations_read_authenticated"
  on public.organizations for select
  to authenticated
  using (true);

create policy "organizations_create_downward"
  on public.organizations for insert
  to authenticated
  with check (
    parent_id is not null
    and private.can_create_organization(parent_id, level)
    and created_by = auth.uid()
  );

create policy "organizations_update_managers"
  on public.organizations for update
  to authenticated
  using (private.can_manage_organization(id))
  with check (private.can_manage_organization(id));

create policy "memberships_read_own_organizations"
  on public.organization_memberships for select
  to authenticated
  using (
    user_id = auth.uid()
    or private.can_view_organization(organization_id)
  );

create policy "memberships_assign_downward"
  on public.organization_memberships for insert
  to authenticated
  with check (
    assigned_by = auth.uid()
    and private.can_assign_membership(organization_id, role)
  );

create policy "memberships_remove_downward"
  on public.organization_memberships for delete
  to authenticated
  using (private.can_assign_membership(organization_id, role));

create policy "membership_requests_read_related"
  on public.membership_requests for select
  to authenticated
  using (
    user_id = auth.uid()
    or private.can_manage_organization(organization_id)
  );

create policy "membership_requests_create_self"
  on public.membership_requests for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and requested_role in (
      'federal_chair',
      'specialist',
      'federal_trainer',
      'state_trainer',
      'club_trainer',
      'club_board',
      'athlete',
      'guardian',
      'medical'
    )
  );

create policy "membership_requests_review_managers"
  on public.membership_requests for update
  to authenticated
  using (private.can_manage_organization(organization_id))
  with check (
    private.can_manage_organization(organization_id)
    and reviewed_by = auth.uid()
    and status in ('approved', 'rejected')
  );

create policy "account_invitations_read_related"
  on public.account_invitations for select
  to authenticated
  using (
    invited_by = auth.uid()
    or exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.email = account_invitations.email
    )
  );

create policy "account_invitations_create_authorized"
  on public.account_invitations for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and status = 'pending'
    and accepted_by is null
    and accepted_at is null
    and expires_at > now()
    and private.can_invite_account_role(target_role)
  );

create policy "account_invitations_update_sender"
  on public.account_invitations for update
  to authenticated
  using (
    invited_by = auth.uid()
    and status = 'pending'
  )
  with check (
    invited_by = auth.uid()
    and status in ('pending', 'revoked', 'expired')
    and accepted_by is null
    and accepted_at is null
  );

create policy "trainer_assignments_read_related"
  on public.trainer_athlete_assignments for select
  to authenticated
  using (
    trainer_user_id = auth.uid()
    or athlete_user_id = auth.uid()
    or private.can_view_organization(organization_id)
  );

create policy "trainer_assignments_create_self"
  on public.trainer_athlete_assignments for insert
  to authenticated
  with check (
    assigned_by = auth.uid()
    and private.can_assign_athlete(
      organization_id,
      trainer_user_id,
      athlete_user_id
    )
  );

create policy "trainer_assignments_end_self_or_manager"
  on public.trainer_athlete_assignments for update
  to authenticated
  using (
    trainer_user_id = auth.uid()
    or private.can_manage_organization(organization_id)
  )
  with check (
    not active
    and ended_at is not null
    and (
      trainer_user_id = auth.uid()
      or private.can_manage_organization(organization_id)
    )
  );

drop policy if exists "events_read_for_members" on public.events;
create policy "events_read_for_visible_organizations"
  on public.events for select
  to authenticated
  using (
    created_by = auth.uid()
    or private.can_view_event_organization(organization_id)
  );

drop policy if exists "events_manage_for_authorized_roles" on public.events;

create policy "events_create_as_author"
  on public.events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and private.can_create_event(organization_id, type)
  );

create policy "events_update_author"
  on public.events for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and private.can_create_event(organization_id, type)
  );

create policy "events_delete_author"
  on public.events for delete
  to authenticated
  using (created_by = auth.uid());

create policy "participants_read_related"
  on public.event_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or invited_email = (
      select profile.email
      from public.profiles profile
      where profile.id = auth.uid()
    )
    or exists (
      select 1
      from public.events event
      where event.id = event_id
        and private.can_view_event_organization(event.organization_id)
    )
  );

create policy "participants_insert_self"
  on public.event_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and invited_by = auth.uid()
    and invited_email = (
      select profile.email
      from public.profiles profile
      where profile.id = auth.uid()
    )
    and exists (
      select 1
      from public.events event
      where event.id = event_id
        and private.can_view_event_organization(event.organization_id)
    )
  );

create policy "participants_update_self"
  on public.event_participants for update
  to authenticated
  using (
    user_id = auth.uid()
    or invited_email = (
      select profile.email
      from public.profiles profile
      where profile.id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and invited_email = (
      select profile.email
      from public.profiles profile
      where profile.id = auth.uid()
    )
  );

create policy "participants_manage_event"
  on public.event_participants for all
  to authenticated
  using (
    exists (
      select 1
      from public.events event
      where event.id = event_id
        and (
          event.created_by = (select auth.uid())
          or private.can_manage_organization(event.organization_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.events event
      where event.id = event_id
        and (
          event.created_by = (select auth.uid())
          or private.can_manage_organization(event.organization_id)
        )
    )
  );

create policy "plans_read_owner_or_shared"
  on public.training_plans for select
  to authenticated
  using (
    private.is_organization_member(organization_id)
    or exists (
      select 1
      from public.training_plan_shares share
      where share.training_plan_id = id
        and private.is_organization_member(share.target_organization_id)
    )
  );

create policy "plans_manage_authorized"
  on public.training_plans for all
  to authenticated
  using (private.can_manage_organization(organization_id))
  with check (
    private.can_manage_organization(organization_id)
    and created_by = auth.uid()
  );

create policy "plan_versions_read_parent"
  on public.training_plan_versions for select
  to authenticated
  using (
    exists (
      select 1
      from public.training_plans plan
      where plan.id = training_plan_id
    )
  );

create policy "plan_versions_manage_parent"
  on public.training_plan_versions for all
  to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1
      from public.training_plans plan
      where plan.id = training_plan_id
        and private.can_manage_organization(plan.organization_id)
    )
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.training_plans plan
      where plan.id = training_plan_id
        and private.can_manage_organization(plan.organization_id)
    )
  );

create policy "plan_shares_read_related"
  on public.training_plan_shares for select
  to authenticated
  using (
    private.is_organization_member(target_organization_id)
    or exists (
      select 1
      from public.training_plans plan
      where plan.id = training_plan_id
        and private.is_organization_member(plan.organization_id)
    )
  );

create policy "plan_shares_manage_parent"
  on public.training_plan_shares for all
  to authenticated
  using (
    shared_by = auth.uid()
    and exists (
      select 1
      from public.training_plans plan
      where plan.id = training_plan_id
        and private.can_manage_organization(plan.organization_id)
    )
  )
  with check (
    shared_by = auth.uid()
    and exists (
      select 1
      from public.training_plans plan
      where plan.id = training_plan_id
        and private.can_manage_organization(plan.organization_id)
    )
  );

-- Tabellenzugriff für die Data API. RLS entscheidet anschließend pro Zeile,
-- welche Datensätze der angemeldete Nutzer tatsächlich sehen oder ändern darf.
revoke all on all tables in schema public from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, delete on public.organization_memberships to authenticated;
grant select, insert, update on public.membership_requests to authenticated;
grant select, insert, update on public.account_invitations to authenticated;
grant select, insert, update on public.trainer_athlete_assignments to authenticated;
grant select, insert, update, delete on
  public.events,
  public.event_participants,
  public.training_plans,
  public.training_plan_versions,
  public.training_plan_shares
to authenticated;
