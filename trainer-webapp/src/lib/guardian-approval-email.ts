import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { Resend } from "resend";

interface GuardianApprovalEmailInput {
  guardianEmail: string;
  minorDisplayName: string;
  approvalToken: string;
  requestOrigin?: string;
}

export interface GuardianApprovalEmailResult {
  sent: boolean;
  reason?: "missing_configuration" | "provider_error";
}

function getApplicationBaseUrl(requestOrigin?: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProductionUrl) return `https://${vercelProductionUrl}`;

  // Lokale Origins sind nur fuer Entwicklung zulaessig. In Produktion darf
  // kein vom Request-Header beeinflusster Link per E-Mail versendet werden.
  if (process.env.NODE_ENV !== "production" && requestOrigin) {
    return requestOrigin.replace(/\/$/, "");
  }
  return null;
}

/** Versendet den einmaligen Freigabelink ueber den serverseitigen Maildienst. */
async function sendGuardianApprovalEmail({
  guardianEmail,
  minorDisplayName,
  approvalToken,
  requestOrigin,
}: GuardianApprovalEmailInput): Promise<GuardianApprovalEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const baseUrl = getApplicationBaseUrl(requestOrigin);
  if (!apiKey || !from || !baseUrl) {
    return { sent: false, reason: "missing_configuration" };
  }

  const approvalUrl = new URL("/elternfreigabe", baseUrl);
  approvalUrl.searchParams.set("token", approvalToken);
  const idempotencyToken = createHash("sha256")
    .update(approvalToken)
    .digest("hex")
    .slice(0, 32);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from,
      to: guardianEmail,
      subject: `Trainer Hub: Registrierung von ${minorDisplayName} freigeben`,
      text: [
        `Hallo,`,
        "",
        `${minorDisplayName} hat dich als erziehungsberechtigte Person angegeben und möchte den Trainer Hub nutzen.`,
        "Bitte prüfe die Angaben sowie die Nutzungsbedingungen und bestätige oder lehne die Registrierung über diesen Link ab:",
        "",
        approvalUrl.toString(),
        "",
        "Der Link ist 14 Tage gültig und kann nur einmal beantwortet werden.",
        "Wenn du diese Anfrage nicht erwartest, lehne sie bitte ab oder ignoriere diese Nachricht.",
      ].join("\n"),
    },
    {
      idempotencyKey: `guardian-approval-${idempotencyToken}`,
    },
  );

  return error
    ? { sent: false, reason: "provider_error" }
    : { sent: true };
}

/** Der Klartextlink verlässt den Server nur als Mail an die gespeicherte Elternadresse.
 * Aufrufer müssen die Konto-ID aus Sign-up oder einer verifizierten Sitzung beziehen. */
export async function issueGuardianApprovalEmail({
  minorUserId,
  requestOrigin,
}: {
  minorUserId: string;
  requestOrigin?: string;
}): Promise<GuardianApprovalEmailResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { sent: false, reason: "missing_configuration" };
  }
  try {
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.rpc("rotate_guardian_approval_token", {
      target_minor_user_id: minorUserId,
    }).maybeSingle<{
      approval_token: string;
      guardian_email: string;
      minor_display_name: string;
    }>();
    if (error || !data) return { sent: false, reason: "provider_error" };
    return await sendGuardianApprovalEmail({
      guardianEmail: data.guardian_email,
      minorDisplayName: data.minor_display_name,
      approvalToken: data.approval_token,
      requestOrigin,
    });
  } catch {
    // Netzwerkfehler dürfen weder den Token offenlegen noch den Sign-up zurückrollen.
    return { sent: false, reason: "provider_error" };
  }
}
