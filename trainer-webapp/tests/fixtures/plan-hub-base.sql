-- Isoliertes Abbild der produktiven Strukturen (Stand 2026-09-29), auf denen
-- die Planbereich-Migration aufsetzt. Hilfsfunktionen entsprechen den
-- produktiven Definitionen; keine Echtdaten.
create role anon;
create role authenticated;
create schema auth;
create schema private;
grant usage on schema public,auth,private to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}');

create type public.account_type as enum ('unspecified','athlete','trainer','medical','guardian','organization_staff');
create type public.member_role as enum ('federal_chair','specialist','federal_trainer','state_trainer','club_trainer','athlete','guardian','medical','club_board');
create type public.organization_level as enum ('federal','state','club');
create type public.relationship_type as enum ('friend','trainer_athlete','guardian');
create type public.group_member_role as enum ('owner','admin','member');
create type public.share_target_type as enum ('person','group');
create type public.notification_type as enum ('training_plan_shared');
create type public.trick_progress_status as enum ('not_started','in_progress','awaiting_confirmation','confirmed');

create table public.profiles(id uuid primary key, display_name text not null, account_type public.account_type not null);
create table public.organizations(id uuid primary key, parent_id uuid references public.organizations(id), name text not null, level public.organization_level not null);
create table public.organization_memberships(id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), user_id uuid not null references public.profiles(id), role public.member_role not null);
create table public.relationships(id uuid primary key default gen_random_uuid(), user_one_id uuid not null, user_two_id uuid not null, relationship_type public.relationship_type not null, athlete_user_id uuid, guardian_user_id uuid, active boolean not null default true);
create table public.social_groups(id uuid primary key default gen_random_uuid(), name text not null, created_by uuid not null references public.profiles(id));
create table public.group_memberships(id uuid primary key default gen_random_uuid(), group_id uuid not null references public.social_groups(id), user_id uuid not null references public.profiles(id), role public.group_member_role not null default 'member', joined_at timestamptz not null default now(), unique(group_id,user_id));
create table public.notification_preferences(user_id uuid primary key, training_plans boolean not null default true);
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null, actor_user_id uuid, type public.notification_type not null, title text not null, message text not null, link text not null);
create table public.skateparks(id uuid primary key default gen_random_uuid(), name text not null);

create function private.current_account_is_active() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function private.is_trainer_profile(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.profiles profile where profile.id = p_user_id and (profile.account_type = 'trainer'
    or exists (select 1 from public.organization_memberships membership where membership.user_id = profile.id
      and membership.role in ('federal_trainer', 'state_trainer', 'club_trainer')))) $$;
create function private.has_active_trainer_athlete_relationship(p_trainer_id uuid, p_athlete_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select p_trainer_id = (select auth.uid()) and private.is_trainer_profile(p_trainer_id) and exists (
    select 1 from public.relationships relationship where relationship.active and relationship.relationship_type = 'trainer_athlete'
      and p_trainer_id in (relationship.user_one_id, relationship.user_two_id) and p_athlete_id in (relationship.user_one_id, relationship.user_two_id)) $$;
create function private.are_connected(first_user_id uuid, second_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and first_user_id is not null and second_user_id is not null and exists (
    select 1 from public.relationships relationship where relationship.active
      and relationship.user_one_id = least(first_user_id, second_user_id) and relationship.user_two_id = greatest(first_user_id, second_user_id)) $$;
create function private.can_manage_group(target_group_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (select 1 from public.group_memberships membership
    where membership.group_id = target_group_id and membership.user_id = auth.uid() and membership.role in ('owner', 'admin')) $$;
create function private.is_group_member(target_group_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (select 1 from public.group_memberships membership
    where membership.group_id = target_group_id and membership.user_id = auth.uid()) $$;
create function private.is_organization_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organization_memberships where organization_id=target and user_id=auth.uid()) $$;
create function private.can_manage_organization(target_organization_id uuid) returns boolean language sql stable security definer set search_path='public' as $$
  select exists (select 1 from public.organization_memberships membership join public.organizations target_organization on target_organization.id = target_organization_id
    where membership.organization_id = target_organization_id and membership.user_id = auth.uid() and (
      (target_organization.level = 'federal' and membership.role = 'federal_chair')
      or (target_organization.level = 'state' and membership.role = 'specialist')
      or (target_organization.level = 'club' and membership.role = 'club_board')))
  or exists (select 1 from public.organization_memberships membership
    join public.organizations source_organization on source_organization.id = membership.organization_id
    join public.organizations target_organization on target_organization.id = target_organization_id
    where membership.user_id = auth.uid() and target_organization.parent_id = source_organization.id and (
      (source_organization.level = 'federal' and target_organization.level = 'state' and membership.role = 'federal_chair')
      or (source_organization.level = 'state' and target_organization.level = 'club' and membership.role = 'specialist'))) $$;
create function private.can_view_shared_training_plan(target uuid) returns boolean language sql stable as $$ select false $$;

create table public.training_plans(id uuid primary key default gen_random_uuid(), organization_id uuid not null, created_by uuid references public.profiles(id), title text, category text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.training_plan_versions(id uuid primary key default gen_random_uuid(), training_plan_id uuid references public.training_plans(id), version_number integer, content jsonb, created_by uuid, created_at timestamptz default now(), unique(training_plan_id,version_number));
create table public.training_plan_shares(id uuid primary key, training_plan_id uuid, target_organization_id uuid);
alter table public.training_plans enable row level security;
alter table public.training_plan_versions enable row level security;
create policy plans_read_owner_or_shared on public.training_plans for select to authenticated using(private.is_organization_member(organization_id));
create policy version_read on public.training_plan_versions for select to authenticated using(exists(select 1 from public.training_plans where id=training_plan_id));
grant select on public.training_plans,public.training_plan_versions to authenticated;

create table public.training_plan_snapshot_shares(
  id uuid primary key default gen_random_uuid(), shared_by uuid not null references public.profiles(id), target_type public.share_target_type not null,
  recipient_user_id uuid references public.profiles(id), group_id uuid references public.social_groups(id), title text not null, plan_snapshot jsonb not null,
  created_at timestamptz not null default now());
alter table public.training_plan_snapshot_shares enable row level security;
create policy training_plan_snapshot_shares_read_related on public.training_plan_snapshot_shares for select to authenticated
  using (shared_by = auth.uid() or recipient_user_id = auth.uid() or (group_id is not null and private.is_group_member(group_id)));
create policy training_plan_snapshot_shares_create_connected on public.training_plan_snapshot_shares for insert to authenticated
  with check (shared_by = auth.uid() and ((target_type = 'person' and private.are_connected(auth.uid(), recipient_user_id)) or (target_type = 'group' and private.can_manage_group(group_id))));
grant select, insert on public.training_plan_snapshot_shares to authenticated;

create table public.training_trick_progress(
  id uuid primary key default gen_random_uuid(), snapshot_share_id uuid not null references public.training_plan_snapshot_shares(id) on delete cascade,
  trick_id text not null, athlete_id uuid not null references public.profiles(id), status public.trick_progress_status not null default 'not_started',
  confirmed_by uuid, confirmed_at timestamptz, updated_at timestamptz not null default now(), unique(snapshot_share_id, trick_id),
  check ((status = 'confirmed' and confirmed_by is not null and confirmed_at is not null) or (status <> 'confirmed' and confirmed_by is null and confirmed_at is null)));
alter table public.training_trick_progress enable row level security;
create policy training_trick_progress_read_related on public.training_trick_progress for select to authenticated using (
  athlete_id = auth.uid() or private.has_active_trainer_athlete_relationship(auth.uid(), athlete_id)
  or exists (select 1 from public.training_plan_snapshot_shares share where share.id = snapshot_share_id and share.shared_by = auth.uid()));
grant select on public.training_trick_progress to authenticated;

-- Produktive Trigger: Fortschritt anlegen und Empfänger benachrichtigen.
create function private.initialize_training_trick_progress() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.target_type <> 'person' or new.recipient_user_id is null then return new; end if;
  insert into public.training_trick_progress(snapshot_share_id, trick_id, athlete_id, status)
  select new.id, trick.value->>'id', new.recipient_user_id, 'not_started'
  from jsonb_array_elements(coalesce(new.plan_snapshot->'tricks','[]'::jsonb)) trick(value)
  where trick.value->>'id' is not null on conflict (snapshot_share_id, trick_id) do nothing;
  return new;
end $$;
create trigger training_plan_snapshot_initialize_progress after insert on public.training_plan_snapshot_shares for each row execute function private.initialize_training_trick_progress();
create function private.notify_training_plan_snapshot_share() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(user_id, actor_user_id, type, title, message, link)
  select new.recipient_user_id, new.shared_by, 'training_plan_shared', 'Trainingsplan geteilt', 'x', '/trainingsplaene' where new.target_type='person';
  return new;
end $$;
create trigger training_plan_snapshot_shares_notify after insert on public.training_plan_snapshot_shares for each row execute function private.notify_training_plan_snapshot_share();
