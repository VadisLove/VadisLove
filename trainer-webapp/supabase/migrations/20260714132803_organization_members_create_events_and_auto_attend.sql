-- Jedes bestätigte Organisationsmitglied darf alle Terminarten innerhalb der
-- eigenen Organisation erstellen. Der übergebene Termin-Typ bleibt Teil der
-- Signatur, damit bestehende RLS-Policies unverändert aufrufen können.
create or replace function private.can_create_event(
  target_organization_id uuid,
  target_event_type public.event_type
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = (select auth.uid())
        and membership.organization_id = target_organization_id
    );
$$;

revoke execute on function private.can_create_event(uuid, public.event_type)
  from public, anon;
grant execute on function private.can_create_event(uuid, public.event_type)
  to authenticated;

-- Selbst gestellte Beitrittsanfragen dürfen jede fachliche Rolle anfragen.
-- Der bestehende Tabellen-Trigger validiert zusätzlich, ob die Rolle zur
-- gewählten Organisationsebene passt; die Organisation muss sie bestätigen.
drop policy if exists "membership_requests_create_self"
  on public.membership_requests;
create policy "membership_requests_create_self"
  on public.membership_requests for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and requested_role in (
      'federal_chair',
      'specialist',
      'federal_trainer',
      'state_trainer',
      'club_trainer',
      'club_board',
      'athlete',
      'guardian',
      'medical'
    )
  );

-- Der Event-Ersteller benötigt Verwaltungsrechte auf seinem eigenen
-- Teilnehmerdatensatz, damit der folgende Trigger auch für Trainer und andere
-- reguläre Mitglieder unter aktivem RLS atomar ausgeführt werden kann.
drop policy if exists "participants_manage_event" on public.event_participants;
create policy "participants_manage_event"
  on public.event_participants for all
  to authenticated
  using (
    exists (
      select 1
      from public.events event
      where event.id = event_id
        and (
          event.created_by = (select auth.uid())
          or private.can_manage_organization(event.organization_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.events event
      where event.id = event_id
        and (
          event.created_by = (select auth.uid())
          or private.can_manage_organization(event.organization_id)
        )
    )
  );

-- Der Ersteller nimmt an jedem neu angelegten Termin automatisch teil. Ein
-- AFTER-ROW-Trigger hält auch Serien und künftige Importwege konsistent.
create or replace function private.add_event_creator_as_participant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

drop trigger if exists events_add_creator_as_participant on public.events;
create trigger events_add_creator_as_participant
  after insert on public.events
  for each row execute function private.add_event_creator_as_participant();
