import { getParkDirectory } from "@/data/park-repository";
import { ParkDirectoryView } from "@/features/parks/park-directory";

export default async function SkateparksPage() {
  const initial = await getParkDirectory().catch(() => null);
  return <ParkDirectoryView initial={initial} />;
}
