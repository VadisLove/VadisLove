-- Trainingspläne mit anderen Trainer*innen teilen (Review 08.09., Nachtrag 30.09.2026, Punkt 8).
--
-- Regeln (vom Nutzer am 30.09.2026 entschieden)
--   * Alle Trainer*innen und Vorstands-/Verbandskonten (auch Bundestrainer)
--     können eigene Pläne mit allen Trainer*innen teilen – vereins- und
--     verbandsübergreifend. Auswahl: Suche nach Name/Verein oder „alle
--     Trainer*innen meines Vereins“. Höchstens 50 Personen bzw. 10 Vereine je
--     Vorgang, insgesamt höchstens 200 Empfänger.
--   * Ein geteilter Plan ist zunächst nur ein Vorschlag: Die empfangende
--     Person nimmt ihn an oder lehnt ihn ab. Erst beim Annehmen entsteht ein
--     eigener Plan (Entwurf) mit neuer ID, der frei bearbeitbar ist.
--   * Geteilt wird nur der Planinhalt (Titel, Kategorie, Niveau, Beschreibung,
--     Ziele, Tricks/Lines mit Zielwert und Hinweis). Athlet*innen, Gruppen,
--     Frist, Fortschritt, Nachweis- und Demovideos werden nie übernommen.
--   * Der Ersteller sieht nicht, wer den Plan annimmt oder ablehnt: Zeilen
--     existieren nur, solange der Vorschlag offen ist, und sind ausschließlich
--     über RPCs der empfangenden Person lesbar. Die angenommene Kopie hat
--     keinen Verweis auf Vorlage oder Ersteller.
--   * Keine Versionsverwaltung: Erneutes Teilen ersetzt einen noch offenen
--     Vorschlag desselben Plans; nach Annahme/Ablehnung entsteht ein neuer.
--   * Archivierte Pläne dürfen geteilt werden, Pläne im Papierkorb nicht.
--
-- Rein additiv: eine neue Tabelle und neue Funktionen. Bestehende Tabellen
-- und Funktionen bleiben unverändert.

/* ------------------------------------------------------------------ */
/* Tabelle: offene Vorschläge                                           */
/* ------------------------------------------------------------------ */

create table public.training_plan_trainer_shares (
 id uuid primary key default gen_random_uuid(),
 -- Ursprungsplan nur für „erneut teilen ersetzt den offenen Vorschlag“.
 -- Wird der Plan endgültig gelöscht, bleibt der Vorschlag (eigene Kopie) offen.
 source_plan_id uuid references public.training_plans(id) on delete set null,
 shared_by uuid not null references public.profiles(id) on delete cascade,
 recipient_user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null,
 plan_snapshot jsonb not null,
 created_at timestamptz not null default now(),
 constraint training_plan_trainer_shares_title check (char_length(btrim(title)) between 1 and 160),
 constraint training_plan_trainer_shares_snapshot check (
  jsonb_typeof(plan_snapshot)='object' and octet_length(plan_snapshot::text)<=262144),
 constraint training_plan_trainer_shares_not_self check (recipient_user_id<>shared_by),
 constraint training_plan_trainer_shares_once unique (source_plan_id, recipient_user_id)
);
create index training_plan_trainer_shares_recipient
 on public.training_plan_trainer_shares(recipient_user_id, created_at desc);
create index training_plan_trainer_shares_sender
 on public.training_plan_trainer_shares(shared_by, created_at desc);

-- Kein direkter Tabellenzugriff: Lesen, Annehmen und Ablehnen laufen nur über
-- die Funktionen unten (RLS aktiv, bewusst ohne Policies).
alter table public.training_plan_trainer_shares enable row level security;
revoke all on table public.training_plan_trainer_shares from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* Helfer                                                               */
/* ------------------------------------------------------------------ */

-- Darf teilen und empfangen: Trainerkonto/-rolle oder Vorstand/Verband.
create function private.training_share_person_ok(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select target is not null
  and (private.is_trainer_profile(target) or private.training_is_board(target))
  and private.account_is_active(target);
$$;

-- Vereine der angemeldeten Person (beliebige Mitgliedsrolle).
create function private.training_share_own_clubs() returns setof uuid
language sql stable security definer set search_path='' as $$
 select distinct o.id from public.organizations o
 join public.organization_memberships m on m.organization_id=o.id
 where o.level::text='club' and m.user_id=auth.uid();
$$;

-- Mögliche Empfänger*innen eines Vereins (ohne die angemeldete Person).
create function private.training_share_club_trainers(p_club uuid) returns setof uuid
language sql stable security definer set search_path='' as $$
 select distinct m.user_id from public.organization_memberships m
 where m.organization_id=p_club and m.user_id<>auth.uid()
  and private.training_share_person_ok(m.user_id);
$$;

-- Anzeigename der Organisation einer Person (Verein bevorzugt).
create function private.training_share_org_label(target uuid) returns text
language sql stable security definer set search_path='' as $$
 select o.name from public.organization_memberships m
 join public.organizations o on o.id=m.organization_id
 where m.user_id=target
 order by (o.level::text='club') desc, o.name limit 1;
$$;

-- Nur Planinhalt übernehmen (Positivliste). Personenbezogene Felder und
-- Fortschritt fallen weg; Tricks starten wieder bei „nicht begonnen“.
create function private.training_share_content(c jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'title', btrim(c->>'title'),
  'category', coalesce(c->>'category',''),
  'description', coalesce(c->>'description',''),
  'goals', coalesce((
   select jsonb_agg(jsonb_build_object(
    'id', g->>'id', 'title', g->>'title', 'cadence', coalesce(g->>'cadence','weekly'), 'completed', false))
   from jsonb_array_elements(case when jsonb_typeof(c->'goals')='array' then c->'goals' else '[]'::jsonb end) g
   where jsonb_typeof(g)='object' and jsonb_typeof(g->'id')='string' and jsonb_typeof(g->'title')='string'
  ),'[]'::jsonb),
  'tricks', coalesce((
   select jsonb_agg(
    coalesce((select jsonb_object_agg(k,v) from jsonb_each(t) e(k,v)
     where k in ('id','name','group','level','targetType','targetValue','trainerNote','sortOrder',
                 'equipment','type','trickIds','trickNames')),'{}'::jsonb)
    || jsonb_build_object('athleteId','','status','not_started')
    order by ord)
   from jsonb_array_elements(c->'tricks') with ordinality x(t,ord)
   where jsonb_typeof(t)='object'
  ),'[]'::jsonb)
 ) || case when jsonb_typeof(c->'level')='string' then jsonb_build_object('level',c->'level') else '{}'::jsonb end;
$$;

/* ------------------------------------------------------------------ */
/* Empfänger suchen                                                     */
/* ------------------------------------------------------------------ */

-- Liefert eigene Vereine (mit Anzahl möglicher Empfänger) und – ab zwei
-- Zeichen – höchstens 20 Trainer*innen, deren Name oder Organisation passt.
-- Herausgegeben werden nur Name und Organisationsname.
create function private.training_share_targets(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_query text:=btrim(coalesce(p_query,'')); v_pattern text;
begin
 if v_actor is null or not private.current_account_is_active() or not private.training_share_person_ok(v_actor) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 if length(v_query)>80 then raise exception 'TRAINING_INVALID'; end if;
 v_pattern:='%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%';
 return jsonb_build_object(
  'clubs', coalesce((
   select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,
    'count',(select count(*) from private.training_share_club_trainers(o.id))) order by o.name)
   from public.organizations o where o.id in (select private.training_share_own_clubs())
  ),'[]'::jsonb),
  'people', case when length(v_query)<2 then '[]'::jsonb else coalesce((
   select jsonb_agg(jsonb_build_object('id',x.id,'name',x.display_name,'organization',x.label) order by x.display_name)
   from (
    select p.id, p.display_name, private.training_share_org_label(p.id) label
    from public.profiles p
    where p.id<>v_actor
     and (p.display_name ilike v_pattern or exists(
      select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
      where m.user_id=p.id and o.name ilike v_pattern))
     and private.training_share_person_ok(p.id)
    order by p.display_name limit 20
   ) x
  ),'[]'::jsonb) end
 );
end; $$;

/* ------------------------------------------------------------------ */
/* Teilen                                                               */
/* ------------------------------------------------------------------ */

create function private.training_share_plan_with_trainers(p_plan uuid, p_recipients uuid[] default '{}', p_clubs uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_content jsonb; v_title text; v_name text; v_person uuid; v_club uuid;
 v_targets uuid[]:='{}';
begin
 if v_actor is null or not private.current_account_is_active() or not private.training_share_person_ok(v_actor) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 if coalesce(cardinality(p_recipients),0)>50 or coalesce(cardinality(p_clubs),0)>10 then
  raise exception 'TRAINING_INVALID'; end if;
 -- Nur eigene persönliche Pläne; archiviert ja, Papierkorb nein.
 if not exists(select 1 from public.training_plans where id=p_plan and created_by=v_actor
  and organization_id is null and deleted_at is null) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 select private.training_share_content(v.content) into v_content from public.training_plan_versions v
 where v.training_plan_id=p_plan order by v.version_number desc limit 1;
 perform private.training_validate_plan(v_content);
 v_title:=v_content->>'title';

 foreach v_person in array coalesce(p_recipients,'{}'::uuid[]) loop
  if v_person=v_actor or not private.training_share_person_ok(v_person) then
   raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  v_targets:=v_targets||v_person;
 end loop;
 foreach v_club in array coalesce(p_clubs,'{}'::uuid[]) loop
  if v_club not in (select private.training_share_own_clubs()) then
   raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  v_targets:=v_targets||array(select private.training_share_club_trainers(v_club));
 end loop;
 select coalesce(array_agg(distinct t),'{}') into v_targets from unnest(v_targets) t;
 if cardinality(v_targets)=0 then raise exception 'TRAINING_INVALID'; end if;
 if cardinality(v_targets)>200 then raise exception 'TRAINING_TOO_MANY' using errcode='22023'; end if;

 -- Schutz vor Massenversand: höchstens 500 Vorschläge je Person und Tag.
 if (select count(*) from public.training_plan_trainer_shares
  where shared_by=v_actor and created_at>now()-interval '1 day')+cardinality(v_targets)>500 then
  raise exception 'TRAINING_RATE_LIMIT' using errcode='22023'; end if;

 -- Offener Vorschlag desselben Plans wird durch die neue Fassung ersetzt.
 insert into public.training_plan_trainer_shares(source_plan_id,shared_by,recipient_user_id,title,plan_snapshot)
 select p_plan,v_actor,t,v_title,v_content from unnest(v_targets) t
 on conflict (source_plan_id,recipient_user_id)
 do update set title=excluded.title,plan_snapshot=excluded.plan_snapshot,created_at=now();

 select display_name into v_name from public.profiles where id=v_actor;
 insert into public.notifications(user_id,actor_user_id,type,title,message,link)
 select t,v_actor,'training_plan_shared'::public.notification_type,'Plan geteilt',
  left(coalesce(v_name,'Jemand')||' hat „'||v_title||'“ mit dir geteilt.',500),'/trainingsplaene?geteilt=1'
 from unnest(v_targets) t
 left join public.notification_preferences pref on pref.user_id=t
 where coalesce(pref.training_plans,true);

 return jsonb_build_object('shared',cardinality(v_targets));
end; $$;

/* ------------------------------------------------------------------ */
/* Empfangen: ansehen, annehmen, ablehnen                               */
/* ------------------------------------------------------------------ */

-- Offene geteilte Pläne der angemeldeten Person (neueste zuerst).
create function private.training_shared_plans() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'title',s.title,'shared_at',s.created_at,
  'sender_name',p.display_name,'sender_organization',private.training_share_org_label(s.shared_by),
  'content',s.plan_snapshot) order by s.created_at desc),'[]'::jsonb)
 from public.training_plan_trainer_shares s
 join public.profiles p on p.id=s.shared_by
 where s.recipient_user_id=auth.uid() and private.current_account_is_active();
$$;

-- Legt einen eigenen Plan (Entwurf, Version 1) an und entfernt den Vorschlag.
create function private.training_accept_shared_plan(p_share uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_share public.training_plan_trainer_shares%rowtype;
 v_plan uuid:=gen_random_uuid(); v_content jsonb; v_name text;
begin
 if v_actor is null or not private.current_account_is_active() or not private.training_share_person_ok(v_actor) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 select * into v_share from public.training_plan_trainer_shares
 where id=p_share and recipient_user_id=v_actor for update;
 if not found then raise exception 'TRAINING_NOT_FOUND' using errcode='P0002'; end if;
 select display_name into v_name from public.profiles where id=v_actor;
 -- Erneut bereinigen, damit auch ältere Vorschläge nur Planinhalt enthalten.
 v_content:=private.training_share_content(v_share.plan_snapshot) || jsonb_build_object(
  'id',v_plan,'version','1','author',coalesce(v_name,''),'ownerLevel','club','sharedWith','[]'::jsonb,
  'updatedAt',now(),'status','draft','visibility','private','isTemplate',false,
  'assignedGroups','[]'::jsonb,'assignedAthletes','[]'::jsonb,'sharedTrainers','[]'::jsonb);
 perform private.training_validate_plan(v_content);
 insert into public.training_plans(id,organization_id,created_by,title,category)
 values(v_plan,null,v_actor,v_content->>'title',coalesce(v_content->>'category',''));
 insert into public.training_plan_versions(training_plan_id,version_number,content,created_by)
 values(v_plan,1,v_content,v_actor);
 delete from public.training_plan_trainer_shares where id=v_share.id;
 return v_plan;
end; $$;

create function private.training_decline_shared_plan(p_share uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.current_account_is_active() then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 delete from public.training_plan_trainer_shares where id=p_share and recipient_user_id=auth.uid();
 if not found then raise exception 'TRAINING_NOT_FOUND' using errcode='P0002'; end if;
 return true;
end; $$;

/* ------------------------------------------------------------------ */
/* Öffentliche Wrapper und Rechte                                       */
/* ------------------------------------------------------------------ */

create function public.training_share_targets(p_query text default '') returns jsonb
language sql stable security invoker set search_path='' as $$ select private.training_share_targets(p_query); $$;
create function public.training_share_plan_with_trainers(p_plan uuid, p_recipients uuid[] default '{}', p_clubs uuid[] default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select private.training_share_plan_with_trainers(p_plan,p_recipients,p_clubs); $$;
create function public.training_shared_plans() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.training_shared_plans(); $$;
create function public.training_accept_shared_plan(p_share uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.training_accept_shared_plan(p_share); $$;
create function public.training_decline_shared_plan(p_share uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.training_decline_shared_plan(p_share); $$;

revoke all on function
 private.training_share_person_ok(uuid), private.training_share_own_clubs(),
 private.training_share_club_trainers(uuid), private.training_share_org_label(uuid),
 private.training_share_content(jsonb), private.training_share_targets(text),
 private.training_share_plan_with_trainers(uuid,uuid[],uuid[]), private.training_shared_plans(),
 private.training_accept_shared_plan(uuid), private.training_decline_shared_plan(uuid),
 public.training_share_targets(text), public.training_share_plan_with_trainers(uuid,uuid[],uuid[]),
 public.training_shared_plans(), public.training_accept_shared_plan(uuid), public.training_decline_shared_plan(uuid)
from public, anon, authenticated;

grant execute on function
 private.training_share_targets(text), private.training_share_plan_with_trainers(uuid,uuid[],uuid[]),
 private.training_shared_plans(), private.training_accept_shared_plan(uuid), private.training_decline_shared_plan(uuid),
 public.training_share_targets(text), public.training_share_plan_with_trainers(uuid,uuid[],uuid[]),
 public.training_shared_plans(), public.training_accept_shared_plan(uuid), public.training_decline_shared_plan(uuid)
to authenticated;

select pg_notify('pgrst', 'reload schema');
