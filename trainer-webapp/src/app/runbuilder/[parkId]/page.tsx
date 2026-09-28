import { notFound } from "next/navigation";
import { getParkDetail } from "@/data/park-repository";
import { ParkPlannerView } from "@/features/parks/park-planner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SkateparkPage({
  params,
  searchParams,
}: {
  params: Promise<{ parkId: string }>;
  searchParams: Promise<{ bearbeiten?: string; run?: string }>;
}) {
  const [{ parkId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(parkId)) notFound();
  const detail = await getParkDetail(parkId);
  if (!detail) notFound();
  return (
    <ParkPlannerView
      initial={detail}
      initialEdit={query.bearbeiten === "1"}
      initialRunId={query.run && UUID.test(query.run) ? query.run : null}
    />
  );
}
