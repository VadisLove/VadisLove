-- Ergänzt die vom DRIV veröffentlichten Landesverbände. Der bereits vorhandene
-- bayerische BRIV bleibt unverändert und erhält lediglich seinen Regionsnamen.
with federal_parent as (
  select coalesce(
    (
      select organization.parent_id
      from public.organizations organization
      where organization.level = 'state'
        and organization.state_code = 'BY'
      order by organization.created_at
      limit 1
    ),
    (
      select organization.id
      from public.organizations organization
      where organization.level = 'federal'
      order by organization.created_at
      limit 1
    )
  ) as id
), state_associations(name, state_code, region_name) as (
  values
    ('Südbadischer Rollsport- und Inline Verband e.V.', 'BW', 'Südbaden'),
    ('Badischer Roll- und Inlinesportverband e.V.', 'BW', 'Baden'),
    ('Württembergischer Rollsport- und Inline-Verband e.V.', 'BW', 'Württemberg'),
    ('Inline- und Rollsport-Verband Berlin e.V.', 'BE', 'Berlin'),
    ('Brandenburgischer Rollsport und Inline Verband e.V.', 'BB', 'Brandenburg'),
    ('Bremer Eis- und Rollsport-Verband e. V.', 'HB', 'Bremen'),
    ('Hamburger Eis- und Rollsportverband e.V.', 'HH', 'Hamburg'),
    ('Hessischer Rollsport und Inline Verband e.V.', 'HE', 'Hessen'),
    ('Landesfachverband Rollsport-Inline-Skater Mecklenburg-Vorpommern e.V.', 'MV', 'Mecklenburg-Vorpommern'),
    ('Rollsport- und Inline-Verband Schleswig-Holstein e.V.', 'SH', 'Schleswig-Holstein'),
    ('Rollsportverband Nordrhein Westfalen e.V.', 'NW', 'Nordrhein-Westfalen'),
    ('Saarländischer Eis- und Rollsportverband e.V.', 'SL', 'Saarland'),
    ('Rheinland-Pfälzischer Rollsport- und Inline-Verband e.V.', 'RP', 'Rheinland-Pfalz'),
    ('Niedersächsischer Rollsport- und Inline-Verband e.V.', 'NI', 'Niedersachsen'),
    ('Rollsport- und Inline-Verband Sachsen e.V.', 'SN', 'Sachsen'),
    ('Landesverband Rollsport Sachsen-Anhalt e.V.', 'ST', 'Sachsen-Anhalt'),
    ('Thüringer Eis- und Rollsportverband e.V.', 'TH', 'Thüringen')
)
insert into public.organizations (
  parent_id,
  name,
  level,
  state_code,
  region_name
)
select
  federal_parent.id,
  state_association.name,
  'state'::public.organization_level,
  state_association.state_code,
  state_association.region_name
from federal_parent
cross join state_associations state_association
where federal_parent.id is not null
  and not exists (
    select 1
    from public.organizations existing
    where existing.parent_id = federal_parent.id
      and existing.level = 'state'
      and existing.name = state_association.name
  );

update public.organizations
set region_name = 'Bayern'
where level = 'state'
  and state_code = 'BY'
  and region_name is null;

-- Die Registrierung benötigt nur eine bewusst reduzierte, öffentliche Liste.
-- Interne Organisationsfelder wie created_by werden nicht an anonyme Nutzer
-- ausgegeben.
create or replace function public.get_registration_organizations()
returns table (
  id uuid,
  name text,
  level public.organization_level,
  state_code char(2),
  region_name text,
  parent_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    organization.id,
    organization.name,
    organization.level,
    organization.state_code,
    organization.region_name,
    parent.name
  from public.organizations organization
  left join public.organizations parent on parent.id = organization.parent_id
  where organization.level in ('state', 'club')
  order by
    case organization.level when 'state' then 1 else 2 end,
    coalesce(organization.region_name, organization.name),
    organization.name;
$$;

revoke all on function public.get_registration_organizations()
  from public, anon, authenticated;
grant execute on function public.get_registration_organizations()
  to anon, authenticated;

-- Erstellt weiterhin das Profil und übernimmt zusätzlich die bei der
-- Registrierung ausgewählte Organisation als offene Beitrittsanfrage.
-- Das Metadatum gilt ausdrücklich nicht als Berechtigung: Organisationsebene
-- und Rolle werden hier erneut geprüft und müssen später bestätigt werden.
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
begin
  selected_account_type := case new.raw_user_meta_data ->> 'account_type'
    when 'athlete' then 'athlete'::public.account_type
    when 'trainer' then 'trainer'::public.account_type
    when 'medical' then 'medical'::public.account_type
    when 'guardian' then 'guardian'::public.account_type
    when 'organization_staff' then 'organization_staff'::public.account_type
    else 'unspecified'::public.account_type
  end;

  insert into public.profiles (id, display_name, email, account_type)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
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

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
