import { getCarpools } from "@/data/carpool-repository";
import { CarpoolPanel } from "@/features/carpools/carpool-panel";
import { getNotificationPreferences } from "@/data/notification-repository";
import { getEvaluationPreferences } from "@/data/evaluation-repository";
import { SettingsView } from "@/features/settings/settings-view";

export default async function SettingsPage() {
  const [preferences, evaluationPreferences, carpools] = await Promise.all([
    getNotificationPreferences(),
    getEvaluationPreferences(),
    getCarpools(),
  ]);
  return <><SettingsView preferences={preferences} evaluationPreferences={evaluationPreferences} /><CarpoolPanel settingsOnly initial={carpools} /></>;
}
