export const minimumSelfRegistrationAge = 13;
export const guardianApprovalAge = 18;

interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Parst ein ISO-Kalenderdatum ohne Zeitzonenverschiebung. Geburtsdaten werden
 * nur fuer die Alterspruefung verwendet und nicht dauerhaft gespeichert.
 */
function parseCalendarDate(value: string): ParsedDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function ageOnDate(birthDate: ParsedDate, referenceDate: ParsedDate) {
  let age = referenceDate.year - birthDate.year;
  if (
    referenceDate.month < birthDate.month ||
    (referenceDate.month === birthDate.month && referenceDate.day < birthDate.day)
  ) {
    age -= 1;
  }
  return age;
}

export interface RegistrationAgeResult {
  age: number;
  requiresGuardianApproval: boolean;
  guardianRequiredUntil: string | null;
}

/** Liefert die rechtlich relevante Altersgruppe fuer eine Registrierung. */
export function evaluateRegistrationAge(
  birthDateValue: string,
  referenceDateValue: string,
): RegistrationAgeResult | null {
  const birthDate = parseCalendarDate(birthDateValue);
  const referenceDate = parseCalendarDate(referenceDateValue);
  if (!birthDate || !referenceDate) return null;

  const age = ageOnDate(birthDate, referenceDate);
  if (age < minimumSelfRegistrationAge || age > 110) return null;

  const requiresGuardianApproval = age < guardianApprovalAge;
  return {
    age,
    requiresGuardianApproval,
    guardianRequiredUntil: requiresGuardianApproval
      ? `${birthDate.year + guardianApprovalAge}-${String(birthDate.month).padStart(2, "0")}-${String(birthDate.day).padStart(2, "0")}`
      : null,
  };
}

/** Erzeugt das lokale ISO-Datum ohne UTC-bedingten Tagesversatz. */
export function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
