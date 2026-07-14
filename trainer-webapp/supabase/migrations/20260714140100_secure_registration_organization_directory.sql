-- Anonyme Registrierungen dürfen ausschließlich die für die Auswahl nötigen
-- Organisationsspalten lesen. Zeitstempel und interne Verantwortliche bleiben
-- trotz der öffentlichen Verzeichnisansicht geschützt.
grant select (
  id,
  parent_id,
  name,
  level,
  state_code,
  region_name
) on public.organizations to anon;

create policy "organizations_read_registration_directory"
  on public.organizations for select
  to anon
  using (level in ('state', 'club'));

-- Mit den eingeschränkten Spaltenrechten kann die RPC nun unter den Rechten
-- des aufrufenden Nutzers laufen und benötigt kein SECURITY DEFINER mehr.
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
security invoker
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
