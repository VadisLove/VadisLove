/**
 * Kurzlebige HttpOnly-Markierung für eine erfolgreich eingelöste Recovery-Mail.
 * Eine normale angemeldete Sitzung darf damit nicht zur Reset-Sitzung werden.
 */
export const passwordRecoveryCookieName = "trainer-hub-password-recovery";
export const passwordRecoveryCookieMaxAgeSeconds = 10 * 60;
export const passwordResetPath = "/passwort-zuruecksetzen";
export const forgotPasswordPath = "/passwort-vergessen";
