"use client";

import { useState } from "react";
import {
  evaluateRegistrationAge,
  guardianApprovalAge,
  localIsoDate,
  minimumSelfRegistrationAge,
} from "@/domain/registration-age";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./page.module.css";

/**
 * Fragt das Geburtsdatum nur zur Alterspruefung ab. Der Server speichert nicht
 * das Datum selbst, sondern bei Minderjaehrigen lediglich das Ende der
 * erforderlichen Elternfreigabe.
 */
export function AgeAndGuardianFields() {
  const { t } = useI18n();
  const [birthDate, setBirthDate] = useState("");
  const [today] = useState(() => localIsoDate());
  const ageResult = birthDate
    ? evaluateRegistrationAge(birthDate, today)
    : null;
  const enteredDateIsTooYoung = Boolean(birthDate && !ageResult);

  return (
    <section className={styles.ageSection} aria-labelledby="registration-age-title">
      <div>
        <strong id="registration-age-title">{t("auth.ageTitle")}</strong>
        <small>{t("auth.ageDescription", { age: minimumSelfRegistrationAge })}</small>
      </div>

      <label>
        {t("auth.birthDate")}
        <input
          type="date"
          name="birthDate"
          value={birthDate}
          max={today}
          onChange={(event) => setBirthDate(event.target.value)}
          required
          aria-describedby="registration-age-help"
        />
      </label>

      <small
        id="registration-age-help"
        className={enteredDateIsTooYoung ? styles.fieldError : ""}
      >
        {enteredDateIsTooYoung
          ? t("auth.minimumAgeError", { age: minimumSelfRegistrationAge })
          : t("auth.birthDatePrivacy")}
      </small>

      {ageResult?.requiresGuardianApproval ? (
        <div className={styles.guardianFields}>
          <p>
            {t("auth.guardianRequired", { age: guardianApprovalAge })}
          </p>
          <label>
            {t("auth.guardianEmail")}
            <input
              type="email"
              name="guardianEmail"
              autoComplete="email"
              placeholder="elternteil@beispiel.de"
              required
            />
          </label>
          <small>{t("auth.guardianEmailHelp")}</small>
        </div>
      ) : null}
    </section>
  );
}
