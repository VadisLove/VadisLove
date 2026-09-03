/**
 * Dokumentversionen werden zusammen mit jeder Annahme protokolliert. Vor dem
 * Produktionsstart muessen die Entwuerfe juristisch freigegeben und beide
 * Versionswerte angehoben werden.
 */
export const legalDocumentVersions = {
  terms: "draft-2026-09-01",
  privacy: "draft-2026-09-01",
} as const;

export const legalRoutes = {
  terms: "/nutzungsbedingungen",
  privacy: "/datenschutz",
  imprint: "/impressum",
} as const;

export const legalDocumentsAreDrafts = true;
