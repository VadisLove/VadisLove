import { Building2, Network, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  getAssignableProfiles,
  getManageableFederalOrganizations,
  getOrganizationOverview,
  getRoleAssignmentOptions,
} from "@/data/supabase-organization-repository";
import type {
  OrganizationOverview,
  OrganizationRole,
} from "@/domain/models";
import { CreateStateOrganizationDialog } from "./create-state-organization-dialog";
import { AssignRolePanel } from "./assign-role-panel";
import { getTranslations } from "@/i18n/server";
import styles from "./page.module.css";

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
    { t },
  ] = await Promise.all([
    getOrganizationOverview(),
    getManageableFederalOrganizations(),
    getAssignableProfiles(),
    getRoleAssignmentOptions(),
    getTranslations(),
  ]);

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
        roleLabel={(role) => t(`organization.roles.${role}`)}
        levelLabel={(level) => t(`organization.levels.${level}`)}
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
          {organizations.map((organization) => (
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
              <div className={styles.count}>
                <Users size={17} />
                <strong>{organization.memberCount}</strong>
                <span>{t("organization.memberships")}</span>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
