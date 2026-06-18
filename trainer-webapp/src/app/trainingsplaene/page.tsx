import { trainerRepository } from "@/data/trainer-repository";
import { PlansView } from "@/features/plans/plans-view";

export default async function TrainingPlansPage() {
  const [plans, people] = await Promise.all([
    trainerRepository.getTrainingPlans(),
    trainerRepository.getPeople(),
  ]);
  return <PlansView initialPlans={plans} people={people} />;
}
