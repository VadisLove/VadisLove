import { getInboxOverview } from "@/data/social-repository";
import { InboxView } from "@/features/inbox/inbox-view";

export default async function InboxPage() {
  const overview = await getInboxOverview();
  return <InboxView overview={overview} />;
}
