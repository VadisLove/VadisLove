-- Session-Rückblick kennt Lines und aktive Zeit. Basis ist die Projektion aus
-- 20260929100000_plan_hub_rights_groups.sql (Park, Sichtbarkeit, athlete_user_id);
-- ergänzt werden ausschließlich additive Felder, Zugriffsregeln bleiben gleich:
--   exercises[].kind        'line' bei Lines, sonst 'trick'
--   exercises[].line_tricks geordnete Tricknamen einer Line
--   exercises[].breaks      nicht komplette Line-Versuche je Bruchstelle
--   active_ms               Dauer ohne Pausen (Ende − Start − Pausenzeit)
create or replace function private.training_recaps() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'participant_id',p.id,'athlete_id',a.id,'athlete_name',a.display_name,'athlete_user_id',a.user_id,
 'session_id',s.id,'title',case when s.mode='group' then 'Gruppentraining' else s.plan_snapshot->>'title' end,
 'park',(select k.name from public.skateparks k where k.id=s.skatepark_id),
 'mode',s.mode,'present',p.present,'started_at',s.started_at,'completed_at',s.completed_at,
 'active_ms',greatest(0,floor(extract(epoch from (s.completed_at-s.started_at))*1000)::bigint-s.paused_ms),
 'is_self',a.user_id=auth.uid(),
 'can_review',private.has_active_trainer_athlete_relationship(auth.uid(),a.user_id),
 'can_confirm',private.has_active_trainer_athlete_relationship(auth.uid(),a.user_id)
  or (a.user_id=auth.uid() and not private.training_recap_has_trainer(a.user_id)),
 -- Allgemeine betreute Notizen bleiben für Trainer reserviert, auch im Einzeltraining.
 'note',case when s.mode='self' or private.training_can_session(s.id) then s.note else null end,
 'exercises',coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'skill_id',e.source_trick_id,'name',e.content->>'name','elapsed_ms',e.elapsed_ms,
  'kind',case when e.content->>'type'='line' then 'line' else 'trick' end,
  'line_tricks',case when e.content->>'type'='line' then e.content->'trickNames' else null end,
  'note',case when s.mode='self' or private.training_can_session(s.id) then e.note else null end,
  'trainer_note',case when s.mode='self' or private.training_can_session(s.id) then e.content->>'trainerNote' else null end,
  'attempts',(select count(*) from public.training_session_attempts t where t.participant_id=p.id and t.exercise_id=e.id and t.undone_at is null),
  'landed',(select count(*) from public.training_session_attempts t where t.participant_id=p.id and t.exercise_id=e.id and t.undone_at is null and t.landed),
  'breaks',case when e.content->>'type'='line' then coalesce((select jsonb_agg(jsonb_build_object('broke_at',b.broke_at,'attempts',b.n))
   from (select t.broke_at,count(*)::integer n from public.training_session_attempts t
    where t.participant_id=p.id and t.exercise_id=e.id and t.undone_at is null and not t.landed group by t.broke_at) b),'[]'::jsonb) else null end
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
revoke all on function private.training_recaps() from public,anon,authenticated;
grant execute on function private.training_recaps() to authenticated;
