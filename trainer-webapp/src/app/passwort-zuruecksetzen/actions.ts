"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateNewPassword } from "@/domain/password-security";
import {
  forgotPasswordPath,
  passwordRecoveryCookieName,
} from "@/lib/password-recovery";
import { verifyPasswordRecoveryGrant } from "@/lib/password-recovery-grant";
import { createClient } from "@/lib/supabase/server";

export interface ResetPasswordState {
  status: "idle" | "error";
  message: string;
}

/**
 * Setzt das Passwort nur innerhalb der kurzlebigen Recovery-Sitzung. Nach dem
 * Erfolg werden alle Refresh-Sitzungen widerrufen und eine neue Anmeldung ist
 * erforderlich.
 */
export async function resetRecoveredPassword(
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const cookieStore = await cookies();

  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("passwordConfirmation") || "");
  const validationError = validateNewPassword(password, confirmation);
  if (validationError) {
    return { status: "error", message: validationError };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    cookieStore.delete(passwordRecoveryCookieName);
    redirect(`${forgotPasswordPath}?status=expired`);
  }


  let recoveryVerified = false;
  try {
    recoveryVerified = verifyPasswordRecoveryGrant(
      cookieStore.get(passwordRecoveryCookieName)?.value,
      user.id,
    );
  } catch {
    recoveryVerified = false;
  }
  if (!recoveryVerified) {
    cookieStore.delete(passwordRecoveryCookieName);
    redirect(`${forgotPasswordPath}?status=expired`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") {
      return {
        status: "error",
        message: "Dieses Passwort erfüllt die Sicherheitsanforderungen noch nicht.",
      };
    }
    if (error.code === "same_password") {
      return {
        status: "error",
        message: "Das neue Passwort muss sich vom bisherigen Passwort unterscheiden.",
      };
    }

    return {
      status: "error",
      message:
        "Das Passwort konnte nicht gesetzt werden. Fordere einen neuen Recovery-Link an.",
    };
  }

  cookieStore.delete(passwordRecoveryCookieName);
  await supabase.auth.signOut({ scope: "global" });
  redirect(
    "/login?status=success&message=Passwort+ge%C3%A4ndert.+Bitte+melde+dich+neu+an.",
  );
}
