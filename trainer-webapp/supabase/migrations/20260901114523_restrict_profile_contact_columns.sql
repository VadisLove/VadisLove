-- Oeffentliche Profilfelder bleiben fuer sichtbare Mitglieder lesbar. Kontakt-
-- und Detailfelder werden dagegen nur noch ueber eng autorisierte Funktionen
-- ausgegeben, damit ein direkter Data-API-SELECT sie nicht sammeln kann.

create or replace function private.current_profile_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.email
  from public.profiles profile
  where profile.id = (select auth.uid())
    and private.current_account_is_active();
$$;

revoke execute on function private.current_profile_email()
  from public, anon;
grant execute on function private.current_profile_email()
  to authenticated, service_role;

-- Die oeffentliche, parameterlose RPC kann ausschliesslich die durch den
-- privaten Helfer an auth.uid() gebundene eigene E-Mail zurueckgeben.
create or replace function public.get_current_profile_email()
returns text
language sql
stable
set search_path = ''
as $$
  select private.current_profile_email();
$$;

revoke execute on function public.get_current_profile_email()
  from public, anon;
grant execute on function public.get_current_profile_email()
  to authenticated;

-- Das eigene Profil benoetigt weiterhin alle bearbeitbaren Detailfelder. Die
-- feste auth.uid()-Bindung verhindert, dass die Funktion als Fremdprofil-Leser
-- verwendet werden kann.
create or replace function public.get_own_profile()
returns table (
  id uuid,
  first_name text,
  last_name text,
  display_name text,
  email text,
  phone text,
  location text,
  bio text,
  disciplines text[],
  visibility public.profile_visibility,
  avatar_path text,
  account_type public.account_type
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.first_name,
    profile.last_name,
    profile.display_name,
    profile.email,
    profile.phone,
    profile.location,
    profile.bio,
    profile.disciplines,
    profile.visibility,
    profile.avatar_path,
    profile.account_type
  from public.profiles profile
  where profile.id = (select auth.uid())
    and private.current_account_is_active();
$$;

revoke execute on function public.get_own_profile()
  from public, anon;
grant execute on function public.get_own_profile()
  to authenticated;

-- Kontaktfelder sind enger autorisiert als die allgemeine Profil-Sichtbarkeit:
-- all_members allein darf weder E-Mail noch Telefon oder Ort freigeben.
create or replace function private.can_view_profile_contact_data(
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and private.account_is_active(target_user_id)
    and (
      target_user_id = (select auth.uid())
      or private.are_connected((select auth.uid()), target_user_id)
      or exists (
        select 1
        from public.organization_memberships target_membership
        where target_membership.user_id = target_user_id
          and private.can_manage_organization(
            target_membership.organization_id
          )
      )
    );
$$;

revoke execute on function private.can_view_profile_contact_data(uuid)
  from public, anon;
grant execute on function private.can_view_profile_contact_data(uuid)
  to authenticated, service_role;

-- Bei Termineinladungen darf nur ein bereits berechtigter Terminverwalter
-- eine exakt eingegebene E-Mail-Adresse in eine Profil-ID aufloesen. Die
-- engere Kontaktfreigabe verhindert dabei ein E-Mail-Bestaetigungsorakel fuer
-- lediglich allgemein sichtbare Profile.
create or replace function public.resolve_event_participant_profile(
  p_event_id uuid,
  p_email text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(p_email));
  resolved_profile_id uuid;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.events event
    where event.id = p_event_id
      and (
        event.created_by = actor_id
        or private.can_manage_organization(event.organization_id)
      )
  ) then
    raise exception 'Not allowed to manage this event.' using errcode = '42501';
  end if;

  select profile.id
  into resolved_profile_id
  from public.profiles profile
  where lower(profile.email) = normalized_email
    and private.can_view_profile_contact_data(profile.id)
  limit 1;

  return resolved_profile_id;
end;
$$;

revoke execute on function public.resolve_event_participant_profile(uuid, text)
  from public, anon;
grant execute on function public.resolve_event_participant_profile(uuid, text)
  to authenticated;

-- RLS-Policies auf anderen Tabellen vergleichen nur noch mit der eigenen
-- E-Mail ueber den gebundenen Helfer. Sie benoetigen kein allgemeines Leserecht
-- auf der geschuetzten profiles.email-Spalte mehr.
drop policy if exists "account_invitations_read_related"
  on public.account_invitations;
create policy "account_invitations_read_related"
  on public.account_invitations for select
  to authenticated
  using (
    invited_by = (select auth.uid())
    or email = private.current_profile_email()
  );

drop policy if exists "participants_read_related"
  on public.event_participants;
create policy "participants_read_related"
  on public.event_participants for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or invited_email = private.current_profile_email()
    or exists (
      select 1
      from public.events event
      where event.id = event_id
        and private.can_view_event_organization(event.organization_id)
    )
  );

drop policy if exists "participants_insert_self"
  on public.event_participants;
create policy "participants_insert_self"
  on public.event_participants for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and invited_by = (select auth.uid())
    and invited_email = private.current_profile_email()
    and exists (
      select 1
      from public.events event
      where event.id = event_id
        and private.can_view_event_organization(event.organization_id)
    )
  );

drop policy if exists "participants_update_self"
  on public.event_participants;
create policy "participants_update_self"
  on public.event_participants for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or invited_email = private.current_profile_email()
  )
  with check (
    user_id = (select auth.uid())
    and invited_email = private.current_profile_email()
  );

-- Der Trigger benoetigt die E-Mail des Event-Erstellers auch fuer serverseitige
-- Importwege. Als nicht exponierte SECURITY-DEFINER-Funktion prueft er bei
-- Nutzersitzungen zusaetzlich, dass created_by nicht umgebogen wurde.
create or replace function private.add_event_creator_as_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and new.created_by <> (select auth.uid()) then
    raise exception 'Event creator must match the authenticated account.'
      using errcode = '42501';
  end if;

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

revoke execute on function private.add_event_creator_as_participant()
  from public, anon, authenticated;

-- Erst nach Bereitstellung der sicheren Lesepfade wird das bisherige
-- Tabellenrecht entfernt. Direkte Abfragen koennen nur die absichtlich
-- oeffentlichen Profilbereiche verwenden; insbesondere Kontaktprojektionen und
-- SELECT * schlagen fehl.
revoke select on public.profiles from authenticated;
grant select (
  id,
  first_name,
  last_name,
  display_name,
  account_type,
  bio,
  disciplines,
  visibility,
  avatar_path,
  created_at,
  updated_at
) on public.profiles to authenticated;

select pg_notify('pgrst', 'reload schema');
