-- PostgREST-Upserts setzen alle übergebenen Spalten, auch den unveränderten
-- Konfliktschlüssel event_id. Seit Schritt 4 fehlte hierfür UPDATE, weshalb
-- schon eine erstmalige Zusage mit SQLSTATE 42501 scheiterte.
-- RLS bleibt aktiv; der Trigger erlaubt nur das erneute Setzen derselben ID.
create function private.calendar_participant_event_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.event_id is distinct from old.event_id then
    raise exception 'CALENDAR_FORBIDDEN';
  end if;
  return new;
end;
$$;

revoke all on function private.calendar_participant_event_immutable()
  from public, anon, authenticated;

create trigger calendar_participant_event_immutable
  before update of event_id on public.event_participants
  for each row execute function private.calendar_participant_event_immutable();

grant update(event_id) on public.event_participants to authenticated;
