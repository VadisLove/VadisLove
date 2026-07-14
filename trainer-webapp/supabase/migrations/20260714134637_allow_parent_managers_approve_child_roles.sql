-- Elternorganisationen dürfen Anfragen ihrer direkt untergeordneten Ebene
-- prüfen und müssen deshalb auch alle dort gültigen Rollen vergeben können.
-- So kann ein Fachwart einen Verein initial aufbauen, bevor ein Vorstand
-- vorhanden ist; die bestehende Hierarchie bleibt auf eine Ebene begrenzt.
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
      on actor_membership.user_id = (select auth.uid())
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
          and target_role in ('specialist', 'state_trainer', 'medical')
        )
        or (
          actor_organization.id = target_organization.id
          and actor_membership.role = 'specialist'
          and target_role in ('specialist', 'state_trainer', 'medical')
        )
        or (
          target_organization.parent_id = actor_organization.id
          and actor_membership.role = 'specialist'
          and target_role in (
            'club_board',
            'club_trainer',
            'athlete',
            'guardian',
            'medical'
          )
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

revoke execute on function private.can_assign_membership(
  uuid,
  public.member_role
) from public, anon;
grant execute on function private.can_assign_membership(
  uuid,
  public.member_role
) to authenticated;
