import { getOwnProfileOverview } from "@/data/profile-repository";
import { hasPasswordIdentity } from "@/domain/password-security";
import { ProfileView } from "@/features/profile/profile-view";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    deleteError?: string;
    restored?: string;
  }>;
}) {
  const supabase = await createClient();
  const [profile, params, userResult] = await Promise.all([
    getOwnProfileOverview(),
    searchParams,
    supabase.auth.getUser(),
  ]);
  const authUser = userResult.data.user;

  return (
    <ProfileView
      profile={profile}
      passwordSecurity={{
        hasPassword: hasPasswordIdentity(authUser?.identities),
        hasConfirmedEmail: Boolean(authUser?.email_confirmed_at),
      }}
      deleteError={params.deleteError || ""}
      restored={params.restored === "1"}
    />
  );
}
