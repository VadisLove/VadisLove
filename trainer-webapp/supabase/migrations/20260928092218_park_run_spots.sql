-- Tippposition je Trick: Der Planer speichert, wo ein Trick gefahren wird, im Startpunkt
-- des Runs (start_point.spots = [{x, z} | null, …] in Schrittreihenfolge). Rein additiv wie
-- start_point.path; diese Prüfung begrenzt Anzahl und Form.

create function private.park_validate_spots(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select p is null or (
  jsonb_typeof(p)='array' and jsonb_array_length(p)<=60
  and not exists(
   select 1 from jsonb_array_elements(p) s
   where jsonb_typeof(s.value)<>'null' and not private.park_validate_point(s.value)
  )
 );
$$;

alter table public.park_runs
 add constraint park_runs_start_spots check (private.park_validate_spots(start_point->'spots'));
