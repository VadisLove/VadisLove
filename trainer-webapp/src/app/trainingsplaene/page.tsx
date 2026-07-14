import { trainerRepository } from "@/data/trainer-repository";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import { getReceivedTrainingPlanSnapshots } from "@/data/shared-training-plan-repository";
import { PlansView } from "@/features/plans/plans-view";

export default async function TrainingPlansPage() {
  const [plans, people, sharedPlans] = await Promise.all([
    trainerRepository.getTrainingPlans(),
    getPeopleDirectory(),
    getReceivedTrainingPlanSnapshots(),
  ]);
  return <PlansView initialPlans={[...sharedPlans, ...plans]} people={people} />;
}
