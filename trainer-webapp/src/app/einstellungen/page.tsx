import { getNotificationPreferences } from "@/data/notification-repository";
import { SettingsView } from "@/features/settings/settings-view";

export default async function SettingsPage() {
  const preferences = await getNotificationPreferences();
  return <SettingsView preferences={preferences} />;
}
