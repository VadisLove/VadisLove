-- Nachrüstung für:
-- 1. echtes Personenverzeichnis mit Land-, Vereins- und Tätigkeitsfiltern
-- 2. Termine, die nur vom jeweiligen Ersteller bearbeitet/gelöscht werden
--
-- Diese Datei im Supabase SQL Editor vollständig ausführen.

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

revoke execute on function public.get_people_directory() from public, anon;
grant execute on function public.get_people_directory() to authenticated;

drop policy if exists "events_read_for_members" on public.events;
drop policy if exists "events_read_for_visible_organizations" on public.events;
drop policy if exists "events_manage_for_authorized_roles" on public.events;
drop policy if exists "events_create_as_author" on public.events;
drop policy if exists "events_update_author" on public.events;
drop policy if exists "events_delete_author" on public.events;

create policy "events_read_for_visible_organizations"
  on public.events for select
  to authenticated
  using (
    created_by = auth.uid()
    or private.can_view_organization(organization_id)
  );

create policy "events_create_as_author"
  on public.events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and private.is_organization_member(organization_id)
  );

create policy "events_update_author"
  on public.events for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and private.is_organization_member(organization_id)
  );

create policy "events_delete_author"
  on public.events for delete
  to authenticated
  using (created_by = auth.uid());

grant select, insert, update, delete on public.events to authenticated;

-- PostgREST liest neue Funktionen sonst eventuell erst verzögert ein.
select pg_notify('pgrst', 'reload schema');
