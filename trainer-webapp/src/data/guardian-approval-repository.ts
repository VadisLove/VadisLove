import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type GuardianApprovalStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface PublicGuardianApproval {
  minorDisplayName: string;
  status: GuardianApprovalStatus;
  expiresAt: string;
  expired: boolean;
}

export interface OwnGuardianApproval {
  id: string;
  guardianEmail: string;
  status: GuardianApprovalStatus;
  expiresAt: string;
  requiredUntil: string;
  expired: boolean;
}

interface PublicGuardianApprovalRow {
  minor_display_name: string;
  approval_status: GuardianApprovalStatus;
  approval_expires_at: string;
}

function isExpired(value: string) {
  return new Date(value).getTime() <= Date.now();
}

/** Laedt nur die fuer den Inhaber des Einmallinks notwendigen Angaben. */
export async function getPublicGuardianApproval(
  token: string,
): Promise<PublicGuardianApproval | null> {
  if (!token) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_guardian_approval", { approval_token: token })
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as PublicGuardianApprovalRow;
  return {
    minorDisplayName: row.minor_display_name,
    status: row.approval_status,
    expiresAt: row.approval_expires_at,
    expired: isExpired(row.approval_expires_at),
  };
}

/** Liefert den eigenen Freigabestatus fuer die gesperrte Warteseite. */
export async function getOwnGuardianApproval(): Promise<OwnGuardianApproval | null> {
  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) return null;

  const { data, error } = await supabase
    .from("guardian_approval_requests")
    .select("id, guardian_email, status, expires_at, guardian_required_until")
    .eq("minor_user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    guardianEmail: data.guardian_email,
    status: data.status as GuardianApprovalStatus,
    expiresAt: data.expires_at,
    requiredUntil: data.guardian_required_until,
    expired: isExpired(data.expires_at),
  };
}
