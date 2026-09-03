-- Minimale bestehende App-Verträge für echte PostgreSQL/RLS-Integrationstests.
-- Ausschließlich synthetische Konten; keine Verbindung zur Produktion.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
grant usage on schema public,auth,private to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create type public.notification_type as enum('guardian_activity');
create table public.profiles(id uuid primary key,display_name text,email text);
create table public.events(id uuid primary key,organization_id uuid,created_by uuid,type text,starts_at timestamptz,ends_at timestamptz,location text);
create table public.relationships(guardian_user_id uuid,athlete_user_id uuid,active boolean,relationship_type text);
create table public.guardian_approval_requests(minor_user_id uuid,guardian_required_until date,status text);
create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,actor_user_id uuid,type public.notification_type,title text,message text,link text);
create function private.account_is_active(target uuid) returns boolean language sql stable security definer set search_path='' as $$
select target is not null and not exists(select 1 from public.guardian_approval_requests where minor_user_id=target and status<>'approved' and guardian_required_until>current_date);
$$;
revoke all on function private.account_is_active(uuid) from public,authenticated,anon;
grant execute on function private.account_is_active(uuid) to service_role;
create function private.current_account_is_active() returns boolean language sql stable security definer set search_path='' as $$ select private.account_is_active(auth.uid()); $$;
create function private.is_organization_member(target uuid) returns boolean language sql stable as $$ select target='10000000-0000-0000-0000-000000000001'::uuid and auth.uid() in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000006'); $$;
create function private.can_view_event_organization(target uuid) returns boolean language sql stable as $$ select private.is_organization_member(target); $$;
create function private.can_view_social_activity(target uuid) returns boolean language sql stable as $$ select false; $$;
alter table public.events enable row level security;
create policy read_events on public.events for select to authenticated using(private.current_account_is_active() and (created_by=auth.uid() or private.is_organization_member(organization_id)));
grant select on public.events to authenticated;
grant select on public.profiles,public.relationships to service_role;
