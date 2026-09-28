import type { Metadata } from "next";
import { getFamilyInvitationName, getFamilyOverview } from "@/data/family-repository";
import { FamilyView } from "@/features/family/family-view";

// Einladungsparameter dürfen weder indiziert noch als Referrer weitergegeben werden.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function FamilyPage({ searchParams }: {
  searchParams: Promise<{ einladung?: string }>;
}) {
  const params = await searchParams;
  const invitationToken = typeof params.einladung === "string" ? params.einladung : "";
  const [initial, invitationName] = await Promise.all([
    getFamilyOverview().catch(() => null),
    invitationToken ? getFamilyInvitationName(invitationToken) : Promise.resolve(null),
  ]);
  return <FamilyView initial={initial} invitationToken={invitationToken} invitationName={invitationName} />;
}
