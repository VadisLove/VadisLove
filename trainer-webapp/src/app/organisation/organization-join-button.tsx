"use client";

import { useActionState } from "react";
import { BadgeCheck, Clock3, LoaderCircle, UserPlus } from "lucide-react";
import {
  createMembershipRequest,
  type InboxActionState,
} from "@/app/postfach/actions";
import type { OrganizationRole } from "@/domain/models";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./page.module.css";

const initialState: InboxActionState = { status: "idle", message: "" };

interface OrganizationJoinButtonProps {
  organizationId: string;
  organizationName: string;
  requestedRole: OrganizationRole | null;
  requestedRoleLabel: string | null;
  memberRoleLabels: string[];
  pendingRoleLabel: string | null;
}

/**
 * Stellt den Beitritt direkt an der Organisationskarte bereit. Der sichtbare
 * Zustand folgt den serverseitig geladenen Mitgliedschaften und Anfragen;
 * eine erfolgreiche Aktion wird zusätzlich sofort lokal bestätigt.
 */
export function OrganizationJoinButton({
  organizationId,
  organizationName,
  requestedRole,
  requestedRoleLabel,
  memberRoleLabels,
  pendingRoleLabel,
}: OrganizationJoinButtonProps) {
  const { t } = useI18n();
  const [state, action, submitting] = useActionState(
    createMembershipRequest,
    initialState,
  );
  const requestIsPending = Boolean(pendingRoleLabel) || state.status === "success";
  const visiblePendingRole = pendingRoleLabel || requestedRoleLabel;

  if (memberRoleLabels.length > 0) {
    return (
      <div className={`${styles.joinStatus} ${styles.joinStatusConfirmed}`}>
        <BadgeCheck size={17} aria-hidden="true" />
        <span>{t("organization.member")}</span>
        <small>{memberRoleLabels.join(" · ")}</small>
      </div>
    );
  }

  if (requestIsPending) {
    return (
      <div className={`${styles.joinStatus} ${styles.joinStatusPending}`}>
        <Clock3 size={17} aria-hidden="true" />
        <span>{t("organization.requestPending")}</span>
        {visiblePendingRole ? <small>{visiblePendingRole}</small> : null}
      </div>
    );
  }

  if (!requestedRole || !requestedRoleLabel) {
    return (
      <div className={styles.joinUnavailable}>
        {t("organization.noCompatibleRole")}
      </div>
    );
  }

  return (
    <form action={action} className={styles.joinForm}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <button
        type="submit"
        disabled={submitting}
        aria-label={t("organization.joinAria", { organization: organizationName })}
      >
        {submitting ? (
          <LoaderCircle className={styles.spin} size={17} aria-hidden="true" />
        ) : (
          <UserPlus size={17} aria-hidden="true" />
        )}
        {submitting
          ? t("organization.requesting")
          : t("organization.requestJoin")}
      </button>
      <small>
        {t("organization.requestAs", { role: requestedRoleLabel })}
      </small>
      {state.status === "error" ? (
        <span className={styles.joinError} role="alert" aria-live="polite">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
