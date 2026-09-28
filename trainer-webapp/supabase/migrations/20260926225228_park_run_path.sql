-- Kurvige Fahrlinie: Zwischenpunkte eines Runs werden im Startpunkt mitgespeichert
-- (start_point.path = [{x, z, seg}, …]). Rein additiv: park_command bleibt unverändert,
-- bestehende Runs ohne `path` bleiben gültig. Diese Prüfung begrenzt Anzahl und Form.

create function private.park_validate_path(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select p is null or (
  jsonb_typeof(p)='array' and jsonb_array_length(p)<=40
  and not exists(
   select 1 from jsonb_array_elements(p) w
   where not private.park_validate_point(w.value)
   or coalesce(jsonb_typeof(w.value->'seg'),'')<>'number'
   or (w.value->>'seg')::numeric not between 0 and 60
   or (w.value->>'seg')::numeric<>floor((w.value->>'seg')::numeric)
  )
 );
$$;

alter table public.park_runs
 add constraint park_runs_start_path check (private.park_validate_path(start_point->'path'));
