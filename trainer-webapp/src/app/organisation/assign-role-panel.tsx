"use client";

import { useActionState, useMemo, useState } from "react";
import { KeyRound, UserRoundCog } from "lucide-react";
import type {
  AssignableProfile,
  OrganizationLevel,
  OrganizationOverview,
  OrganizationRole,
  RoleAssignmentOption,
} from "@/domain/models";
import {
  assignOrganizationRole,
  type AssignRoleState,
} from "./actions";
import styles from "./page.module.css";

interface AssignRolePanelProps {
  profiles: AssignableProfile[];
  organizations: OrganizationOverview[];
  options: RoleAssignmentOption[];
  roleLabels: Record<OrganizationRole, string>;
  levelLabels: Record<OrganizationLevel, string>;
}

const initialState: AssignRoleState = {
  status: "idle",
  message: "",
};

/**
 * Vergibt registrierten Accounts eine konkrete Organisationsrolle.
 *
 * Die Auswahl zeigt nur Organisationen und Rollen, die der Server für den
 * aktuellen Nutzer als zulässig gemeldet hat.
 */
export function AssignRolePanel({
  profiles,
  organizations,
  options,
  roleLabels,
  levelLabels,
}: AssignRolePanelProps) {
  const [state, formAction, pending] = useActionState(
    assignOrganizationRole,
    initialState,
  );
  const assignableOrganizationIds = useMemo(
    () => new Set(options.map((option) => option.organizationId)),
    [options],
  );
  const assignableOrganizations = organizations.filter((organization) =>
    assignableOrganizationIds.has(organization.id),
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    assignableOrganizations[0]?.id || "",
  );
  const roleOptions = options.filter(
    (option) => option.organizationId === selectedOrganizationId,
  );

  if (profiles.length === 0 || assignableOrganizations.length === 0) {
    return (
      <section className={styles.rolePanel}>
        <div className={styles.rolePanelHeader}>
          <span><UserRoundCog size={22} /></span>
          <div>
            <h2>Registrierte Konten</h2>
            <p>
              Sobald du eine Verwaltungsrolle hast, erscheinen hier Accounts
              zur Rollenvergabe.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.rolePanel}>
      <div className={styles.rolePanelHeader}>
        <span><UserRoundCog size={22} /></span>
        <div>
          <h2>Registrierte Konten</h2>
          <p>
            Weise neuen Accounts zuerst eine Organisationsrolle zu. Danach
            greifen auch die Einladungsrechte.
          </p>
        </div>
      </div>

      <form action={formAction} className={styles.roleForm}>
        <label>
          Konto
          <select name="userId" required>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.displayName} · {profile.email}
              </option>
            ))}
          </select>
        </label>

        <label>
          Organisation
          <select
            name="organizationId"
            value={selectedOrganizationId}
            onChange={(event) => setSelectedOrganizationId(event.target.value)}
            required
          >
            {assignableOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} · {levelLabels[organization.level]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Rolle
          <select name="role" required>
            {roleOptions.map((option) => (
              <option key={option.role} value={option.role}>
                {roleLabels[option.role]}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={pending || roleOptions.length === 0}>
          <KeyRound size={17} />
          {pending ? "Wird vergeben ..." : "Rolle vergeben"}
        </button>
      </form>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? styles.errorMessage
              : styles.formSuccessMessage
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}

      <div className={styles.accountList}>
        {profiles.slice(0, 8).map((profile) => (
          <article key={profile.id}>
            <strong>{profile.displayName}</strong>
            <span>{profile.email}</span>
            <small>{profile.accountType}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
