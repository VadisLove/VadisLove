-- Korrigiert die Sichtbarkeit von Verbandsterminen für Mitglieder
-- untergeordneter Organisationen.
--
-- Dieses Update im Supabase SQL Editor vollständig ausführen. Es erweitert
-- ausschließlich die Termin-Sichtbarkeit; Organisations-, Personen- und
-- Mitgliedschaftsdaten behalten ihre bisherigen, engeren RLS-Regeln.

create or replace function private.can_view_event_organization(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      -- Beibehaltung der bisherigen Sicht nach unten und für direkte Mitglieder.
      private.can_view_organization(target_organization_id)
      or exists (
        select 1
        from public.organization_memberships membership
        where membership.user_id = auth.uid()
          -- Liegt die eigene Organisation unterhalb des Termin-Verbandes,
          -- darf das Mitglied dessen Termin ebenfalls sehen.
          and private.organization_is_same_or_descendant(
            target_organization_id,
            membership.organization_id
          )
      )
    );
$$;

-- Die Hilfsfunktion liegt im privaten Schema und wird nur von RLS verwendet.
revoke execute on function private.can_view_event_organization(uuid)
  from public, anon;
grant execute on function private.can_view_event_organization(uuid)
  to authenticated;

-- Rollenabhängige Erstellungsrechte:
-- Trainer/Verantwortliche: alle Arten, Athleten: alles außer Training,
-- medizinische Rollen: Arzttermine.
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
  select auth.uid() is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = auth.uid()
        -- Positionsparameter sind hier absichtlich eindeutig. Manche
        -- PostgreSQL-Konfigurationen lösen benannte SQL-Parameter innerhalb
        -- verschachtelter Abfragen sonst fälschlich als Spaltennamen auf.
        and membership.organization_id = $1
        and (
          membership.role in (
            'federal_chair',
            'specialist',
            'federal_trainer',
            'state_trainer',
            'club_trainer',
            'club_board'
          )
          or (
            membership.role = 'athlete'
            and $2 <> 'training'::public.event_type
          )
          or (
            membership.role = 'medical'
            and $2 = 'medical'::public.event_type
          )
        )
    );
$$;

revoke execute on function private.can_create_event(uuid, public.event_type)
  from public, anon;
grant execute on function private.can_create_event(uuid, public.event_type)
  to authenticated;

drop policy if exists "events_read_for_visible_organizations"
  on public.events;

create policy "events_read_for_visible_organizations"
  on public.events for select
  to authenticated
  using (
    created_by = auth.uid()
    or private.can_view_event_organization(organization_id)
  );

drop policy if exists "events_create_as_author" on public.events;
create policy "events_create_as_author"
  on public.events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and private.can_create_event(organization_id, type)
  );

drop policy if exists "events_update_author" on public.events;
create policy "events_update_author"
  on public.events for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and private.can_create_event(organization_id, type)
  );

-- PostgREST übernimmt die geänderte Policy ohne längere Cache-Verzögerung.
select pg_notify('pgrst', 'reload schema');
