"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { legalDocumentVersions } from "@/lib/legal-documents";
import { issueGuardianApprovalEmail } from "@/lib/guardian-approval-email";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function approvalUrl(token: string, result: string) {
  const params = new URLSearchParams({ token, result });
  return `/elternfreigabe?${params.toString()}`;
}

/** Verarbeitet den Einmallink ohne ein eigenes Elternkonto vorauszusetzen. */
export async function respondGuardianApproval(formData: FormData) {
  const token = String(formData.get("token") || "");
  const response = String(formData.get("response") || "");
  const guardianName = String(formData.get("guardianName") || "").trim();
  const legalConfirmed = String(formData.get("legalConfirmed") || "") === "true";

  if (
    token.length < 32 ||
    !["approved", "rejected"].includes(response) ||
    guardianName.length < 2 ||
    guardianName.length > 120 ||
    (response === "approved" && !legalConfirmed)
  ) {
    redirect(approvalUrl(token, "invalid"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_guardian_approval", {
    approval_token: token,
    response_status: response,
    guardian_name: guardianName,
    accepted_terms_version: legalDocumentVersions.terms,
    acknowledged_privacy_version: legalDocumentVersions.privacy,
  });

  if (error) {
    redirect(approvalUrl(token, "error"));
  }
  redirect(approvalUrl(token, data === "approved" ? "approved" : "rejected"));
}

/** Rotiert einen verlorenen Link und versendet ihn erneut an dieselbe Adresse. */
export async function resendGuardianApprovalEmail() {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) redirect("/login");

  const requestHeaders = await headers();
  const result = await issueGuardianApprovalEmail({
    minorUserId: currentUserId,
    requestOrigin: requestHeaders.get("origin") || undefined,
  });

  redirect(`/freigabe-ausstehend?mail=${result.sent ? "sent" : "failed"}`);
}
