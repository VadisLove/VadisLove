"use client";

import { useMemo, useState } from "react";
import type { RegistrationOrganization } from "@/data/registration-organization-repository";
import type { AccountType } from "@/domain/current-user";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./page.module.css";

interface RegistrationOrganizationFieldsProps {
  organizations: RegistrationOrganization[];
}

const selectableAccountTypes: AccountType[] = [
  "athlete",
  "trainer",
  "medical",
  "guardian",
  "organization_staff",
];

/**
 * Wechselt die Organisationsliste passend zum Kontotyp. So können Personen
 * nur Vereine und Verwaltungskonten nur Landesverbände auswählen.
 */
export function RegistrationOrganizationFields({
  organizations,
}: RegistrationOrganizationFieldsProps) {
  const { t } = useI18n();
  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [organizationId, setOrganizationId] = useState("");
  const expectsStateAssociation = accountType === "organization_staff";

  const choices = useMemo(
    () => organizations.filter((organization) =>
      expectsStateAssociation
        ? organization.level === "state"
        : organization.level === "club"),
    [expectsStateAssociation, organizations],
  );
  const selectedOrganization = choices.find(
    (organization) => organization.id === organizationId,
  );

  function selectAccountType(nextAccountType: AccountType) {
    setAccountType(nextAccountType);
    setOrganizationId("");
  }

  return (
    <>
      <fieldset className={styles.accountTypes}>
        <legend>{t("auth.iAm")}</legend>
        {selectableAccountTypes.map((type) => (
          <label key={type}>
            <input
              type="radio"
              name="accountType"
              value={type}
              checked={accountType === type}
              onChange={() => selectAccountType(type)}
              required
            />
            <span>{t(`accountTypes.${type}`)}</span>
          </label>
        ))}
      </fieldset>

      {accountType ? (
        <label className={styles.organizationSelect}>
          {expectsStateAssociation
            ? t("auth.stateAssociation")
            : t("auth.club")}
          <select
            name="organizationId"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            required
          >
            <option value="">{expectsStateAssociation
              ? t("auth.selectStateAssociation")
              : t("auth.selectClub")}</option>
            {choices.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}{organization.regionName
                  ? ` · ${organization.regionName}`
                  : ""}
              </option>
            ))}
          </select>
          <small>
            {selectedOrganization?.level === "club"
              ? t("auth.clubAssociation", {
                  association: selectedOrganization.parentName,
                })
              : t("auth.organizationApproval")}
          </small>
        </label>
      ) : null}
    </>
  );
}
