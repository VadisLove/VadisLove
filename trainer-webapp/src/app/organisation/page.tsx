import { Network, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  getAssignableProfiles,
  getManageableFederalOrganizations,
  getOwnOrganizationMembershipStatuses,
  getOrganizationOverview,
  getRoleAssignmentOptions,
} from "@/data/supabase-organization-repository";
import type { OrganizationLevel, OrganizationRole } from "@/domain/models";
import { CreateStateOrganizationDialog } from "./create-state-organization-dialog";
import { AssignRolePanel } from "./assign-role-panel";
import { OrganizationHierarchy } from "./organization-hierarchy";
import { getTranslations } from "@/i18n/server";
import { getCurrentUser } from "@/lib/current-user";
import styles from "./page.module.css";

const organizationRoles: OrganizationRole[] = [
  "federal_chair",
  "specialist",
  "federal_trainer",
  "state_trainer",
  "club_trainer",
  "club_board",
  "athlete",
  "guardian",
  "medical",
];

const organizationLevels: OrganizationLevel[] = ["federal", "state", "club"];

/**
 * Zeigt die Organisationshierarchie des MVP.
 *
 * Die Seite macht das spätere Berechtigungsmodell sichtbar: Rollen gelten
 * innerhalb einer Organisationsebene und nicht pauschal für den ganzen Nutzer.
 */
export default async function OrganizationPage() {
  const [
    organizations,
    manageableFederalOrganizations,
    assignableProfiles,
    roleAssignmentOptions,
    ownMembershipStatuses,
    currentUser,
    { t },
  ] = await Promise.all([
    getOrganizationOverview(),
    getManageableFederalOrganizations(),
    getAssignableProfiles(),
    getRoleAssignmentOptions(),
    getOwnOrganizationMembershipStatuses(),
    getCurrentUser(),
    getTranslations(),
  ]);
  // Client Components dürfen keine Server-Funktionen als Props erhalten.
  // Deshalb werden die übersetzten Bezeichnungen hier in einfache,
  // serialisierbare Objekte umgewandelt.
  const roleLabels = Object.fromEntries(
    organizationRoles.map((role) => [
      role,
      t(`organization.roles.${role}`),
    ]),
  ) as Record<OrganizationRole, string>;
  const levelLabels = Object.fromEntries(
    organizationLevels.map((level) => [
      level,
      t(`organization.levels.${level}`),
    ]),
  ) as Record<OrganizationLevel, string>;
  return (
    <>
      <PageHeader
        title={t("organization.title")}
        description={t("organization.description")}
        showContext
      />
      <section className={styles.notice}>
        <ShieldCheck size={24} />
        <div>
          <h2>{t("organization.rolesBoundTitle")}</h2>
          <p>{t("organization.rolesBoundDescription")}</p>
        </div>
      </section>

      {manageableFederalOrganizations.length > 0 ? (
        <CreateStateOrganizationDialog
          federalOrganizations={manageableFederalOrganizations}
        />
      ) : null}

      <AssignRolePanel
        profiles={assignableProfiles}
        organizations={organizations}
        options={roleAssignmentOptions}
        roleLabels={roleLabels}
        levelLabels={levelLabels}
      />

      {organizations.length === 0 ? (
        <section className={styles.emptyState}>
          <span><Network size={28} /></span>
          <div>
            <small>{t("organization.setup")}</small>
            <h2>{t("organization.emptyTitle")}</h2>
            <p>{t("organization.emptyDescription")}</p>
          </div>
        </section>
      ) : (
        <OrganizationHierarchy
          organizations={organizations}
          membershipStatuses={ownMembershipStatuses}
          accountType={currentUser?.accountType || null}
          roleLabels={roleLabels}
        />
      )}
    </>
  );
}
