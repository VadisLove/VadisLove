import { trainerRepository } from "@/data/trainer-repository";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import {
  getSharedTrainingPlanSnapshots,
  getTrainingXpLeaderboard,
} from "@/data/shared-training-plan-repository";
import { PlansView } from "@/features/plans/plans-view";

interface TrainingPlansPageProps {
  searchParams: Promise<{
    plan?: string | string[];
    action?: string | string[];
  }>;
}

export default async function TrainingPlansPage({
  searchParams,
}: TrainingPlansPageProps) {
  const params = await searchParams;
  const selectedPlanId = typeof params.plan === "string"
    ? params.plan
    : undefined;
  const requestedAction = typeof params.action === "string"
    ? params.action
    : undefined;
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
      initialSelectedPlanId={selectedPlanId}
      initialDialog={requestedAction === "share" ? "share" : null}
    />
  );
}
