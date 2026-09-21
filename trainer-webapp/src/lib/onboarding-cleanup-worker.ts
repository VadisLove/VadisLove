// Ein versehentlicher Client-Import muss bereits beim Build scheitern.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { deleteClaimedOnboardingAccounts } from "./onboarding-cleanup";

interface CleanupRow {
  user_id: string;
}

/**
 * Beansprucht fällige Onboardings und löscht die Auth-Identität hart.
 * Der Service-Role-Schlüssel bleibt ausschließlich in diesem Servermodul.
 */
export async function runOnboardingCleanupWorker() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("ONBOARDING_CLEANUP_NOT_CONFIGURED");

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("claim_due_onboarding_cleanup", {
    batch_size: 25,
  });
  if (error) throw new Error("ONBOARDING_CLEANUP_CLAIM_FAILED");

  const rows = (data || []) as CleanupRow[];
  return deleteClaimedOnboardingAccounts(
    rows.map((row) => row.user_id),
    async (userId) => {
      const { error: deleteError } = await client.auth.admin.deleteUser(userId, false);
      return !deleteError;
    },
  );
}
