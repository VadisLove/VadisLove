import { createHmac, timingSafeEqual } from "node:crypto";

const recoverySecretEnvironmentName = "PASSWORD_RECOVERY_COOKIE_SECRET";
const recoveryGrantMaxAgeSeconds = 10 * 60;

function getRecoverySecret(override?: string) {
  const secret = override || process.env[recoverySecretEnvironmentName];
  if (!secret || secret.length < 32) {
    throw new Error(
      `${recoverySecretEnvironmentName} muss mindestens 32 Zeichen lang sein.`,
    );
  }
  return secret;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Signiert Nutzer und Ablaufzeit der Recovery-Sitzung. Damit kann ein normaler
 * angemeldeter Nutzer die Reset-Berechtigung nicht durch ein eigenes Cookie
 * vortäuschen.
 */
export function createPasswordRecoveryGrant(
  userId: string,
  now = Date.now(),
  secretOverride?: string,
) {
  const expiresAt = now + recoveryGrantMaxAgeSeconds * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${signature(payload, getRecoverySecret(secretOverride))}`;
}

/** Prüft Signatur, Ablaufzeit und Bindung an den bestätigten Auth-Nutzer. */
export function verifyPasswordRecoveryGrant(
  grant: string | undefined,
  userId: string,
  now = Date.now(),
  secretOverride?: string,
) {
  if (!grant) return false;
  const parts = grant.split(".");
  if (parts.length !== 3) return false;

  const [grantedUserId, expiresAtValue, suppliedSignature] = parts;
  const expiresAt = Number(expiresAtValue);
  if (
    grantedUserId !== userId ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now
  ) {
    return false;
  }

  const payload = `${grantedUserId}.${expiresAtValue}`;
  const expectedSignature = signature(payload, getRecoverySecret(secretOverride));
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}
