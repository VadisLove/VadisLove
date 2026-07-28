import { createClient } from "npm:@supabase/supabase-js@2.108.1";

interface DeletionRequest {
  user_id: string;
  status: "scheduled" | "finalized";
  avatar_path_snapshot: string | null;
}

function secretsMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Server-only Cleanup fuer abgelaufene 30-Tage-Fristen.
 *
 * Die Datenbank anonymisiert zuerst transaktional. Anschliessend werden das
 * private Storage-Objekt und der Supabase-Auth-Nutzer mit der nur im
 * Edge-Runtime vorhandenen Service Role entfernt.
 */
Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const expectedSecret = Deno.env.get("ACCOUNT_CLEANUP_SECRET") || "";
  const suppliedSecret = request.headers.get("x-account-cleanup-secret") || "";
  if (!expectedSecret) {
    return Response.json({ error: "Cleanup secret is not configured." }, { status: 503 });
  }
  if (!secretsMatch(expectedSecret, suppliedSecret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: "Supabase runtime configuration is missing." }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = new Date().toISOString();

  const [scheduledResult, retryResult] = await Promise.all([
    admin
      .from("account_deletion_requests")
      .select("user_id, status, avatar_path_snapshot")
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .limit(100),
    admin
      .from("account_deletion_requests")
      .select("user_id, status, avatar_path_snapshot")
      .eq("status", "finalized")
      .is("external_cleanup_completed_at", null)
      .limit(100),
  ]);

  if (scheduledResult.error || retryResult.error) {
    return Response.json(
      { error: "Due deletion requests could not be loaded." },
      { status: 500 },
    );
  }

  const requests = new Map<string, DeletionRequest>();
  for (const deletion of [
    ...(scheduledResult.data || []),
    ...(retryResult.data || []),
  ] as DeletionRequest[]) {
    requests.set(deletion.user_id, deletion);
  }

  let completed = 0;
  const failures: Array<{ userId: string; stage: string }> = [];

  for (const deletion of requests.values()) {
    try {
      if (deletion.status === "scheduled") {
        const { error } = await admin.rpc("finalize_due_account_deletion", {
          p_user_id: deletion.user_id,
        });
        if (error) throw new Error(`database:${error.code}`);
      }

      if (deletion.avatar_path_snapshot) {
        const { error } = await admin.storage
          .from("profile-photos")
          .remove([deletion.avatar_path_snapshot]);
        if (error) throw new Error("storage");
      }

      const { error: authError } = await admin.auth.admin.deleteUser(
        deletion.user_id,
      );
      if (
        authError &&
        !authError.message.toLowerCase().includes("user not found")
      ) {
        throw new Error("auth");
      }

      const { error: completionError } = await admin
        .from("account_deletion_requests")
        .update({
          external_cleanup_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", deletion.user_id);
      if (completionError) throw new Error("completion");
      completed += 1;
    } catch (error) {
      const stage = error instanceof Error ? error.message.split(":")[0] : "unknown";
      failures.push({ userId: deletion.user_id, stage });
    }
  }

  return Response.json({
    processed: requests.size,
    completed,
    failed: failures.length,
    failures,
  });
});
