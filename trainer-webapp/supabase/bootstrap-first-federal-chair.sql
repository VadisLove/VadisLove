-- Einmaliger Bootstrap für die erste echte Verwaltungsrolle.
--
-- Verwendung:
-- 1. Ersetze unten die E-Mail-Adresse durch dein registriertes Hauptkonto.
-- 2. Führe die Datei im Supabase SQL Editor aus.
-- 3. Lade die App neu. Danach kann dieser Account unter "Organisation"
--    weitere Konten sehen und passende Rollen vergeben.
--
-- Wichtig: Das ist bewusst kein normaler App-Flow. Ohne diesen Startpunkt
-- könnte sich jeder neue Account selbst Rechte geben.

do $$
declare
  federal_organization_id uuid;
  first_chair_id uuid;
begin
  select profile.id
  into first_chair_id
  from public.profiles profile
  where lower(profile.email) = lower('DEINE-EMAIL@BEISPIEL.DE')
  limit 1;

  if first_chair_id is null then
    raise exception 'Für diese E-Mail wurde kein Profil gefunden.';
  end if;

  insert into public.organizations (
    name,
    level,
    created_by
  )
  values (
    'Skateboard Deutschland',
    'federal',
    first_chair_id
  )
  on conflict do nothing;

  select organization.id
  into federal_organization_id
  from public.organizations organization
  where organization.level = 'federal'
  order by organization.created_at
  limit 1;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    assigned_by
  )
  values (
    federal_organization_id,
    first_chair_id,
    'federal_chair',
    first_chair_id
  )
  on conflict (organization_id, user_id, role) do nothing;
end $$;
