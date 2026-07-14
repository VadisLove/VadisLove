import { trainerRepository } from "@/data/trainer-repository";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import {
  getSharedTrainingPlanSnapshots,
  getTrainingXpLeaderboard,
} from "@/data/shared-training-plan-repository";
import { PlansView } from "@/features/plans/plans-view";

export default async function TrainingPlansPage() {
  const [plans, people, sharedPlans, leaderboard] = await Promise.all([
    trainerRepository.getTrainingPlans(),
    getPeopleDirectory(),
    getSharedTrainingPlanSnapshots(),
    getTrainingXpLeaderboard(),
  ]);
  return (
    <PlansView
      initialPlans={[...sharedPlans, ...plans]}
      people={people}
      initialLeaderboard={leaderboard}
    />
  );
}
