-- Erlaubt angemeldeten Nutzern, fuer sichtbare Termine selbst zu- oder abzusagen.
-- Wichtig fuer E-Mail-Einladungen: Eine bestehende Zeile darf auch dann
-- uebernommen werden, wenn `user_id` noch leer ist, aber `invited_email`
-- zur Profil-E-Mail des eingeloggten Nutzers passt.

drop policy if exists "participants_read_related" on public.event_participants;
drop policy if exists "participants_insert_self" on public.event_participants;
drop policy if exists "participants_update_self" on public.event_participants;

create policy "participants_read_related"
  on public.event_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or invited_email = (
      select profile.email
      from public.profiles profile
      where profile.id = auth.uid()
    )
    or exists (
      select 1
      from public.events event
      where event.id = event_id
        and private.can_view_event_organization(event.organization_id)
    )
  );

create policy "participants_insert_self"
  on public.event_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and invited_by = auth.uid()
    and invited_email = (
      select profile.email
      from public.profiles profile
      where profile.id = auth.uid()
    )
    and exists (
      select 1
      from public.events event
      where event.id = event_id
        and private.can_view_event_organization(event.organization_id)
    )
  );

create policy "participants_update_self"
  on public.event_participants for update
  to authenticated
  using (
    user_id = auth.uid()
    or invited_email = (
      select profile.email
      from public.profiles profile
      where profile.id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and invited_email = (
      select profile.email
      from public.profiles profile
      where profile.id = auth.uid()
    )
  );
