-- Trainingspläne (Handoff v3, restliche Lücken): Erstellrecht pro Athlet,
-- Rolle Vorstand, Zuweisung an Gruppen/Verein, Vereinsvorlagen, Anrede,
-- Teilen mit dem Trainer, Sichtbarkeit von Rückblick-Notizen und direktes
-- Bestätigen aus dem Session-Rückblick.
--
-- Rein additiv: neue Spalten mit Standardwerten, neue Tabellen und neue
-- Funktionen. Bestehende Funktionen werden nur dort ersetzt, wo sie um einen
-- Filter bzw. ein Feld ergänzt werden (Benachrichtigung, Rückblick-Projektion);
-- ihr bisheriges Verhalten bleibt unverändert erhalten.

/* ------------------------------------------------------------------ */
/* Rollen-Helfer                                                        */
/* ------------------------------------------------------------------ */

-- Vorstand/Verband: Organisationskonto oder leitende Vereins-/Verbandsrolle.
create function private.training_is_board(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select target is not null and (
  exists(select 1 from public.profiles where id=target and account_type::text='organization_staff')
  or exists(select 1 from public.organization_memberships m where m.user_id=target
   and m.role::text in ('club_board','federal_chair','specialist'))
 );
$$;

-- Vereine, die die angemeldete Person als Vorstand/Verband verwaltet.
create function private.training_board_clubs() returns setof uuid
language sql stable security definer set search_path='' as $$
 select o.id from public.organizations o
 where o.level::text='club' and private.can_manage_organization(o.id);
$$;

-- Athlet*innen dieser Vereine (Mitgliedsrolle „athlete“).
create function private.training_board_athletes() returns setof uuid
language sql stable security definer set search_path='' as $$
 select distinct m.user_id from public.organization_memberships m
 where m.role::text='athlete' and m.organization_id in (select private.training_board_clubs());
$$;

-- Aktive Beziehung ohne auth.uid()-Bindung, nur für Trigger (neue Mitglieder).
create function private.training_connected(first_user uuid, second_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.relationships r where r.active
  and r.user_one_id=least(first_user,second_user) and r.user_two_id=greatest(first_user,second_user));
$$;

-- Trainer*in (aktive Beziehung) oder Vorstand des Vereins der Athletin/des Athleten.
create function private.training_can_manage_athlete(athlete uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_account_is_active() and athlete<>auth.uid() and (
  private.has_active_trainer_athlete_relationship(auth.uid(),athlete)
  or athlete in (select private.training_board_athletes())
 );
$$;

/* ------------------------------------------------------------------ */
/* 1. Erstellrecht pro Athlet                                           */
/* ------------------------------------------------------------------ */

create table public.athlete_plan_permissions (
 athlete_id uuid primary key references public.profiles(id) on delete cascade,
 can_create_plans boolean not null default false,
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
create index athlete_plan_permissions_updated_by on public.athlete_plan_permissions(updated_by);
alter table public.athlete_plan_permissions enable row level security;
revoke all on public.athlete_plan_permissions from public,anon,authenticated;
grant select on public.athlete_plan_permissions to authenticated;
-- Lesen: die Person selbst sowie ihre Trainer*innen bzw. der Vorstand.
-- Schreiben ausschließlich über training_set_plan_permission (kein Grant).
create policy athlete_plan_permissions_read on public.athlete_plan_permissions for select to authenticated
using ((select private.current_account_is_active())
 and (athlete_id=(select auth.uid()) or private.training_can_manage_athlete(athlete_id)));

create function private.training_athlete_can_create(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.profiles where id=target and account_type::text='athlete')
  or coalesce((select can_create_plans from public.athlete_plan_permissions where athlete_id=target),false);
$$;

create function private.training_set_plan_permission(p_athlete uuid, p_allowed boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not private.current_account_is_active() or p_allowed is null
 or not (private.is_trainer_profile(v_actor) or private.training_is_board(v_actor))
 or not private.training_can_manage_athlete(p_athlete)
 or not exists(select 1 from public.profiles where id=p_athlete and account_type::text='athlete') then
  raise exception 'PLAN_PERMISSION_FORBIDDEN' using errcode='42501';
 end if;
 insert into public.athlete_plan_permissions(athlete_id,can_create_plans,updated_by,updated_at)
 values(p_athlete,p_allowed,v_actor,now())
 on conflict(athlete_id) do update set can_create_plans=excluded.can_create_plans,
  updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 return p_allowed;
end; $$;

-- Serverseitige Durchsetzung: Neue Pläne von Athlet*innen ohne Recht werden
-- abgelehnt – unabhängig davon, ob der Aufruf aus der App oder direkt kommt.
-- Bereits vorhandene Pläne bleiben bearbeitbar.
create function private.training_guard_plan_create() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not private.training_athlete_can_create(auth.uid()) then
  raise exception 'TRAINING_PLAN_CREATE_FORBIDDEN' using errcode='42501';
 end if;
 return new;
end; $$;
create trigger training_plans_guard_create before insert on public.training_plans
for each row execute function private.training_guard_plan_create();

/* ------------------------------------------------------------------ */
/* 4. Anrede (m/w/d)                                                    */
/* ------------------------------------------------------------------ */

alter table public.profiles add column salutation text
 check (salutation is null or salutation in ('m','w','d'));

-- Die Registrierung übergibt die Anrede als Metadatum; ungültige Werte
-- werden ignoriert, damit die Registrierung nie daran scheitert.
create function private.profile_salutation_from_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare v text;
begin
 if new.salutation is null then
  select u.raw_user_meta_data->>'salutation' into v from auth.users u where u.id=new.id;
  if v in ('m','w','d') then new.salutation:=v; end if;
 end if;
 return new;
end; $$;
create trigger profiles_salutation_from_signup before insert on public.profiles
for each row execute function private.profile_salutation_from_signup();

/* ------------------------------------------------------------------ */
/* 3. Mit dem Trainer teilen (Skater)                                   */
/* ------------------------------------------------------------------ */

-- Eine Freigabe an sich selbst mit diesem Flag macht den eigenen Plan für
-- die aktiven Trainer*innen sichtbar; Fortschritt, Meldungen und Bestätigung
-- laufen über die vorhandenen Regeln (Athlet = Empfänger).
alter table public.training_plan_snapshot_shares
 add column shared_with_trainers boolean not null default false;
create policy training_plan_snapshot_shares_read_coach on public.training_plan_snapshot_shares
for select to authenticated using (
 shared_with_trainers and recipient_user_id=shared_by
 and (select private.has_active_trainer_athlete_relationship((select auth.uid()),recipient_user_id))
);

create function private.training_share_own_plan(p_plan jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_plan uuid; v_share uuid;
begin
 if v_actor is null or not private.current_account_is_active() then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 perform private.training_validate_plan(p_plan);
 v_plan:=(p_plan->>'id')::uuid;
 if not exists(select 1 from public.training_plans where id=v_plan and created_by=v_actor and organization_id is null) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 select id into v_share from public.training_plan_snapshot_shares
 where shared_by=v_actor and recipient_user_id=v_actor and shared_with_trainers
  and plan_snapshot->>'id'=v_plan::text limit 1;
 if v_share is not null then return v_share; end if;
 insert into public.training_plan_snapshot_shares(shared_by,target_type,recipient_user_id,title,plan_snapshot,shared_with_trainers)
 values(v_actor,'person',v_actor,btrim(p_plan->>'title'),p_plan,true) returning id into v_share;
 return v_share;
end; $$;

-- Benachrichtigung wie bisher; eine geteilte Eigenfreigabe benachrichtigt
-- statt der Person selbst ihre aktiven Trainer*innen.
create or replace function private.notify_training_plan_snapshot_share()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  actor_name text;
begin
  select display_name into actor_name
  from public.profiles
  where id = new.shared_by;

  insert into public.notifications (
    user_id, actor_user_id, type, title, message, link
  )
  select distinct
    recipient.user_id,
    new.shared_by,
    'training_plan_shared'::public.notification_type,
    'Trainingsplan geteilt',
    actor_name || ' hat „' || new.title || '“ mit dir geteilt.',
    '/trainingsplaene'
  from (
    select new.recipient_user_id as user_id
    where new.target_type = 'person'
      and new.recipient_user_id is distinct from new.shared_by

    union

    select membership.user_id
    from public.group_memberships membership
    where new.target_type = 'group'
      and membership.group_id = new.group_id
      and membership.user_id <> new.shared_by

    union

    select case when relationship.user_one_id = new.shared_by
      then relationship.user_two_id else relationship.user_one_id end
    from public.relationships relationship
    where new.shared_with_trainers
      and new.recipient_user_id = new.shared_by
      and relationship.active
      and relationship.relationship_type = 'trainer_athlete'
      and new.shared_by in (relationship.user_one_id, relationship.user_two_id)
      and private.is_trainer_profile(case when relationship.user_one_id = new.shared_by
        then relationship.user_two_id else relationship.user_one_id end)
  ) recipient
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
  where recipient.user_id is not null
    and coalesce(preference.training_plans, true);

  return new;
end;
$$;

/* ------------------------------------------------------------------ */
/* 2./3. Zuweisung an Gruppen und „Alle Gruppen im Verein“              */
/* ------------------------------------------------------------------ */

-- Merkt sich die Gruppen-/Vereinszuweisung samt Planstand. Neue Mitglieder
-- erhalten per Trigger eine persönliche Freigabe dieses Stands; der
-- Fortschritt bleibt dadurch pro Person wie bisher.
create table public.training_plan_group_assignments (
 id uuid primary key default gen_random_uuid(),
 source_plan_id uuid not null references public.training_plans(id) on delete cascade,
 group_id uuid references public.social_groups(id) on delete cascade,
 organization_id uuid references public.organizations(id) on delete cascade,
 assigned_by uuid not null references public.profiles(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 160),
 plan_snapshot jsonb not null check(jsonb_typeof(plan_snapshot)='object' and octet_length(plan_snapshot::text)<=262144),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((group_id is null)<>(organization_id is null))
);
create unique index training_plan_group_assignments_group on public.training_plan_group_assignments(source_plan_id,group_id) where group_id is not null;
create unique index training_plan_group_assignments_org on public.training_plan_group_assignments(source_plan_id,organization_id) where organization_id is not null;
create index training_plan_group_assignments_group_lookup on public.training_plan_group_assignments(group_id) where group_id is not null;
create index training_plan_group_assignments_org_lookup on public.training_plan_group_assignments(organization_id) where organization_id is not null;
create index training_plan_group_assignments_assigned_by on public.training_plan_group_assignments(assigned_by);
alter table public.training_plan_group_assignments enable row level security;
revoke all on public.training_plan_group_assignments from public,anon,authenticated;
grant select on public.training_plan_group_assignments to authenticated;
create policy training_plan_group_assignments_read on public.training_plan_group_assignments for select to authenticated
using ((select private.current_account_is_active()) and assigned_by=(select auth.uid()));

-- Eine persönliche Freigabe je Person und Ursprungsplan und Absender.
create function private.training_share_to(p_actor uuid, p_athlete uuid, p_plan jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_athlete is null or p_athlete=p_actor
 or not exists(select 1 from public.profiles where id=p_athlete and account_type::text='athlete')
 or exists(select 1 from public.training_plan_snapshot_shares where shared_by=p_actor
  and recipient_user_id=p_athlete and plan_snapshot->>'id'=p_plan->>'id') then
  return false;
 end if;
 insert into public.training_plan_snapshot_shares(shared_by,target_type,recipient_user_id,title,plan_snapshot)
 values(p_actor,'person',p_athlete,btrim(p_plan->>'title'),p_plan);
 return true;
end; $$;

create function private.training_assign_plan(p_plan jsonb, p_athletes uuid[], p_groups uuid[], p_club boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_plan uuid; v_board boolean; v_person uuid; v_group uuid; v_org uuid;
 v_count integer:=0; v_board_athletes uuid[];
begin
 if v_actor is null or not private.current_account_is_active()
 or not (private.is_trainer_profile(v_actor) or private.training_is_board(v_actor)) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 perform private.training_validate_plan(p_plan);
 v_plan:=(p_plan->>'id')::uuid;
 if not exists(select 1 from public.training_plans where id=v_plan and created_by=v_actor and organization_id is null) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 if coalesce(cardinality(p_athletes),0)>200 or coalesce(cardinality(p_groups),0)>50 then
  raise exception 'TRAINING_INVALID'; end if;
 v_board:=private.training_is_board(v_actor);
 select coalesce(array_agg(x),'{}') into v_board_athletes from private.training_board_athletes() x;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||v_plan::text,3));

 -- Einzelne Athlet*innen: bestätigte Verbindung oder Vorstand des Vereins.
 foreach v_person in array coalesce(p_athletes,'{}'::uuid[]) loop
  if not (private.are_connected(v_actor,v_person) or v_person=any(v_board_athletes)) then
   raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  if private.training_share_to(v_actor,v_person,p_plan) then v_count:=v_count+1; end if;
 end loop;

 -- Gruppen: nur verwaltete Gruppen; Mitglieder ohne Verbindung werden übersprungen.
 foreach v_group in array coalesce(p_groups,'{}'::uuid[]) loop
  if not private.can_manage_group(v_group) then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  insert into public.training_plan_group_assignments(source_plan_id,group_id,assigned_by,title,plan_snapshot)
  values(v_plan,v_group,v_actor,btrim(p_plan->>'title'),p_plan)
  on conflict(source_plan_id,group_id) where group_id is not null
  do update set plan_snapshot=excluded.plan_snapshot,title=excluded.title,updated_at=now();
  for v_person in select m.user_id from public.group_memberships m where m.group_id=v_group loop
   if (private.are_connected(v_actor,v_person) or v_person=any(v_board_athletes))
   and private.training_share_to(v_actor,v_person,p_plan) then v_count:=v_count+1; end if;
  end loop;
 end loop;

 -- „Alle Gruppen im Verein“: nur Vorstand, alle Athlet*innen der verwalteten Vereine.
 if coalesce(p_club,false) then
  if not v_board or not exists(select 1 from private.training_board_clubs()) then
   raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  for v_org in select private.training_board_clubs() loop
   insert into public.training_plan_group_assignments(source_plan_id,organization_id,assigned_by,title,plan_snapshot)
   values(v_plan,v_org,v_actor,btrim(p_plan->>'title'),p_plan)
   on conflict(source_plan_id,organization_id) where organization_id is not null
   do update set plan_snapshot=excluded.plan_snapshot,title=excluded.title,updated_at=now();
  end loop;
  foreach v_person in array v_board_athletes loop
   if private.training_share_to(v_actor,v_person,p_plan) then v_count:=v_count+1; end if;
  end loop;
 end if;
 return jsonb_build_object('shared',v_count);
end; $$;

-- Neue Gruppenmitglieder erben zugewiesene Pläne (nur mit aktiver Verbindung).
create function private.training_inherit_group_plans() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.training_plan_group_assignments%rowtype;
begin
 for a in select * from public.training_plan_group_assignments where group_id=new.group_id loop
  if private.training_connected(a.assigned_by,new.user_id) then
   perform private.training_share_to(a.assigned_by,new.user_id,a.plan_snapshot);
  end if;
 end loop;
 return new;
end; $$;
create trigger group_memberships_inherit_plans after insert on public.group_memberships
for each row execute function private.training_inherit_group_plans();

-- Neue Vereinsathlet*innen erben Vereinszuweisungen des Vorstands.
create function private.training_inherit_club_plans() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.training_plan_group_assignments%rowtype;
begin
 if new.role::text<>'athlete' then return new; end if;
 for a in select * from public.training_plan_group_assignments where organization_id=new.organization_id loop
  perform private.training_share_to(a.assigned_by,new.user_id,a.plan_snapshot);
 end loop;
 return new;
end; $$;
create trigger organization_memberships_inherit_plans after insert or update of role on public.organization_memberships
for each row execute function private.training_inherit_club_plans();

/* ------------------------------------------------------------------ */
/* 2. Vereinsvorlagen                                                   */
/* ------------------------------------------------------------------ */

alter table public.training_plans
 add column is_club_template boolean not null default false,
 add column template_organization_id uuid references public.organizations(id) on delete set null;
create index training_plans_club_template on public.training_plans(template_organization_id) where is_club_template;

create function private.training_set_club_template(p_plan uuid, p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_org uuid;
begin
 if v_actor is null or not private.current_account_is_active() or not private.training_is_board(v_actor)
 or not exists(select 1 from public.training_plans where id=p_plan and created_by=v_actor and organization_id is null) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 if coalesce(p_enabled,false) then
  -- Verein bevorzugt; Verbandskonten geben für ihre verwaltete Organisation frei.
  select o.id into v_org from public.organizations o
  where private.can_manage_organization(o.id)
  order by case o.level::text when 'club' then 0 when 'state' then 1 else 2 end, o.name limit 1;
  if v_org is null then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  update public.training_plans set is_club_template=true,template_organization_id=v_org where id=p_plan;
 else
  update public.training_plans set is_club_template=false,template_organization_id=null where id=p_plan;
 end if;
 return coalesce(p_enabled,false);
end; $$;

-- Vorlagen des eigenen Vereins bzw. übergeordneten Verbands (neueste Version).
create function private.training_club_templates() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'title',p.title,'organization_name',o.name,'author_name',pr.display_name,
  'own',p.created_by=auth.uid(),'content',v.content) order by p.updated_at desc),'[]'::jsonb)
 from public.training_plans p
 join public.organizations o on o.id=p.template_organization_id
 join public.profiles pr on pr.id=p.created_by
 join lateral (select content from public.training_plan_versions where training_plan_id=p.id
  order by version_number desc limit 1) v on true
 where p.is_club_template and private.current_account_is_active()
 and (private.is_trainer_profile(auth.uid()) or private.training_is_board(auth.uid()))
 and exists(select 1 from public.organization_memberships m
  join public.organizations mo on mo.id=m.organization_id
  where m.user_id=auth.uid() and (mo.id=o.id or mo.parent_id=o.id));
$$;

/* ------------------------------------------------------------------ */
/* Kontext für den Planbereich                                          */
/* ------------------------------------------------------------------ */

create function private.training_plan_hub_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_staff boolean; v_board boolean; v_people uuid[]; result jsonb;
begin
 if v_actor is null or not private.current_account_is_active() then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 v_board:=private.training_is_board(v_actor);
 v_staff:=v_board or private.is_trainer_profile(v_actor);
 if v_staff then
  select coalesce(array_agg(distinct x),'{}') into v_people from (
   select case when r.user_one_id=v_actor then r.user_two_id else r.user_one_id end x
   from public.relationships r where r.active and r.relationship_type='trainer_athlete'
    and v_actor in (r.user_one_id,r.user_two_id)
   union select private.training_board_athletes()
  ) people join public.profiles pr on pr.id=people.x and pr.account_type::text='athlete';
 else v_people:='{}'; end if;
 select jsonb_build_object(
  'is_board',v_board,
  'can_create_plans',private.training_athlete_can_create(v_actor),
  'salutation',(select salutation from public.profiles where id=v_actor),
  -- Anrede der Trainer*innen: nur bei einheitlicher Angabe, sonst neutral.
  'trainer_salutation',(select case when count(distinct coalesce(pr.salutation,'d'))=1 then min(coalesce(pr.salutation,'d')) else 'd' end
   from public.relationships r join public.profiles pr
    on pr.id=case when r.user_one_id=v_actor then r.user_two_id else r.user_one_id end
   where r.active and r.relationship_type='trainer_athlete' and v_actor in (r.user_one_id,r.user_two_id)
    and private.is_trainer_profile(pr.id)),
  'has_trainer',private.training_recap_has_trainer(v_actor),
  'athletes',coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'name',pr.display_name,
    'can_create_plans',coalesce(pp.can_create_plans,false)) order by pr.display_name)
   from public.profiles pr left join public.athlete_plan_permissions pp on pp.athlete_id=pr.id
   where pr.id=any(v_people)),'[]'::jsonb),
  'groups',case when v_staff then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,
    'athlete_ids',coalesce((select jsonb_agg(m.user_id order by m.joined_at) from public.group_memberships m
     where m.group_id=g.id and m.user_id=any(v_people)),'[]'::jsonb)) order by g.name)
   from public.social_groups g where private.can_manage_group(g.id)),'[]'::jsonb) else '[]'::jsonb end,
  'clubs',case when v_board then coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,
    'athlete_ids',coalesce((select jsonb_agg(distinct m.user_id) from public.organization_memberships m
     where m.organization_id=o.id and m.role::text='athlete'),'[]'::jsonb)) order by o.name)
   from public.organizations o where o.id in (select private.training_board_clubs())),'[]'::jsonb) else '[]'::jsonb end,
  'club_template_ids',coalesce((select jsonb_agg(id) from public.training_plans
   where created_by=v_actor and is_club_template),'[]'::jsonb),
  'group_assignments',coalesce((select jsonb_agg(jsonb_build_object('plan_id',a.source_plan_id,
    'group_id',a.group_id,'organization_id',a.organization_id))
   from public.training_plan_group_assignments a where a.assigned_by=v_actor),'[]'::jsonb),
  'templates',private.training_club_templates()
 ) into result;
 return result;
end; $$;

/* ------------------------------------------------------------------ */
/* 6. Sichtbarkeit von Rückblick-Notizen                                */
/* ------------------------------------------------------------------ */

alter table public.training_session_reviews
 add column visibility text not null default 'athlete'
 check (visibility in ('athlete','coaches') and (visibility='athlete' or kind in ('hint','goal')));

-- Wie training_recap_add_review, zusätzlich mit Sichtbarkeit. „Nur Trainer“
-- dürfen nur Trainer*innen für Hinweise und Ziele wählen.
create function private.training_recap_add_review(request_id uuid, participant uuid, exercise uuid,
 review_kind text, review_body text, replaces uuid, review_visibility text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.training_athletes%rowtype; p public.training_session_participants%rowtype;
 trainer boolean; old_review public.training_session_reviews%rowtype;
begin
 if auth.uid() is null or not private.current_account_is_active() then
  raise exception 'REVIEW_FORBIDDEN' using errcode='42501'; end if;
 select * into p from public.training_session_participants where id=participant for update;
 select * into a from public.training_athletes where id=p.athlete_id;
 if a.user_id is null or not private.training_recap_access(a.user_id)
 or not exists(select 1 from public.training_sessions where id=p.session_id and status='completed') then
  raise exception 'REVIEW_FORBIDDEN' using errcode='42501'; end if;
 trainer:=private.has_active_trainer_athlete_relationship(auth.uid(),a.user_id);
 if review_visibility is null or review_visibility not in ('athlete','coaches')
 or (review_visibility='coaches' and (not trainer or review_kind not in ('hint','goal'))) then
  raise exception 'REVIEW_INVALID'; end if;
 if exercise is not null and not exists(select 1 from public.training_session_exercises where id=exercise and session_id=p.session_id) then
  raise exception 'REVIEW_INVALID'; end if;
 if review_kind is null or review_kind not in ('hint','goal','request','confirmation')
 or review_body is null or length(btrim(review_body)) not between 1 and 4000
 or (review_kind in ('request','confirmation') and exercise is null) then raise exception 'REVIEW_INVALID'; end if;
 if not trainer and not (a.user_id=auth.uid() and (review_kind='request'
 or (review_kind='confirmation' and not private.training_recap_has_trainer(a.user_id)))) then
  raise exception 'REVIEW_FORBIDDEN' using errcode='42501'; end if;
 select * into old_review from public.training_session_reviews where id=request_id;
 if found then
  if old_review.author_id=auth.uid() and old_review.participant_id=participant
   and old_review.exercise_id is not distinct from exercise and old_review.kind=review_kind
   and old_review.body=btrim(review_body) and old_review.supersedes is not distinct from replaces
   and old_review.visibility=review_visibility then return request_id; end if;
  raise exception 'REVIEW_CONFLICT' using errcode='40001';
 end if;
 if replaces is not null then
  select * into old_review from public.training_session_reviews where id=replaces;
  if not found or old_review.participant_id<>participant or old_review.kind<>review_kind
   or old_review.exercise_id is distinct from exercise
   or exists(select 1 from public.training_session_reviews where supersedes=replaces) then
   raise exception 'REVIEW_CONFLICT' using errcode='40001'; end if;
 end if;
 if review_kind='confirmation' and not exists(select 1 from public.training_session_reviews
  where participant_id=participant and exercise_id=exercise and kind='request') then raise exception 'REVIEW_REQUEST_REQUIRED'; end if;
 insert into public.training_session_reviews(id,participant_id,exercise_id,kind,body,author_id,author_role,supersedes,visibility)
 values(request_id,participant,exercise,review_kind,btrim(review_body),auth.uid(),case when trainer then 'trainer' else 'self' end,replaces,review_visibility);
 return request_id;
end;
$$;

/* ------------------------------------------------------------------ */
/* 8. Park je Session (optional, Anzeige im Rückblick)                  */
/* ------------------------------------------------------------------ */

alter table public.training_sessions
 add column skatepark_id uuid references public.skateparks(id) on delete set null;
create index training_sessions_skatepark on public.training_sessions(skatepark_id) where skatepark_id is not null;

-- Rückblick-Projektion wie bisher, ergänzt um Park und Sichtbarkeit.
-- „Nur Trainer“-Notizen erhalten ausschließlich aktive Trainer*innen;
-- Athlet*innen und Eltern bekommen sie nie aus der Datenbank.
create or replace function private.training_recaps() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'participant_id',p.id,'athlete_id',a.id,'athlete_name',a.display_name,'athlete_user_id',a.user_id,
 'session_id',s.id,'title',case when s.mode='group' then 'Gruppentraining' else s.plan_snapshot->>'title' end,
 'park',(select k.name from public.skateparks k where k.id=s.skatepark_id),
 'mode',s.mode,'present',p.present,'started_at',s.started_at,'completed_at',s.completed_at,
 'is_self',a.user_id=auth.uid(),
 'can_review',private.has_active_trainer_athlete_relationship(auth.uid(),a.user_id),
 'can_confirm',private.has_active_trainer_athlete_relationship(auth.uid(),a.user_id)
  or (a.user_id=auth.uid() and not private.training_recap_has_trainer(a.user_id)),
 -- Allgemeine betreute Notizen bleiben für Trainer reserviert, auch im Einzeltraining.
 'note',case when s.mode='self' or private.training_can_session(s.id) then s.note else null end,
 'exercises',coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'skill_id',e.source_trick_id,'name',e.content->>'name','elapsed_ms',e.elapsed_ms,
  'note',case when s.mode='self' or private.training_can_session(s.id) then e.note else null end,
  'trainer_note',case when s.mode='self' or private.training_can_session(s.id) then e.content->>'trainerNote' else null end,
  'attempts',(select count(*) from public.training_session_attempts t where t.participant_id=p.id and t.exercise_id=e.id and t.undone_at is null),
  'landed',(select count(*) from public.training_session_attempts t where t.participant_id=p.id and t.exercise_id=e.id and t.undone_at is null and t.landed)
 ) order by e.sort_order) from public.training_session_exercises e where e.session_id=s.id),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'exercise_id',r.exercise_id,'kind',r.kind,'body',r.body,'author_name',pr.display_name,
  'author_role',r.author_role,'created_at',r.created_at,'supersedes',r.supersedes,'visibility',r.visibility
 ) order by r.created_at,r.id) from public.training_session_reviews r join public.profiles pr on pr.id=r.author_id
  where r.participant_id=p.id
  and (r.visibility='athlete' or private.has_active_trainer_athlete_relationship(auth.uid(),a.user_id))),'[]'::jsonb)
 ) order by s.completed_at desc,p.id),'[]'::jsonb)
 from public.training_session_participants p join public.training_athletes a on a.id=p.athlete_id
 join public.training_sessions s on s.id=p.session_id
 where s.status='completed' and private.training_recap_access(a.user_id);
$$;

/* ------------------------------------------------------------------ */
/* 7. Direkt bestätigen aus dem Session-Rückblick                       */
/* ------------------------------------------------------------------ */

alter table public.training_trick_progress
 add column confirmed_source text check (confirmed_source is null or confirmed_source in ('review','recap'));

-- Trainer*innen dürfen einen offenen oder geübten Trick ohne Meldung
-- bestätigen, wenn die gerundete Landequote seit p_since mindestens 80 % ist.
create function private.training_confirm_from_recap(p_snapshot_share_id uuid, p_trick_id text, p_since timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row public.training_trick_progress%rowtype; v_name text;
 v_attempts integer; v_landed integer;
begin
 if v_actor is null or not private.current_account_is_active() then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 select * into v_row from public.training_trick_progress
 where snapshot_share_id=p_snapshot_share_id and trick_id=p_trick_id for update;
 if not found or not private.has_active_trainer_athlete_relationship(v_actor,v_row.athlete_id) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 if v_row.status::text not in ('not_started','in_progress') then raise exception 'TRAINING_STATUS'; end if;
 select lower(btrim(t.value->>'name')) into v_name
 from public.training_plan_snapshot_shares s, jsonb_array_elements(s.plan_snapshot->'tricks') t(value)
 where s.id=p_snapshot_share_id and t.value->>'id'=p_trick_id;
 select count(*),count(*) filter(where t.landed) into v_attempts,v_landed
 from public.training_session_attempts t
 join public.training_session_exercises e on e.id=t.exercise_id
 join public.training_session_participants pa on pa.id=t.participant_id
 join public.training_athletes ta on ta.id=pa.athlete_id
 join public.training_sessions s on s.id=t.session_id
 where ta.user_id=v_row.athlete_id and t.undone_at is null and s.status='completed'
  and s.completed_at>=greatest(coalesce(p_since,now()-interval '30 days'),now()-interval '400 days')
  and lower(btrim(e.content->>'name'))=v_name;
 if v_name is null or v_attempts=0 or round(v_landed*100.0/v_attempts)<80 then
  raise exception 'TRAINING_QUOTE_TOO_LOW'; end if;
 update public.training_trick_progress set status='confirmed',confirmed_by=v_actor,confirmed_at=now(),
  confirmed_source='recap',updated_at=now() where id=v_row.id;
 return jsonb_build_object('athlete_user_id',v_row.athlete_id,'attempts',v_attempts,'landed',v_landed);
end; $$;

/* ------------------------------------------------------------------ */
/* Öffentliche Wrapper (ohne erhöhte Rechte) und Rechtevergabe          */
/* ------------------------------------------------------------------ */

create function public.training_set_plan_permission(p_athlete uuid, p_allowed boolean) returns boolean
language sql security invoker set search_path='' as $$ select private.training_set_plan_permission(p_athlete,p_allowed); $$;
create function public.training_share_own_plan(p_plan jsonb) returns uuid
language sql security invoker set search_path='' as $$ select private.training_share_own_plan(p_plan); $$;
create function public.training_assign_plan(p_plan jsonb, p_athletes uuid[] default '{}', p_groups uuid[] default '{}', p_club boolean default false) returns jsonb
language sql security invoker set search_path='' as $$ select private.training_assign_plan(p_plan,p_athletes,p_groups,p_club); $$;
create function public.training_set_club_template(p_plan uuid, p_enabled boolean) returns boolean
language sql security invoker set search_path='' as $$ select private.training_set_club_template(p_plan,p_enabled); $$;
create function public.training_plan_hub_context() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.training_plan_hub_context(); $$;
create function public.training_recap_add_review(request_id uuid, participant uuid, exercise uuid,
 review_kind text, review_body text, replaces uuid, review_visibility text) returns uuid
language sql security invoker set search_path='' as $$
 select private.training_recap_add_review(request_id,participant,exercise,review_kind,review_body,replaces,review_visibility);
$$;
create function public.training_confirm_from_recap(p_snapshot_share_id uuid, p_trick_id text, p_since timestamptz) returns jsonb
language sql security invoker set search_path='' as $$ select private.training_confirm_from_recap(p_snapshot_share_id,p_trick_id,p_since); $$;

revoke all on function
 private.training_is_board(uuid), private.training_board_clubs(), private.training_board_athletes(),
 private.training_connected(uuid,uuid), private.training_can_manage_athlete(uuid),
 private.training_athlete_can_create(uuid), private.training_set_plan_permission(uuid,boolean),
 private.training_guard_plan_create(), private.profile_salutation_from_signup(),
 private.training_share_own_plan(jsonb), private.training_share_to(uuid,uuid,jsonb),
 private.training_assign_plan(jsonb,uuid[],uuid[],boolean), private.training_inherit_group_plans(),
 private.training_inherit_club_plans(), private.training_set_club_template(uuid,boolean),
 private.training_club_templates(), private.training_plan_hub_context(),
 private.training_recap_add_review(uuid,uuid,uuid,text,text,uuid,text),
 private.training_confirm_from_recap(uuid,text,timestamptz),
 public.training_set_plan_permission(uuid,boolean), public.training_share_own_plan(jsonb),
 public.training_assign_plan(jsonb,uuid[],uuid[],boolean), public.training_set_club_template(uuid,boolean),
 public.training_plan_hub_context(), public.training_recap_add_review(uuid,uuid,uuid,text,text,uuid,text),
 public.training_confirm_from_recap(uuid,text,timestamptz)
from public, anon, authenticated;

-- Helfer, die in Policies ausgewertet werden, brauchen EXECUTE für authenticated.
grant execute on function
 private.training_is_board(uuid), private.training_board_clubs(), private.training_board_athletes(),
 private.training_can_manage_athlete(uuid), private.training_athlete_can_create(uuid),
 private.training_set_plan_permission(uuid,boolean), private.training_share_own_plan(jsonb),
 private.training_assign_plan(jsonb,uuid[],uuid[],boolean), private.training_set_club_template(uuid,boolean),
 private.training_club_templates(), private.training_plan_hub_context(),
 private.training_recap_add_review(uuid,uuid,uuid,text,text,uuid,text),
 private.training_confirm_from_recap(uuid,text,timestamptz),
 public.training_set_plan_permission(uuid,boolean), public.training_share_own_plan(jsonb),
 public.training_assign_plan(jsonb,uuid[],uuid[],boolean), public.training_set_club_template(uuid,boolean),
 public.training_plan_hub_context(), public.training_recap_add_review(uuid,uuid,uuid,text,text,uuid,text),
 public.training_confirm_from_recap(uuid,text,timestamptz)
to authenticated;
