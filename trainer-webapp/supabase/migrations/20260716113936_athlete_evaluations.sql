-- Individuelle Auswertungen bleiben Eigentum des jeweiligen Trainers. Automatisch
-- berechnete Termine und Aufgaben werden nicht dupliziert; gespeichert werden nur
-- redaktionelle Felder, Bewertungen und bewusste Contest-Korrekturen.
create table public.trainer_evaluation_settings (
  trainer_id uuid primary key references public.profiles(id) on delete cascade,
  attendance_weight smallint not null default 40 check (attendance_weight between 0 and 100),
  contest_weight smallint not null default 30 check (contest_weight between 0 and 100),
  task_weight smallint not null default 20 check (task_weight between 0 and 100),
  skill_weight smallint not null default 10 check (skill_weight between 0 and 100),
  updated_at timestamptz not null default now(),
  check (attendance_weight + contest_weight + task_weight + skill_weight = 100)
);

create table public.evaluation_skill_settings (
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  skill_key text not null,
  label text not null,
  category text not null check (category in ('skateboarding', 'mental', 'athletic')),
  visible boolean not null default true,
  sort_order integer not null default 0,
  is_custom boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (trainer_id, skill_key),
  check (char_length(btrim(skill_key)) between 1 and 80),
  check (char_length(btrim(label)) between 1 and 160)
);

create index evaluation_skill_settings_trainer_sort_idx
  on public.evaluation_skill_settings(trainer_id, category, sort_order);

create table public.athlete_evaluations (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  title text not null default '',
  conversation_on date,
  squad text not null default '',
  dalid_status text not null default '',
  personal_notes text not null default '',
  measures text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, athlete_id, period_start, period_end),
  check (period_end >= period_start),
  check (char_length(title) <= 200),
  check (char_length(squad) <= 120),
  check (char_length(dalid_status) <= 240),
  check (char_length(personal_notes) <= 10000),
  check (char_length(measures) <= 5000)
);

create index athlete_evaluations_trainer_period_idx
  on public.athlete_evaluations(trainer_id, period_end desc, athlete_id);
create index athlete_evaluations_athlete_period_idx
  on public.athlete_evaluations(athlete_id, period_end desc);

create table public.athlete_evaluation_skill_ratings (
  evaluation_id uuid not null references public.athlete_evaluations(id) on delete cascade,
  skill_key text not null,
  rating smallint not null check (rating between 1 and 5),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (evaluation_id, skill_key),
  check (char_length(btrim(skill_key)) between 1 and 80),
  check (char_length(note) <= 3000)
);

create table public.athlete_evaluation_contest_overrides (
  evaluation_id uuid not null references public.athlete_evaluations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  excluded boolean not null default false,
  category text not null default '',
  placement integer check (placement is null or placement > 0),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (evaluation_id, event_id),
  check (char_length(category) <= 120),
  check (char_length(note) <= 2000)
);

create index athlete_evaluation_contest_overrides_event_idx
  on public.athlete_evaluation_contest_overrides(event_id);

-- Eigene Ziele koennen vom Athleten selbst oder von einem aktiv verbundenen
-- Trainer gepflegt werden. Plan-Aufgaben bleiben weiterhin ihre eigene Quelle.
create table public.athlete_personal_goals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(title)) between 1 and 240)
);

create index athlete_personal_goals_athlete_idx
  on public.athlete_personal_goals(athlete_id, completed, created_at desc);
create index athlete_personal_goals_created_by_idx
  on public.athlete_personal_goals(created_by);

alter table public.trainer_evaluation_settings enable row level security;
alter table public.evaluation_skill_settings enable row level security;
alter table public.athlete_evaluations enable row level security;
alter table public.athlete_evaluation_skill_ratings enable row level security;
alter table public.athlete_evaluation_contest_overrides enable row level security;
alter table public.athlete_personal_goals enable row level security;

create policy "trainer_evaluation_settings_own"
  on public.trainer_evaluation_settings for all
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

create policy "evaluation_skill_settings_own"
  on public.evaluation_skill_settings for all
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

create policy "athlete_evaluations_read_related"
  on public.athlete_evaluations for select
  to authenticated
  using (
    trainer_id = (select auth.uid())
    or athlete_id = (select auth.uid())
  );

create policy "athlete_evaluations_create_connected_trainer"
  on public.athlete_evaluations for insert
  to authenticated
  with check (
    trainer_id = (select auth.uid())
    and (select private.has_active_trainer_athlete_relationship(trainer_id, athlete_id))
  );

create policy "athlete_evaluations_update_connected_trainer"
  on public.athlete_evaluations for update
  to authenticated
  using (
    trainer_id = (select auth.uid())
    and (select private.has_active_trainer_athlete_relationship(trainer_id, athlete_id))
  )
  with check (
    trainer_id = (select auth.uid())
    and (select private.has_active_trainer_athlete_relationship(trainer_id, athlete_id))
  );

create policy "athlete_evaluations_delete_connected_trainer"
  on public.athlete_evaluations for delete
  to authenticated
  using (
    trainer_id = (select auth.uid())
    and (select private.has_active_trainer_athlete_relationship(trainer_id, athlete_id))
  );

create policy "evaluation_skill_ratings_read_related"
  on public.athlete_evaluation_skill_ratings for select
  to authenticated
  using (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and (evaluation.trainer_id = (select auth.uid()) or evaluation.athlete_id = (select auth.uid()))
    )
  );

create policy "evaluation_skill_ratings_manage_trainer"
  on public.athlete_evaluation_skill_ratings for all
  to authenticated
  using (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and evaluation.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and evaluation.trainer_id = (select auth.uid())
    )
  );

create policy "evaluation_contest_overrides_read_related"
  on public.athlete_evaluation_contest_overrides for select
  to authenticated
  using (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and (evaluation.trainer_id = (select auth.uid()) or evaluation.athlete_id = (select auth.uid()))
    )
  );

create policy "evaluation_contest_overrides_manage_trainer"
  on public.athlete_evaluation_contest_overrides for all
  to authenticated
  using (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and evaluation.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and evaluation.trainer_id = (select auth.uid())
    )
  );

create policy "athlete_personal_goals_read_related"
  on public.athlete_personal_goals for select
  to authenticated
  using (
    athlete_id = (select auth.uid())
    or (select private.has_active_trainer_athlete_relationship((select auth.uid()), athlete_id))
  );

create policy "athlete_personal_goals_create_related"
  on public.athlete_personal_goals for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      athlete_id = (select auth.uid())
      or (select private.has_active_trainer_athlete_relationship((select auth.uid()), athlete_id))
    )
  );

create policy "athlete_personal_goals_update_related"
  on public.athlete_personal_goals for update
  to authenticated
  using (
    athlete_id = (select auth.uid())
    or (select private.has_active_trainer_athlete_relationship((select auth.uid()), athlete_id))
  )
  with check (
    athlete_id = (select auth.uid())
    or (select private.has_active_trainer_athlete_relationship((select auth.uid()), athlete_id))
  );

create policy "athlete_personal_goals_delete_related"
  on public.athlete_personal_goals for delete
  to authenticated
  using (
    athlete_id = (select auth.uid())
    or (select private.has_active_trainer_athlete_relationship((select auth.uid()), athlete_id))
  );

revoke all on public.trainer_evaluation_settings from anon, authenticated;
revoke all on public.evaluation_skill_settings from anon, authenticated;
revoke all on public.athlete_evaluations from anon, authenticated;
revoke all on public.athlete_evaluation_skill_ratings from anon, authenticated;
revoke all on public.athlete_evaluation_contest_overrides from anon, authenticated;
revoke all on public.athlete_personal_goals from anon, authenticated;

grant select, insert, update, delete on public.trainer_evaluation_settings to authenticated;
grant select, insert, update, delete on public.evaluation_skill_settings to authenticated;
grant select, insert, update, delete on public.athlete_evaluations to authenticated;
grant select, insert, update, delete on public.athlete_evaluation_skill_ratings to authenticated;
grant select, insert, update, delete on public.athlete_evaluation_contest_overrides to authenticated;
grant select, insert, update, delete on public.athlete_personal_goals to authenticated;
