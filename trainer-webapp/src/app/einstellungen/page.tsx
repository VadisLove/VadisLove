import { getCarpools } from "@/data/carpool-repository";
import { CarpoolPanel } from "@/features/carpools/carpool-panel";
import { getCalendarFeedSubscription, getNotificationPreferences } from "@/data/notification-repository";
import { getEvaluationPreferences } from "@/data/evaluation-repository";
import { SettingsView } from "@/features/settings/settings-view";

export default async function SettingsPage() {
  const [preferences, evaluationPreferences, carpools, calendarFeed] = await Promise.all([
    getNotificationPreferences(),
    getEvaluationPreferences(),
    getCarpools(),
    getCalendarFeedSubscription(),
  ]);
  return <><SettingsView preferences={preferences} evaluationPreferences={evaluationPreferences} calendarFeed={calendarFeed} /><CarpoolPanel settingsOnly initial={carpools} /></>;
}
