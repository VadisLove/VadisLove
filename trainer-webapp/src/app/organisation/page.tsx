import { Building2, Network, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  getAssignableProfiles,
  getManageableFederalOrganizations,
  getOwnOrganizationMembershipStatuses,
  getOrganizationOverview,
  getRoleAssignmentOptions,
} from "@/data/supabase-organization-repository";
import { getRequestedOrganizationRole } from "@/domain/organization-membership";
import type {
  OrganizationLevel,
  OrganizationOverview,
  OrganizationRole,
} from "@/domain/models";
import { CreateStateOrganizationDialog } from "./create-state-organization-dialog";
import { CreateClubOrganizationDialog } from "./create-club-organization-dialog";
import { AssignRolePanel } from "./assign-role-panel";
import { OrganizationJoinButton } from "./organization-join-button";
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

function describeRoles(
  organization: OrganizationOverview,
  t: (key: string) => string,
) {
  const roleSummary = Object.entries(organization.roleCounts)
    .filter((entry): entry is [OrganizationRole, number] => Boolean(entry[1]))
    .map(([role, count]) => `${count} ${t(`organization.roles.${role}`)}`);

  return roleSummary.length > 0
    ? roleSummary.join(" · ")
    : t("organization.noRoles");
}

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
  const membershipStatusByOrganization = new Map(
    ownMembershipStatuses.map((status) => [status.organizationId, status]),
  );

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
        <section className={styles.hierarchy}>
          {organizations.map((organization) => {
            const membershipStatus = membershipStatusByOrganization.get(
              organization.id,
            );
            const requestedRole = currentUser
              ? getRequestedOrganizationRole(
                  currentUser.accountType,
                  organization.level,
                )
              : null;
            const canCreateClub =
              organization.level === "state" &&
              Boolean(membershipStatus?.roles.includes("specialist"));

            return (
              <article
                key={organization.id}
                style={{ "--organization-depth": organization.level === "federal" ? 0 : organization.level === "state" ? 1 : 2 } as React.CSSProperties}
              >
                <span className={styles.icon}><Building2 size={22} /></span>
                <div>
                  <small>{t(`organization.levels.${organization.level}`)}</small>
                  <h2>{organization.name}</h2>
                  <p>{describeRoles(organization, t)}</p>
                </div>
                <div className={styles.cardAside}>
                  {canCreateClub ? (
                    <CreateClubOrganizationDialog
                      stateOrganizationId={organization.id}
                      stateOrganizationName={organization.name}
                    />
                  ) : null}
                  <OrganizationJoinButton
                    organizationId={organization.id}
                    organizationName={organization.name}
                    requestedRole={requestedRole}
                    requestedRoleLabel={requestedRole ? roleLabels[requestedRole] : null}
                    memberRoleLabels={(membershipStatus?.roles || []).map(
                      (role) => roleLabels[role],
                    )}
                    pendingRoleLabel={membershipStatus?.pendingRequestedRole
                      ? roleLabels[membershipStatus.pendingRequestedRole]
                      : null}
                  />
                  <div className={styles.count}>
                    <Users size={17} />
                    <strong>{organization.memberCount}</strong>
                    <span>{t("organization.memberships")}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
