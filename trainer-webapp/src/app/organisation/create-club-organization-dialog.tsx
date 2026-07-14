"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, MapPin, Plus, X } from "lucide-react";
import {
  createClubOrganization,
  type CreateClubOrganizationState,
} from "./actions";
import styles from "./page.module.css";

interface CreateClubOrganizationDialogProps {
  stateOrganizationId: string;
  stateOrganizationName: string;
}

const initialState: CreateClubOrganizationState = {
  status: "idle",
  message: "",
};

/**
 * Zeigt das Vereinsformular nur dort, wo die Server-Komponente zuvor eine
 * bestätigte Fachwartrolle ermittelt hat. Die Datenbank prüft dies zusätzlich.
 */
export function CreateClubOrganizationDialog({
  stateOrganizationId,
  stateOrganizationName,
}: CreateClubOrganizationDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createClubOrganization,
    initialState,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    dialogRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        setDialogOpen(false);
      }
    }

    const triggerElement = triggerRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      triggerElement?.focus();
    };
  }, [dialogOpen, pending]);

  return (
    <div className={styles.clubCreationArea}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.createClubButton}
        onClick={() => setDialogOpen(true)}
      >
        <Plus size={17} />
        Neuen Verein anlegen
      </button>

      {state.status === "success" ? (
        <p className={styles.clubSuccessMessage} role="status">
          {state.message}
        </p>
      ) : null}

      {dialogOpen && typeof document !== "undefined"
        ? createPortal(
            // Das Portal löst den Dialog aus dem transformierten Karten-Kontext.
            // Dadurch liegt der Backdrop zuverlässig über der gesamten Seite.
            <div
              className={styles.dialogBackdrop}
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !pending) {
                  setDialogOpen(false);
                }
              }}
            >
              <div
                ref={dialogRef}
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <div className={styles.dialogHeader}>
                  <div>
                    <span className={styles.dialogIcon}>
                      <Building2 size={21} />
                    </span>
                    <div>
                      <h2 id={titleId}>Neuen Verein anlegen</h2>
                      <p>Der Verein wird direkt dem Landesverband zugeordnet.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Dialog schließen"
                    disabled={pending}
                    onClick={() => setDialogOpen(false)}
                  >
                    <X size={21} />
                  </button>
                </div>

                <form action={formAction}>
                  <input
                    type="hidden"
                    name="stateOrganizationId"
                    value={stateOrganizationId}
                  />

                  <label>
                    Landesverband
                    <input
                      value={stateOrganizationName}
                      readOnly
                      aria-readonly="true"
                    />
                    <small>
                      Landesverband und Bundesland werden automatisch übernommen.
                    </small>
                  </label>

                  <label>
                    Vereinsname
                    <input
                      name="name"
                      placeholder="z. B. Skateclub München"
                      maxLength={120}
                      required
                    />
                  </label>

                  <label>
                    Region oder Ort{" "}
                    <span className={styles.optionalLabel}>(optional)</span>
                    <span className={styles.inputWithIcon}>
                      <MapPin size={18} />
                      <input
                        name="regionName"
                        placeholder="z. B. München"
                        maxLength={120}
                      />
                    </span>
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
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setDialogOpen(false)}
                    >
                      {state.status === "success" ? "Schließen" : "Abbrechen"}
                    </button>
                    {state.status !== "success" ? (
                      <button type="submit" disabled={pending}>
                        {pending ? "Wird angelegt …" : "Verein anlegen"}
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
