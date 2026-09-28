-- Schritt 7b: Park-Untergrund aus amtlichen Daten (Höhenraster + Luftbild) und eigene
-- 3D-Modelle (OBJ, glTF/GLB) als Park oder Obstacle. Rein additive Erweiterung:
-- bestehende Parkinhalte bleiben gültig, park_command bleibt unverändert.

-- ---------------------------------------------------------------------------
-- Inhaltsprüfung erweitert (gleiche Signatur, wird von park_command aufgerufen)
-- ---------------------------------------------------------------------------

create or replace function private.park_validate_content(content jsonb) returns void
language plpgsql set search_path='' as $$
declare o jsonb; a jsonb; g jsonb; geo jsonb;
 asset_re constant text := '^[0-9a-f-]{36}/[0-9a-f-]{36}\.';
begin
 if content is null or jsonb_typeof(content)<>'object' or length(content::text)>200000
 or coalesce(jsonb_typeof(content->'size'),'')<>'object'
 or not private.park_num(content->'size'->'width',10,300) or not private.park_num(content->'size'->'length',10,300)
 or coalesce(jsonb_typeof(content->'obstacles'),'')<>'array' or jsonb_array_length(content->'obstacles')>300
 then raise exception 'PARK_INVALID'; end if;
 for o in select value from jsonb_array_elements(content->'obstacles') loop
  if jsonb_typeof(o)<>'object' or coalesce(jsonb_typeof(o->'id'),'')<>'string' or length(o->>'id') not between 1 and 64
  or coalesce(o->>'type','') not in ('quarter','bank','bowl','ledge','hubba','stairs','rail','manual_pad','wall','zone','custom')
  or not private.park_num(o->'x',-200,200) or not private.park_num(o->'z',-200,200)
  or not private.park_num(o->'rotation',-360,360)
  or not private.park_num(o->'width',0.1,60) or not private.park_num(o->'length',0.1,60) or not private.park_num(o->'height',0.05,10)
  or (o ? 'label' and (jsonb_typeof(o->'label')<>'string' or length(o->>'label')>60))
  -- Optionaler Höhenversatz gegenüber dem Gelände.
  or (o ? 'elevation' and not private.park_num(o->'elevation',-20,20))
  -- Eigenes Modell: Datei im Modell-Speicher, Format und Hochachse.
  or (o->>'type'='custom' and (
       coalesce(o->>'modelPath','') !~ (asset_re||'(glb|gltf|obj)$')
    or coalesce(o->>'modelFormat','') not in ('glb','gltf','obj')
    or coalesce(o->>'upAxis','y') not in ('y','z')))
  or (o->>'type'<>'custom' and (o ? 'modelPath' or o ? 'modelFormat'))
  then raise exception 'PARK_INVALID'; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(content->'obstacles'))<>jsonb_array_length(content->'obstacles') then raise exception 'PARK_INVALID'; end if;

 a:=content->'aerial';
 if a is not null and jsonb_typeof(a)<>'null' then
  if jsonb_typeof(a)<>'object'
  or coalesce(a->>'path','') !~ (asset_re||'(webp|jpe?g|png)$')
  or not private.park_num(a->'width',5,400) or not private.park_num(a->'aspect',0.1,10)
  or not private.park_num(a->'rotation',-360,360)
  or not private.park_num(a->'offsetX',-200,200) or not private.park_num(a->'offsetZ',-200,200)
  or not private.park_num(a->'opacity',0.1,1)
  or a->'rightsConfirmed' is distinct from 'true'::jsonb
  or (a ? 'attribution' and (jsonb_typeof(a->'attribution')<>'string' or length(a->>'attribution')>200))
  then raise exception 'PARK_INVALID'; end if;
 end if;

 -- Untergrund: amtliches Höhenraster oder hochgeladenes Park-Modell.
 g:=content->'ground';
 if g is not null and jsonb_typeof(g)<>'null' then
  if jsonb_typeof(g)<>'object' then raise exception 'PARK_INVALID'; end if;
  if g->>'kind'='terrain' then
   if coalesce(g->>'path','') !~ (asset_re||'bin$')
   or jsonb_typeof(g->'cols')<>'number' or jsonb_typeof(g->'rows')<>'number'
   or (g->>'cols')::numeric not between 2 and 512 or (g->>'rows')::numeric not between 2 and 512
   or not private.park_num(g->'width',10,300) or not private.park_num(g->'length',10,300)
   or not private.park_num(g->'minHeight',-100,100) or not private.park_num(g->'maxHeight',-100,100)
   or coalesce(jsonb_typeof(g->'attribution'),'')<>'string' or length(g->>'attribution') not between 1 and 200
   or (g ? 'stand' and jsonb_typeof(g->'stand') not in ('string','null'))
   then raise exception 'PARK_INVALID'; end if;
  elsif g->>'kind'='model' then
   if coalesce(g->>'path','') !~ (asset_re||'(glb|gltf|obj)$')
   or coalesce(g->>'format','') not in ('glb','gltf','obj')
   or coalesce(g->>'upAxis','y') not in ('y','z')
   or not private.park_num(g->'scale',0.0001,1000)
   or not private.park_num(g->'rotation',-360,360)
   or not private.park_num(g->'offsetX',-200,200) or not private.park_num(g->'offsetY',-50,50) or not private.park_num(g->'offsetZ',-200,200)
   then raise exception 'PARK_INVALID'; end if;
  else raise exception 'PARK_INVALID'; end if;
 end if;

 -- Georeferenz des Parkmittelpunkts (nur bei amtlichen Daten gesetzt).
 geo:=content->'geo';
 if geo is not null and jsonb_typeof(geo)<>'null' then
  if jsonb_typeof(geo)<>'object' or coalesce(geo->>'state','') not in ('BY','SN')
  or not private.park_num(geo->'lat',47,56) or not private.park_num(geo->'lon',5,16)
  or not private.park_num(geo->'x',100000,900000) or not private.park_num(geo->'y',5000000,6200000)
  then raise exception 'PARK_INVALID'; end if;
 end if;
end; $$;
revoke all on function private.park_validate_content(jsonb) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Dateien anderer Bearbeiter dürfen nur unverändert aus der Vorversion übernommen
-- werden; neue Dateien müssen aus dem eigenen Speicherordner stammen.
-- ---------------------------------------------------------------------------

create function private.park_asset_paths(content jsonb) returns setof text
language sql immutable set search_path='' as $$
 select content->'aerial'->>'path' where content->'aerial'->>'path' is not null
 union select content->'ground'->>'path' where content->'ground'->>'path' is not null
 union select o->>'modelPath' from jsonb_array_elements(coalesce(content->'obstacles','[]'::jsonb)) o where o->>'modelPath' is not null;
$$;

create function private.park_guard_version_assets() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 if auth.uid() is null then return new; end if;
 select v.content into previous from public.skatepark_versions v
  where v.park_id=new.park_id and v.version_number=new.version_number-1;
 if exists(
  select 1 from private.park_asset_paths(new.content) p
  where split_part(p,'/',1)<>auth.uid()::text
    and (previous is null or p not in (select private.park_asset_paths(previous)))
 ) then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
 return new;
end; $$;
create trigger skatepark_versions_asset_guard before insert on public.skatepark_versions
for each row execute function private.park_guard_version_assets();

revoke all on function private.park_asset_paths(jsonb),private.park_guard_version_assets() from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Speicher für 3D-Modelle und Höhenraster: privat, für aktive Nutzer lesbar
-- (Parks sind öffentlich), Upload nur in den eigenen Ordner.
-- ---------------------------------------------------------------------------

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('skatepark-models','skatepark-models',false,26214400,
 array['model/gltf-binary','model/gltf+json','model/obj','application/octet-stream'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy skatepark_models_read_active on storage.objects for select to authenticated
 using(bucket_id='skatepark-models' and private.current_account_is_active());
create policy skatepark_models_insert_own on storage.objects for insert to authenticated
 with check(bucket_id='skatepark-models' and private.current_account_is_active()
  and owner_id=(select auth.uid())::text
  and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(glb|gltf|obj|bin)$'));
