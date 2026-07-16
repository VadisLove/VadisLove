"use client";

import { useState, type CSSProperties } from "react";
import { Building2, ChevronDown, Users } from "lucide-react";
import type { AccountType } from "@/domain/current-user";
import { getRequestedOrganizationRole } from "@/domain/organization-membership";
import type { OrganizationOverview, OrganizationRole } from "@/domain/models";
import { useI18n } from "@/i18n/i18n-provider";
import { CreateClubOrganizationDialog } from "./create-club-organization-dialog";
import { OrganizationJoinButton } from "./organization-join-button";
import styles from "./page.module.css";

interface MembershipStatus {
  organizationId: string;
  roles: OrganizationRole[];
  pendingRequestedRole: OrganizationRole | null;
}

interface OrganizationHierarchyProps {
  organizations: OrganizationOverview[];
  membershipStatuses: MembershipStatus[];
  accountType: AccountType | null;
  roleLabels: Record<OrganizationRole, string>;
}

/**
 * Stellt die Organisationshierarchie dar und verwaltet das unabhängige
 * Ein-/Ausklappen der Vereine je Landesverband. Alle Berechtigungsdaten werden
 * weiterhin serverseitig geladen; der Client verändert nur die Darstellung.
 */
export function OrganizationHierarchy({
  organizations,
  membershipStatuses,
  accountType,
  roleLabels,
}: OrganizationHierarchyProps) {
  const { t } = useI18n();
  const [collapsedStateIds, setCollapsedStateIds] = useState<Set<string>>(
    () => new Set(),
  );
  const membershipStatusByOrganization = new Map(
    membershipStatuses.map((status) => [status.organizationId, status]),
  );
  const stateOrganizationIds = new Set(
    organizations
      .filter((organization) => organization.level === "state")
      .map((organization) => organization.id),
  );
  const clubsByStateOrganization = new Map<string, OrganizationOverview[]>();

  for (const organization of organizations) {
    if (organization.level !== "club" || !organization.parentId) {
      continue;
    }

    const clubs = clubsByStateOrganization.get(organization.parentId) || [];
    clubs.push(organization);
    clubsByStateOrganization.set(organization.parentId, clubs);
  }

  function toggleStateOrganization(organizationId: string) {
    setCollapsedStateIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(organizationId)) {
        nextIds.delete(organizationId);
      } else {
        nextIds.add(organizationId);
      }
      return nextIds;
    });
  }

  function describeRoles(organization: OrganizationOverview) {
    const roleSummary = Object.entries(organization.roleCounts)
      .filter((entry): entry is [OrganizationRole, number] => Boolean(entry[1]))
      .map(([role, count]) => `${count} ${roleLabels[role]}`);

    return roleSummary.length > 0
      ? roleSummary.join(" · ")
      : t("organization.noRoles");
  }

  function renderOrganizationCard(
    organization: OrganizationOverview,
    stateClubs: OrganizationOverview[] = [],
    stateIsCollapsed = false,
  ) {
    const membershipStatus = membershipStatusByOrganization.get(organization.id);
    const requestedRole = getRequestedOrganizationRole(
      accountType || undefined,
      organization.level,
    );
    const canCreateClub =
      organization.level === "state" &&
      Boolean(membershipStatus?.roles.includes("specialist"));
    const clubListId = `organization-clubs-${organization.id}`;
    const clubLabel =
      stateClubs.length === 1
        ? t("organization.levels.club")
        : t("organization.clubs");
    const clubToggleLabel = t(
      stateIsCollapsed
        ? "organization.showClubs"
        : "organization.hideClubs",
      { count: stateClubs.length, clubLabel },
    );

    return (
      <article
        key={organization.id}
        style={
          {
            "--organization-depth":
              organization.level === "federal"
                ? 0
                : organization.level === "state"
                  ? 1
                  : 2,
          } as CSSProperties
        }
      >
        <span className={styles.icon}>
          <Building2 size={22} />
        </span>
        <div>
          <small>{t(`organization.levels.${organization.level}`)}</small>
          <h2>{organization.name}</h2>
          <p>{describeRoles(organization)}</p>
          {organization.level === "state" && stateClubs.length > 0 ? (
            <button
              type="button"
              className={styles.clubToggleButton}
              aria-expanded={!stateIsCollapsed}
              aria-controls={clubListId}
              aria-label={`${clubToggleLabel}: ${organization.name}`}
              onClick={() => toggleStateOrganization(organization.id)}
            >
              <ChevronDown size={17} aria-hidden="true" />
              <span>{clubToggleLabel}</span>
            </button>
          ) : null}
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
            pendingRoleLabel={
              membershipStatus?.pendingRequestedRole
                ? roleLabels[membershipStatus.pendingRequestedRole]
                : null
            }
          />
          <div className={styles.count}>
            <Users size={17} />
            <strong>{organization.memberCount}</strong>
            <span>{t("organization.memberships")}</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className={styles.hierarchy}>
      {organizations.map((organization) => {
        if (organization.level === "club") {
          return null;
        }

        if (organization.level !== "state") {
          return renderOrganizationCard(organization);
        }

        const stateClubs = clubsByStateOrganization.get(organization.id) || [];
        const stateIsCollapsed = collapsedStateIds.has(organization.id);
        const clubListId = `organization-clubs-${organization.id}`;

        return (
          <div className={styles.organizationGroup} key={organization.id}>
            {renderOrganizationCard(
              organization,
              stateClubs,
              stateIsCollapsed,
            )}
            <div
              id={clubListId}
              className={styles.clubChildren}
              hidden={stateIsCollapsed}
            >
              {stateClubs.map((club) => renderOrganizationCard(club))}
            </div>
          </div>
        );
      })}

      {/* Verwaiste Vereinsdatensätze bleiben sichtbar, statt still zu verschwinden. */}
      {organizations
        .filter(
          (organization) =>
            organization.level === "club" &&
            (!organization.parentId ||
              !stateOrganizationIds.has(organization.parentId)),
        )
        .map((organization) => renderOrganizationCard(organization))}
    </section>
  );
}
