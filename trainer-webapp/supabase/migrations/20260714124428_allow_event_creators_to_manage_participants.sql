-- Event-Ersteller verwalten die Teilnehmenden ihres eigenen Termins. Zusätzlich
-- behalten organisatorisch Verantwortliche ihre bisherigen Verwaltungsrechte.
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
