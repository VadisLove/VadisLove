-- Getrennte Schreib-Policies vermeiden doppelte permissive SELECT-Policies.
-- Leserechte fuer Trainer und Athlet bleiben in den bestehenden Read-Policies.
drop policy if exists "evaluation_skill_ratings_manage_trainer"
  on public.athlete_evaluation_skill_ratings;

create policy "evaluation_skill_ratings_create_trainer"
  on public.athlete_evaluation_skill_ratings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and evaluation.trainer_id = (select auth.uid())
    )
  );

create policy "evaluation_skill_ratings_update_trainer"
  on public.athlete_evaluation_skill_ratings for update
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

create policy "evaluation_skill_ratings_delete_trainer"
  on public.athlete_evaluation_skill_ratings for delete
  to authenticated
  using (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and evaluation.trainer_id = (select auth.uid())
    )
  );

drop policy if exists "evaluation_contest_overrides_manage_trainer"
  on public.athlete_evaluation_contest_overrides;

create policy "evaluation_contest_overrides_create_trainer"
  on public.athlete_evaluation_contest_overrides for insert
  to authenticated
  with check (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and evaluation.trainer_id = (select auth.uid())
    )
  );

create policy "evaluation_contest_overrides_update_trainer"
  on public.athlete_evaluation_contest_overrides for update
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

create policy "evaluation_contest_overrides_delete_trainer"
  on public.athlete_evaluation_contest_overrides for delete
  to authenticated
  using (
    exists (
      select 1 from public.athlete_evaluations evaluation
      where evaluation.id = evaluation_id
        and evaluation.trainer_id = (select auth.uid())
    )
  );
