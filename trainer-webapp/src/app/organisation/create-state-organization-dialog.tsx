"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Building2, Plus, UserRoundCheck, X } from "lucide-react";
import type { ManageableFederalOrganization } from "@/domain/models";
import {
  createStateOrganization,
  type CreateStateOrganizationState,
} from "./actions";
import styles from "./page.module.css";

interface CreateStateOrganizationDialogProps {
  federalOrganizations: ManageableFederalOrganization[];
}

const initialState: CreateStateOrganizationState = {
  status: "idle",
  message: "",
};

const federalStates = [
  ["BW", "Baden-Württemberg"],
  ["BY", "Bayern"],
  ["BE", "Berlin"],
  ["BB", "Brandenburg"],
  ["HB", "Bremen"],
  ["HH", "Hamburg"],
  ["HE", "Hessen"],
  ["MV", "Mecklenburg-Vorpommern"],
  ["NI", "Niedersachsen"],
  ["NW", "Nordrhein-Westfalen"],
  ["RP", "Rheinland-Pfalz"],
  ["SL", "Saarland"],
  ["SN", "Sachsen"],
  ["ST", "Sachsen-Anhalt"],
  ["SH", "Schleswig-Holstein"],
  ["TH", "Thüringen"],
] as const;

/**
 * Öffnet das Formular ausschließlich für Bundesvorsitzende.
 *
 * Nach erfolgreichem Speichern wird der Dialog geschlossen. Die Server Action
 * invalidiert parallel die Organisationsseite und liefert die Erfolgsmeldung.
 */
export function CreateStateOrganizationDialog({
  federalOrganizations,
}: CreateStateOrganizationDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createStateOrganization,
    initialState,
  );
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    const firstInput = dialogRef.current?.querySelector<
      HTMLInputElement | HTMLSelectElement
    >("input, select");
    firstInput?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDialogOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen]);

  return (
    <div className={styles.creationArea}>
      <button
        type="button"
        className={styles.createButton}
        onClick={() => setDialogOpen(true)}
      >
        <Plus size={18} />
        Landesverband anlegen
      </button>

      {state.status === "success" ? (
        <p className={styles.successMessage} role="status">
          {state.message}
        </p>
      ) : null}

      {dialogOpen ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDialogOpen(false);
            }
          }}
        >
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-state-organization-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <span className={styles.dialogIcon}>
                  <Building2 size={21} />
                </span>
                <div>
                  <h2 id="create-state-organization-title">
                    Landesverband anlegen
                  </h2>
                  <p>Name, Bundesland und verantwortlichen Fachwart festlegen.</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Dialog schließen"
                onClick={() => setDialogOpen(false)}
              >
                <X size={21} />
              </button>
            </div>

            <form action={formAction}>
              {federalOrganizations.length === 1 ? (
                <input
                  type="hidden"
                  name="parentOrganizationId"
                  value={federalOrganizations[0].id}
                />
              ) : (
                <label>
                  Bundesverband
                  <select name="parentOrganizationId" required>
                    {federalOrganizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className={styles.formRow}>
                <label>
                  Name des Landesverbands
                  <input
                    name="name"
                    placeholder="z. B. Skateboard Bayern"
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  Bundesland
                  <select name="stateCode" defaultValue="BY" required>
                    {federalStates.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Fachwart zuweisen
                <span className={styles.inputWithIcon}>
                  <UserRoundCheck size={18} />
                  <input
                    name="specialistEmail"
                    type="email"
                    placeholder="fachwart@verband.de"
                    autoComplete="email"
                    required
                  />
                </span>
                <small>
                  Die Person benötigt bereits ein registriertes Konto vom Typ
                  „Verein oder Verband“.
                </small>
              </label>

              {state.status === "error" ? (
                <p className={styles.errorMessage} role="alert">
                  {state.message}
                </p>
              ) : null}

              {state.status === "success" ? (
                <p className={styles.formSuccessMessage} role="status">
                  {state.message}
                </p>
              ) : null}

              <div className={styles.dialogActions}>
                <button type="button" onClick={() => setDialogOpen(false)}>
                  {state.status === "success" ? "Schließen" : "Abbrechen"}
                </button>
                <button type="submit" disabled={pending}>
                  {pending ? "Wird angelegt …" : "Landesverband anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
