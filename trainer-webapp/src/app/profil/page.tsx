import { getOwnProfileOverview } from "@/data/profile-repository";
import { ProfileView } from "@/features/profile/profile-view";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    deleteError?: string;
    restored?: string;
  }>;
}) {
  const [profile, params] = await Promise.all([
    getOwnProfileOverview(),
    searchParams,
  ]);

  return (
    <ProfileView
      profile={profile}
      deleteError={params.deleteError || ""}
      restored={params.restored === "1"}
    />
  );
}
