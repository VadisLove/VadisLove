-- Schritt 6 ergänzt ausschließlich Bewertungen; Trainingsdaten aus Schritt 5
-- bleiben die einzige Quelle für Versuche, Landungen und gemessene Zeiten.
create table public.training_session_reviews (
 id uuid primary key,
 participant_id uuid not null references public.training_session_participants(id) on delete restrict,
 exercise_id uuid references public.training_session_exercises(id) on delete restrict,
 kind text not null check(kind in ('hint','goal','request','confirmation')),
 body text not null check(length(btrim(body)) between 1 and 4000),
 author_id uuid not null references public.profiles(id) on delete restrict,
 author_role text not null check(author_role in ('trainer','self')),
 created_at timestamptz not null default now(),
 supersedes uuid unique references public.training_session_reviews(id) on delete restrict,
 check(kind not in ('request','confirmation') or exercise_id is not null)
);
create index training_reviews_participant on public.training_session_reviews(participant_id,created_at);
create index training_reviews_exercise on public.training_session_reviews(exercise_id);
create index training_reviews_author on public.training_session_reviews(author_id);
alter table public.training_session_reviews enable row level security;
revoke all on public.training_session_reviews from public,anon,authenticated;

-- Nur diese private Projektion überquert die bisherigen Session-RLS-Grenzen.
-- Daher werden Identität und aktive Beziehung vor jeder personenbezogenen Zeile
-- geprüft. Gruppenlisten, Plan-Snapshots und Freitext anderer Fahrer fehlen ganz.
create function private.training_recap_access(athlete_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_account_is_active() and (
 athlete_user=auth.uid()
 or private.has_active_trainer_athlete_relationship(auth.uid(),athlete_user)
 or exists(select 1 from public.relationships r where r.active
  and r.relationship_type='guardian' and r.guardian_user_id=auth.uid()
  and r.athlete_user_id=athlete_user)
 );
$$;
create function private.training_recap_has_trainer(athlete_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.relationships r where r.active
 and r.relationship_type='trainer_athlete' and athlete_user in (r.user_one_id,r.user_two_id)
 and private.is_trainer_profile(case when r.user_one_id=athlete_user then r.user_two_id else r.user_one_id end));
$$;

-- Append-only: Korrekturen erhalten den alten Eintrag und verweisen auf ihn.
create function private.training_review_immutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'REVIEW_IMMUTABLE'; end;
$$;
create trigger training_review_immutable before update or delete on public.training_session_reviews
for each row execute function private.training_review_immutable();

create function private.training_recap_add_review(request_id uuid, participant uuid, exercise uuid,
 review_kind text, review_body text, replaces uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.training_athletes%rowtype; p public.training_session_participants%rowtype;
 trainer boolean; old_review public.training_session_reviews%rowtype;
begin
 if auth.uid() is null or not private.current_account_is_active() then
  raise exception 'REVIEW_FORBIDDEN' using errcode='42501'; end if;
 -- Eine Teilnehmer-Sperre serialisiert Wiederholung, Bestätigung und Korrektur.
 select * into p from public.training_session_participants where id=participant for update;
 select * into a from public.training_athletes where id=p.athlete_id;
 if a.user_id is null or not private.training_recap_access(a.user_id)
 or not exists(select 1 from public.training_sessions where id=p.session_id and status='completed') then
  raise exception 'REVIEW_FORBIDDEN' using errcode='42501'; end if;
 trainer:=private.has_active_trainer_athlete_relationship(auth.uid(),a.user_id);
 if exercise is not null and not exists(select 1 from public.training_session_exercises where id=exercise and session_id=p.session_id) then
  raise exception 'REVIEW_INVALID'; end if;
 if review_kind is null or review_kind not in ('hint','goal','request','confirmation')
 or review_body is null or length(btrim(review_body)) not between 1 and 4000
 or (review_kind in ('request','confirmation') and exercise is null) then raise exception 'REVIEW_INVALID'; end if;
 if not trainer and not (a.user_id=auth.uid() and (review_kind='request'
 or (review_kind='confirmation' and not private.training_recap_has_trainer(a.user_id)))) then
  raise exception 'REVIEW_FORBIDDEN' using errcode='42501'; end if;
 -- Ein bereits bestätigter Request darf nach verlorenem HTTP-Ergebnis wiederholt werden.
 select * into old_review from public.training_session_reviews where id=request_id;
 if found then
  if old_review.author_id=auth.uid() and old_review.participant_id=participant
   and old_review.exercise_id is not distinct from exercise and old_review.kind=review_kind
   and old_review.body=btrim(review_body) and old_review.supersedes is not distinct from replaces then return request_id; end if;
  raise exception 'REVIEW_CONFLICT' using errcode='40001';
 end if;
 if replaces is not null then
  select * into old_review from public.training_session_reviews where id=replaces;
  if not found or old_review.participant_id<>participant or old_review.kind<>review_kind
   or old_review.exercise_id is distinct from exercise
   or exists(select 1 from public.training_session_reviews where supersedes=replaces) then
   raise exception 'REVIEW_CONFLICT' using errcode='40001'; end if;
 end if;
 -- Wie bisher: erst eine ausdrückliche Anfrage, danach die Bestätigung.
 if review_kind='confirmation' and not exists(select 1 from public.training_session_reviews
  where participant_id=participant and exercise_id=exercise and kind='request') then raise exception 'REVIEW_REQUEST_REQUIRED'; end if;
 insert into public.training_session_reviews(id,participant_id,exercise_id,kind,body,author_id,author_role,supersedes)
 values(request_id,participant,exercise,review_kind,btrim(review_body),auth.uid(),case when trainer then 'trainer' else 'self' end,replaces);
 return request_id;
end;
$$;

create function private.training_recaps() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'participant_id',p.id,'athlete_id',a.id,'athlete_name',a.display_name,
 'session_id',s.id,'title',case when s.mode='group' then 'Gruppentraining' else s.plan_snapshot->>'title' end,
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
  'author_role',r.author_role,'created_at',r.created_at,'supersedes',r.supersedes
 ) order by r.created_at,r.id) from public.training_session_reviews r join public.profiles pr on pr.id=r.author_id where r.participant_id=p.id),'[]'::jsonb)
 ) order by s.completed_at desc,p.id),'[]'::jsonb)
 from public.training_session_participants p join public.training_athletes a on a.id=p.athlete_id
 join public.training_sessions s on s.id=p.session_id
 where s.status='completed' and private.training_recap_access(a.user_id);
$$;
-- Öffentliche Wrapper haben keine erhöhten Rechte. Die privaten Implementierungen
-- sind nicht per PostgREST aufrufbar und prüfen selbst auth.uid() und Beziehungen.
create function public.training_recaps() returns jsonb language sql stable security invoker set search_path='' as $$ select private.training_recaps(); $$;
create function public.training_recap_add_review(request_id uuid, participant uuid, exercise uuid,
 review_kind text, review_body text, replaces uuid default null) returns uuid
language sql security invoker set search_path='' as $$
 select private.training_recap_add_review(request_id,participant,exercise,review_kind,review_body,replaces);
$$;
revoke all on function private.training_recap_access(uuid),private.training_recap_has_trainer(uuid),private.training_review_immutable(),private.training_recaps(),private.training_recap_add_review(uuid,uuid,uuid,text,text,uuid),public.training_recaps(),public.training_recap_add_review(uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function private.training_recaps(),private.training_recap_add_review(uuid,uuid,uuid,text,text,uuid),public.training_recaps(),public.training_recap_add_review(uuid,uuid,uuid,text,text,uuid) to authenticated;
