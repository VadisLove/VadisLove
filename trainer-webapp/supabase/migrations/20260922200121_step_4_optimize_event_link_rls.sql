-- Die allgemeine Eigentümer-Policy galt implizit auch für SELECT und wurde
-- dadurch zusätzlich zur Sichtbarkeitspolicy ausgewertet. Getrennte
-- Schreibpolicies behalten dieselben Rechte ohne doppelte Leseprüfung.
drop policy event_information_links_owner_write on public.event_information_links;

create policy event_information_links_owner_insert
  on public.event_information_links for insert to authenticated
  with check (private.calendar_event_owner(event_id));

create policy event_information_links_owner_update
  on public.event_information_links for update to authenticated
  using (private.calendar_event_owner(event_id))
  with check (private.calendar_event_owner(event_id));

create policy event_information_links_owner_delete
  on public.event_information_links for delete to authenticated
  using (private.calendar_event_owner(event_id));

select pg_notify('pgrst', 'reload schema');
