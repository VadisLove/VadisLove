"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Dumbbell, FilterX, Handshake, Mail, Search, ShieldCheck, UserPlus } from "lucide-react";
import type { Person, RelationshipType } from "@/domain/models";
import type { InvitationRole } from "@/domain/invitation-permissions";
import {
  invitePerson,
  sendRelationshipRequest,
  type InvitePersonState,
  type RelationshipActionState,
} from "@/app/personen/actions";
import { useCurrentUser } from "@/components/auth/current-user-context";
import { PageHeader } from "@/components/ui/page-header";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./people-view.module.css";

const initialInviteState: InvitePersonState = {
  status: "idle",
  message: "",
};

type ActivityFilter =
  | "all"
  | "trainer"
  | "athlete"
  | "guardian"
  | "organization_staff"
  | "medical";

function matchesActivity(person: Person, filter: ActivityFilter) {
  if (filter === "all") {
    return true;
  }

  const roles = person.roles || [];

  if (filter === "trainer") {
    return (
      person.accountType === "trainer" ||
      roles.some((role) =>
        ["federal_trainer", "state_trainer", "club_trainer"].includes(role),
      )
    );
  }

  if (filter === "organization_staff") {
    return (
      person.accountType === "organization_staff" ||
      roles.some((role) =>
        ["federal_chair", "specialist", "club_board"].includes(role),
      )
    );
  }

  return person.accountType === filter || roles.includes(filter);
}

/**
 * Suche und Einladung für Trainer, Athleten und Fachkräfte.
 *
 * Die Suche nutzt Name, E-Mail, Rolle und Region. Dadurch kann dieselbe Logik
 * später serverseitig als Volltextsuche oder Supabase-Query umgesetzt werden.
 */
export function PeopleView({
  people,
  inviteRoles,
}: {
  people: Person[];
  inviteRoles: InvitationRole[];
}) {
  const { t } = useI18n();
  const currentUser = useCurrentUser();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [clubFilter, setClubFilter] = useState("all");
  const [activityFilter, setActivityFilter] =
    useState<ActivityFilter>("all");
  const [inviteState, inviteAction] = useActionState(
    invitePerson,
    initialInviteState,
  );
  const canInvite = inviteRoles.length > 0;

  const states = useMemo(
    () =>
      Array.from(new Set(people.flatMap((person) => person.states || []))).sort(),
    [people],
  );
  const clubs = useMemo(
    () =>
      Array.from(new Set(people.flatMap((person) => person.clubs || []))).sort(),
    [people],
  );
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return people.filter((person) => {
      const searchMatches =
        !normalizedQuery ||
        `${person.name} ${person.email} ${person.role} ${person.region}`
          .toLowerCase()
          .includes(normalizedQuery);
      const stateMatches =
        stateFilter === "all" || person.states?.includes(stateFilter);
      const clubMatches =
        clubFilter === "all" || person.clubs?.includes(clubFilter);

      return (
        searchMatches &&
        stateMatches &&
        clubMatches &&
        matchesActivity(person, activityFilter)
      );
    });
  }, [activityFilter, clubFilter, people, query, stateFilter]);

  return (
    <>
      <PageHeader
        title={t("people.title")}
        description={t("people.description")}
        showContext
      />
      <section className={styles.inviteBox}>
        <div>
          <UserPlus size={24} />
          <div>
            <h2>{t("people.inviteTitle")}</h2>
            <p>{t("people.inviteDescription")}</p>
          </div>
        </div>
        <form action={inviteAction}>
          <label>
            <Mail size={17} />
            <input
              name="email"
              type="email"
              placeholder="name@verein.de"
              disabled={!canInvite}
              required
            />
          </label>
          <select
            name="targetRole"
            aria-label={t("people.inviteRole")}
            disabled={!canInvite}
            required
          >
            {inviteRoles.map((role) => (
              <option key={role} value={role}>
                {t(`organization.roles.${role}`)}
              </option>
            ))}
          </select>
          <InviteSubmitButton disabled={!canInvite} label={t("people.invite")} />
        </form>
        {!canInvite ? (
          <p className={styles.notice}>{t("people.noInvitePermission")}</p>
        ) : null}
        {inviteState.message ? (
          <p className={styles.notice}>{inviteState.message}</p>
        ) : null}
        {inviteState.inviteLink ? (
          <p className={styles.inviteLink}>
            <span>{t("people.inviteLink")}</span>
            <a href={inviteState.inviteLink}>{inviteState.inviteLink}</a>
          </p>
        ) : null}
      </section>
      <section className={styles.filters}>
        <label className={styles.search}>
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("people.searchPlaceholder")}
          />
        </label>
        <label>
          {t("people.stateFilter")}
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
          >
            <option value="all">{t("common.all")}</option>
            {states.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </label>
        <label>
          {t("people.clubFilter")}
          <select
            value={clubFilter}
            onChange={(event) => setClubFilter(event.target.value)}
          >
            <option value="all">{t("common.all")}</option>
            {clubs.map((club) => (
              <option key={club} value={club}>{club}</option>
            ))}
          </select>
        </label>
        <label>
          {t("people.activityFilter")}
          <select
            value={activityFilter}
            onChange={(event) =>
              setActivityFilter(event.target.value as ActivityFilter)
            }
          >
            <option value="all">{t("common.all")}</option>
            <option value="trainer">{t("accountTypes.trainer")}</option>
            <option value="athlete">{t("accountTypes.athlete")}</option>
            <option value="guardian">{t("accountTypes.guardian")}</option>
            <option value="organization_staff">
              {t("accountTypes.organization_staff")}
            </option>
            <option value="medical">{t("accountTypes.medical")}</option>
          </select>
        </label>
        <button
          type="button"
          className={styles.resetFilters}
          onClick={() => {
            setQuery("");
            setStateFilter("all");
            setClubFilter("all");
            setActivityFilter("all");
          }}
          aria-label={t("people.resetFilters")}
        >
          <FilterX size={18} />
        </button>
      </section>
      <section className={styles.peopleGrid}>
        {results.map((person) => (
          <article key={person.id}>
            <span className={styles.avatar}>{person.initials}</span>
            <div>
              <h2>{person.name}</h2>
              <p>{person.email || "E-Mail nach Bestätigung sichtbar"}</p>
            </div>
            <span className={styles.role}>{person.role}</span>
            <small>{person.region}</small>
            {person.roles && person.roles.length > 0 ? (
              <p className={styles.roleDetails}>
                {person.roles
                  .map((role) => t(`organization.roles.${role}`))
                  .join(" · ")}
              </p>
            ) : null}
            <div className={styles.relationshipActions}>
              <RelationshipActionButton
                person={person}
                relationshipType="friend"
                label="Freundschaft"
                icon={<Handshake size={15} />}
              />
              {(
                currentUser?.accountType === "trainer" && person.accountType === "athlete"
              ) || (
                currentUser?.accountType === "athlete" && person.accountType === "trainer"
              ) ? (
                <RelationshipActionButton
                  person={person}
                  relationshipType="trainer_athlete"
                  label={currentUser.accountType === "trainer" ? "Als Athlet anfragen" : "Als Trainer anfragen"}
                  icon={<Dumbbell size={15} />}
                />
              ) : null}
              {(
                currentUser?.accountType === "guardian" && person.accountType === "athlete"
              ) || (
                currentUser?.accountType === "athlete" && person.accountType === "guardian"
              ) ? (
                <RelationshipActionButton
                  person={person}
                  relationshipType="guardian"
                  label="Als Familie verknüpfen"
                  icon={<ShieldCheck size={15} />}
                />
              ) : null}
            </div>
          </article>
        ))}
      </section>
      {results.length === 0 ? (
        <p className={styles.emptyResults}>{t("people.noResults")}</p>
      ) : null}
    </>
  );
}

const initialRelationshipState: RelationshipActionState = {
  status: "idle",
  message: "",
};

/** Eine eigenstaendige Action-Instanz pro Karte verhindert geteilte Ladezustände. */
function RelationshipActionButton({
  person,
  relationshipType,
  label,
  icon,
}: {
  person: Person;
  relationshipType: RelationshipType;
  label: string;
  icon: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(
    sendRelationshipRequest,
    initialRelationshipState,
  );
  const active = person.activeRelationships?.includes(relationshipType);
  const sent = person.pendingSent?.includes(relationshipType) || state.status === "success";
  const received = person.pendingReceived?.includes(relationshipType);

  if (active) {
    return <span className={styles.connected}>{icon} Verbunden</span>;
  }

  if (received) {
    return <Link href="/postfach" className={styles.answerRequest}>{icon} Anfrage beantworten</Link>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="recipientUserId" value={person.id} />
      <input type="hidden" name="recipientAccountType" value={person.accountType || "unspecified"} />
      <input type="hidden" name="relationshipType" value={relationshipType} />
      <button type="submit" disabled={Boolean(sent || pending)} title={state.message || label}>
        {icon}
        {pending ? "Wird gesendet ..." : sent ? "Anfrage gesendet" : label}
      </button>
    </form>
  );
}

function InviteSubmitButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={disabled || pending}>
      {pending ? "..." : label}
    </button>
  );
}
