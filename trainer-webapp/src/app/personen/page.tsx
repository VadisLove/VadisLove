import { getAvailableInvitationRoles } from "@/data/account-invitation-repository";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import { PeopleView } from "@/features/people/people-view";

export default async function PeoplePage() {
  const [people, inviteRoles] = await Promise.all([
    getPeopleDirectory(),
    getAvailableInvitationRoles(),
  ]);

  return <PeopleView people={people} inviteRoles={inviteRoles} />;
}
