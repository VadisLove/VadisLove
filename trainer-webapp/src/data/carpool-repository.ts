import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import {
  carpoolErrorCode,
  isCarpoolId,
  type CarpoolSnapshot,
} from "@/domain/carpools";

/** Der Datenbank-Snapshot begrenzt auch die besondere Sicht verknüpfter Eltern. */
export async function getCarpools(
  eventId?: string,
  rideId?: string,
): Promise<{ data?: CarpoolSnapshot; error?: string }> {
  if ((eventId && !isCarpoolId(eventId)) || (rideId && !isCarpoolId(rideId)))
    return { error: "invalid" };
  const client = await createClient();
  if (!(await getAuthenticatedUserId(client))) return { error: "forbidden" };
  const { data, error } = await client.rpc("carpool_snapshot", {
    target_event: eventId || null,
    target_ride: rideId || null,
  });
  return error
    ? { error: carpoolErrorCode(error) }
    : { data: data as CarpoolSnapshot };
}
