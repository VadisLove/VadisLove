-- Vereinsnamen sind innerhalb eines Landesverbands eindeutig. Die Normalisierung
-- verhindert auch Duplikate, die sich nur durch Leerzeichen oder Schreibweise
-- unterscheiden. Der partielle Index betrifft ausschließlich Vereine.
create unique index organizations_club_name_per_state_idx
  on public.organizations (parent_id, lower(btrim(name)))
  where level = 'club';

-- Direkte Inserts bleiben als zweite Sicherheitsebene möglich, müssen für
-- Vereine aber denselben state_code wie der ausgewählte Landesverband tragen.
-- Die Rollen- und Hierarchieprüfung übernimmt weiterhin der bestehende RLS-Helfer.
drop policy if exists "organizations_create_downward" on public.organizations;
create policy "organizations_create_downward"
  on public.organizations for insert
  to authenticated
  with check (
    parent_id is not null
    and created_by = (select auth.uid())
    and private.can_create_organization(parent_id, level)
    and (
      level <> 'club'
      or state_code = (
        select parent.state_code
        from public.organizations parent
        where parent.id = organizations.parent_id
          and parent.level = 'state'
      )
    )
  );

-- Die RPC nimmt ausschließlich den Landesverband und die editierbaren
-- Vereinsfelder entgegen. parent_id, state_code und level werden aus dem
-- bestätigten Landesverband abgeleitet und können nicht manipuliert werden.
create or replace function public.create_club_organization(
  state_organization_id uuid,
  club_name text,
  club_region_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  inherited_state_code char(2);
  normalized_name text := btrim(club_name);
  normalized_region_name text := nullif(btrim(club_region_name), '');
  created_club_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select organization.state_code
  into inherited_state_code
  from public.organizations organization
  where organization.id = state_organization_id
    and organization.level = 'state';

  if not found or inherited_state_code is null then
    raise exception 'State organization was not found.' using errcode = '22023';
  end if;

  -- Nur eine bestätigte Fachwart-Mitgliedschaft im exakt ausgewählten
  -- Landesverband berechtigt zum Anlegen des untergeordneten Vereins.
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = state_organization_id
      and membership.user_id = actor_id
      and membership.role = 'specialist'
  ) then
    raise exception 'Not allowed to create this club organization.'
      using errcode = '42501';
  end if;

  if normalized_name = '' or char_length(normalized_name) > 120 then
    raise exception 'Invalid club name.' using errcode = '22023';
  end if;

  if normalized_region_name is not null
    and char_length(normalized_region_name) > 120 then
    raise exception 'Invalid club region.' using errcode = '22023';
  end if;

  begin
    insert into public.organizations (
      parent_id,
      name,
      level,
      state_code,
      region_name,
      created_by
    )
    values (
      state_organization_id,
      normalized_name,
      'club',
      inherited_state_code,
      normalized_region_name,
      actor_id
    )
    returning id into created_club_id;
  exception
    when unique_violation then
      raise exception 'Club organization already exists.' using errcode = '23505';
  end;

  return created_club_id;
end;
$$;

-- Die Funktion ist ein bewusst kleiner API-Endpunkt für angemeldete Personen.
-- Anonyme Aufrufe und die implizite PUBLIC-Berechtigung werden entfernt.
revoke all on function public.create_club_organization(uuid, text, text)
  from public, anon;
grant execute on function public.create_club_organization(uuid, text, text)
  to authenticated;
