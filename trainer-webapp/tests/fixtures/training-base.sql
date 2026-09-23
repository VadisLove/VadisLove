-- Isolierte PostgreSQL-Verträge für die Trainingsmigration; keine Echtdaten.
create role anon;
create role authenticated;
create schema auth;
create schema private;
grant usage on schema public,auth,private to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key,display_name text,account_type text);
create table public.relationships(trainer_id uuid,athlete_id uuid,active boolean);
create function private.current_account_is_active() returns boolean language sql stable as $$ select auth.uid() is not null and auth.uid()<>'00000000-0000-0000-0000-000000000009'::uuid $$;
create function private.has_active_trainer_athlete_relationship(t uuid,a uuid) returns boolean language sql stable security definer set search_path='' as $$ select t=auth.uid() and exists(select 1 from public.profiles p join public.relationships r on r.trainer_id=p.id where p.id=t and p.account_type='trainer' and r.athlete_id=a and r.active) $$;
create table public.training_plans(id uuid primary key default gen_random_uuid(),organization_id uuid not null,created_by uuid references public.profiles(id),title text,category text,updated_at timestamptz default now());
create table public.training_plan_versions(id uuid primary key default gen_random_uuid(),training_plan_id uuid references public.training_plans(id),version_number integer,content jsonb,created_by uuid,created_at timestamptz default now(),unique(training_plan_id,version_number));
create table public.training_plan_snapshot_shares(id uuid primary key,shared_by uuid,recipient_user_id uuid,plan_snapshot jsonb);
alter table public.training_plans enable row level security;
alter table public.training_plan_versions enable row level security;
create policy version_read on public.training_plan_versions for select to authenticated using(exists(select 1 from public.training_plans where id=training_plan_id));
grant select on public.training_plans,public.training_plan_versions to authenticated;

-- Abbild der produktiven wechselseitigen Plan-/Freigabe-Policies. Die Migration
-- muss diesen Zyklus auflösen, bevor eigene Planversionen gelesen werden können.
create table public.training_plan_shares(id uuid primary key,training_plan_id uuid,target_organization_id uuid);
create table public.organization_memberships(organization_id uuid,user_id uuid);
create function private.is_organization_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_memberships where organization_id=target and user_id=auth.uid()) $$;
create function private.can_view_shared_training_plan(target uuid) returns boolean language sql stable as $$ select false $$;
alter table public.training_plan_shares enable row level security;
grant select on public.training_plan_shares to authenticated;
create policy plan_shares_read_related on public.training_plan_shares for select to authenticated using(private.is_organization_member(target_organization_id) or exists(select 1 from public.training_plans p where p.id=training_plan_id and private.is_organization_member(p.organization_id)));
create policy plans_read_owner_or_shared on public.training_plans for select to authenticated using(private.is_organization_member(organization_id) or exists(select 1 from public.training_plan_shares s where s.training_plan_id=s.id and private.is_organization_member(s.target_organization_id)));
