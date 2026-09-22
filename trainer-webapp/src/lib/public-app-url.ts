/**
 * Die Roadmap definiert diese Adresse als einzige öffentliche Anwendung.
 * Vorschau-Deployments dürfen für Auth-E-Mails keine eigene, kurzlebige Adresse
 * ausstellen, weil der Link sonst nach einem späteren Deployment unbrauchbar
 * werden kann.
 */
export const canonicalPublicAppUrl = "https://trainer-webapp-ruby.vercel.app";

/**
 * Lokale Entwicklung darf eine ausdrücklich konfigurierte lokale Adresse
 * verwenden. Jede produktionsähnliche Ausführung verwendet dagegen bewusst
 * ausschließlich die dauerhafte öffentliche Adresse.
 */
export function getPublicAppUrl() {
  if (process.env.NODE_ENV === "production") return canonicalPublicAppUrl;

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configuredUrl || "http://localhost:3000";
}
