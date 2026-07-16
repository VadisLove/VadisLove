import { getNotificationPreferences } from "@/data/notification-repository";
import { getEvaluationPreferences } from "@/data/evaluation-repository";
import { SettingsView } from "@/features/settings/settings-view";

export default async function SettingsPage() {
  const [preferences, evaluationPreferences] = await Promise.all([
    getNotificationPreferences(),
    getEvaluationPreferences(),
  ]);
  return <SettingsView preferences={preferences} evaluationPreferences={evaluationPreferences} />;
}
