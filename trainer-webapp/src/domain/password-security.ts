export const minimumPasswordLength = 8;

interface AuthIdentityLike {
  provider?: string;
}

/**
 * Erkennt eine bestehende E-Mail-/Passwort-Identität ausschließlich aus dem
 * serverseitig bestätigten Auth-Nutzer. Änderbare Nutzer-Metadaten sind dafür
 * absichtlich keine verlässliche Quelle.
 */
export function hasPasswordIdentity(
  identities: readonly AuthIdentityLike[] | null | undefined,
) {
  return Boolean(identities?.some((identity) => identity.provider === "email"));
}

/** Hält die Passwortregeln in Registrierung, Profil und Recovery konsistent. */
export function validateNewPassword(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < minimumPasswordLength) {
    return `Das Passwort muss mindestens ${minimumPasswordLength} Zeichen lang sein.`;
  }

  if (password !== confirmation) {
    return "Die eingegebenen Passwörter stimmen nicht überein.";
  }

  return null;
}
