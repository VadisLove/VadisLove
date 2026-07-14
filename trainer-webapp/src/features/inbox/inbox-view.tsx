"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Building2,
  Check,
  Clock3,
  Inbox,
  Send,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  createMembershipRequest,
  createSocialGroup,
  inviteToGroup,
  respondGroupInvitation,
  respondRelationshipRequest,
  reviewMembershipRequest,
  withdrawRelationshipRequest,
  type InboxActionState,
} from "@/app/postfach/actions";
import { useCurrentUser } from "@/components/auth/current-user-context";
import { PageHeader } from "@/components/ui/page-header";
import type { AccountType } from "@/domain/current-user";
import type {
  GroupInvitation,
  InboxOverview,
  MembershipInboxRequest,
  OrganizationRole,
  RelationshipRequest,
} from "@/domain/models";
import styles from "./inbox-view.module.css";

type InboxTab = "incoming" | "outgoing" | "groups" | "organizations";

const initialState: InboxActionState = { status: "idle", message: "" };

const relationshipLabels = {
  friend: "Freundschaft",
  trainer_athlete: "Trainer–Athlet",
  guardian: "Elternverknüpfung",
} as const;

const statusLabels = {
  pending: "Offen",
  approved: "Angenommen",
  rejected: "Abgelehnt",
  withdrawn: "Zurückgezogen",
} as const;

const organizationRoleLabels: Record<OrganizationRole, string> = {
  federal_chair: "Bundesvorsitz",
  specialist: "Fachwart/in",
  federal_trainer: "Bundestrainer/in",
  state_trainer: "Landestrainer/in",
  club_trainer: "Vereinstrainer/in",
  club_board: "Vereinsvorstand",
  athlete: "Athlet/in",
  guardian: "Erziehungsberechtigte/r",
  medical: "Medizinische Fachkraft",
};

/**
 * Leitet aus Kontotyp und Organisationsebene die passende Beitrittsrolle ab.
 * Mächtige Verwaltungsrollen werden nur beantragt und müssen weiterhin durch
 * eine bereits berechtigte Person bestätigt werden.
 */
function getRequestedOrganizationRole(
  accountType: AccountType | undefined,
  level: InboxOverview["organizations"][number]["level"],
): OrganizationRole | null {
  if (accountType === "trainer") {
    if (level === "federal") return "federal_trainer";
    if (level === "state") return "state_trainer";
    return "club_trainer";
  }

  if (accountType === "organization_staff") {
    if (level === "federal") return "federal_chair";
    if (level === "state") return "specialist";
    return "club_board";
  }

  if (accountType === "medical") return "medical";
  if (accountType === "athlete" && level === "club") return "athlete";
  if (accountType === "guardian" && level === "club") return "guardian";

  return null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

/**
 * Gemeinsames Postfach fuer Kontakte, Gruppen und Organisationsbeitritte.
 * Jede Mutation sitzt in einer kleinen Unterkomponente und hat dadurch einen
 * eigenen Lade- und Fehlerzustand.
 */
export function InboxView({ overview }: { overview: InboxOverview }) {
  const currentUser = useCurrentUser();
  const [tab, setTab] = useState<InboxTab>("incoming");
  const incomingRelationships = overview.relationshipRequests.filter(
    (request) => request.direction === "incoming",
  );
  const outgoingRelationships = overview.relationshipRequests.filter(
    (request) => request.direction === "outgoing",
  );
  const incomingGroups = overview.groupInvitations.filter(
    (invitation) => invitation.direction === "incoming",
  );
  const outgoingGroups = overview.groupInvitations.filter(
    (invitation) => invitation.direction === "outgoing",
  );
  const incomingMemberships = overview.membershipRequests.filter(
    (request) => request.direction === "incoming",
  );
  const outgoingMemberships = overview.membershipRequests.filter(
    (request) => request.direction === "outgoing",
  );
  const incomingCount = [...incomingRelationships, ...incomingGroups, ...incomingMemberships]
    .filter((item) => item.status === "pending").length;
  const manageableGroups = overview.groups.filter((group) =>
    ["owner", "admin"].includes(group.role),
  );

  const joinableOrganizations = useMemo(
    () => overview.organizations.filter((organization) =>
      getRequestedOrganizationRole(
        currentUser?.accountType,
        organization.level,
      ) !== null,
    ),
    [currentUser?.accountType, overview.organizations],
  );

  return (
    <>
      <PageHeader
        title="Postfach"
        description="Anfragen, Gruppen und Beitritte an einem Ort verwalten."
        showContext
      />

      <section className={styles.summary}>
        <article>
          <span><Inbox size={20} /></span>
          <div><strong>{incomingCount}</strong><small>offene Eingänge</small></div>
        </article>
        <article>
          <span><Send size={20} /></span>
          <div><strong>{outgoingRelationships.filter((item) => item.status === "pending").length}</strong><small>gesendete Anfragen</small></div>
        </article>
        <article>
          <span><UsersRound size={20} /></span>
          <div><strong>{overview.groups.length}</strong><small>aktive Gruppen</small></div>
        </article>
      </section>

      <nav className={styles.tabs} aria-label="Postfachbereiche">
        {([
          ["incoming", `Eingang${incomingCount ? ` (${incomingCount})` : ""}`],
          ["outgoing", "Gesendet"],
          ["groups", "Gruppen"],
          ["organizations", "Vereine & Verbände"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={tab === value ? styles.activeTab : ""}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "incoming" ? (
        <RequestSection title="Kontaktanfragen" icon={<UserPlus size={19} />}>
          {incomingRelationships.map((request) => (
            <RelationshipRequestCard key={request.id} request={request} />
          ))}
          {incomingRelationships.length === 0 ? <EmptyMessage text="Keine Kontaktanfragen vorhanden." /> : null}
          {incomingGroups.map((invitation) => (
            <GroupInvitationCard key={invitation.id} invitation={invitation} />
          ))}
          {incomingMemberships.map((request) => (
            <MembershipRequestCard key={request.id} request={request} />
          ))}
        </RequestSection>
      ) : null}

      {tab === "outgoing" ? (
        <RequestSection title="Gesendete Anfragen" icon={<Send size={19} />}>
          {outgoingRelationships.map((request) => (
            <RelationshipRequestCard key={request.id} request={request} />
          ))}
          {outgoingGroups.map((invitation) => (
            <GroupInvitationCard key={invitation.id} invitation={invitation} />
          ))}
          {outgoingMemberships.map((request) => (
            <MembershipRequestCard key={request.id} request={request} />
          ))}
          {outgoingRelationships.length + outgoingGroups.length + outgoingMemberships.length === 0 ? (
            <EmptyMessage text="Du hast noch keine Anfragen verschickt." />
          ) : null}
        </RequestSection>
      ) : null}

      {tab === "groups" ? (
        <div className={styles.twoColumns}>
          <GroupList groups={overview.groups} />
          <div className={styles.formStack}>
            <CreateGroupForm />
            <InviteGroupForm
              groups={manageableGroups}
              people={overview.people}
            />
          </div>
        </div>
      ) : null}

      {tab === "organizations" ? (
        <div className={styles.twoColumns}>
          <RequestSection title="Meine Beitrittsanfragen" icon={<Clock3 size={19} />}>
            {outgoingMemberships.map((request) => (
              <MembershipRequestCard key={request.id} request={request} />
            ))}
            {outgoingMemberships.length === 0 ? <EmptyMessage text="Noch keine Beitrittsanfragen." /> : null}
          </RequestSection>
          {currentUser && joinableOrganizations.length > 0 ? (
            <MembershipRequestForm
              organizations={joinableOrganizations}
              accountType={currentUser.accountType}
            />
          ) : (
            <section className={styles.formCard}>
              <Building2 size={22} />
              <h2>Organisation beitreten</h2>
              <p>Für deinen Kontotyp wird eine Rolle direkt durch die Organisation vergeben.</p>
            </section>
          )}
        </div>
      ) : null}
    </>
  );
}

function RequestSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.requestSection}>
      <header>{icon}<h2>{title}</h2></header>
      <div className={styles.requestList}>{children}</div>
    </section>
  );
}

function RelationshipRequestCard({ request }: { request: RelationshipRequest }) {
  const action = request.direction === "incoming"
    ? respondRelationshipRequest
    : withdrawRelationshipRequest;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <article className={styles.requestCard}>
      <span className={styles.avatar}>{request.otherPerson.initials}</span>
      <div className={styles.requestText}>
        <strong>{request.otherPerson.name}</strong>
        <span>{relationshipLabels[request.relationshipType]} · {formatDate(request.createdAt)}</span>
        {state.message ? <small className={state.status === "error" ? styles.error : styles.success}>{state.message}</small> : null}
      </div>
      <span className={`${styles.status} ${styles[request.status]}`}>{statusLabels[request.status]}</span>
      {request.status === "pending" ? (
        <form action={formAction} className={styles.cardActions}>
          <input type="hidden" name="requestId" value={request.id} />
          {request.direction === "incoming" ? (
            <>
              <button name="status" value="approved" disabled={pending} className={styles.accept}><Check size={15} /> Annehmen</button>
              <button name="status" value="rejected" disabled={pending} className={styles.reject}><X size={15} /> Ablehnen</button>
            </>
          ) : (
            <button disabled={pending} className={styles.reject}><X size={15} /> Zurückziehen</button>
          )}
        </form>
      ) : null}
    </article>
  );
}

function GroupInvitationCard({ invitation }: { invitation: GroupInvitation }) {
  const [state, action, pending] = useActionState(respondGroupInvitation, initialState);

  return (
    <article className={styles.requestCard}>
      <span className={styles.groupAvatar}><UsersRound size={18} /></span>
      <div className={styles.requestText}>
        <strong>{invitation.groupName}</strong>
        <span>{invitation.direction === "incoming" ? `${invitation.actorName} hat dich eingeladen` : `Einladung an ${invitation.actorName}`} · {formatDate(invitation.createdAt)}</span>
        {state.message ? <small>{state.message}</small> : null}
      </div>
      <span className={`${styles.status} ${styles[invitation.status]}`}>{statusLabels[invitation.status]}</span>
      {invitation.direction === "incoming" && invitation.status === "pending" ? (
        <form action={action} className={styles.cardActions}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <button name="status" value="approved" disabled={pending} className={styles.accept}><Check size={15} /> Beitreten</button>
          <button name="status" value="rejected" disabled={pending} className={styles.reject}><X size={15} /> Ablehnen</button>
        </form>
      ) : null}
    </article>
  );
}

function MembershipRequestCard({ request }: { request: MembershipInboxRequest }) {
  const [state, action, pending] = useActionState(reviewMembershipRequest, initialState);

  return (
    <article className={styles.requestCard}>
      <span className={styles.groupAvatar}><Building2 size={18} /></span>
      <div className={styles.requestText}>
        <strong>{request.direction === "incoming" ? request.userName : request.organizationName}</strong>
        <span>{request.direction === "incoming" ? `möchte ${request.organizationName} beitreten` : "Beitrittsanfrage"} · {formatDate(request.createdAt)}</span>
        {request.note ? <small>„{request.note}“</small> : null}
        {state.message ? <small>{state.message}</small> : null}
      </div>
      <span className={`${styles.status} ${styles[request.status]}`}>{statusLabels[request.status]}</span>
      {request.direction === "incoming" && request.status === "pending" ? (
        <form action={action} className={styles.cardActions}>
          <input type="hidden" name="requestId" value={request.id} />
          <button name="status" value="approved" disabled={pending} className={styles.accept}><Check size={15} /> Bestätigen</button>
          <button name="status" value="rejected" disabled={pending} className={styles.reject}><X size={15} /> Ablehnen</button>
        </form>
      ) : null}
    </article>
  );
}

function GroupList({ groups }: { groups: InboxOverview["groups"] }) {
  return (
    <RequestSection title="Meine Gruppen" icon={<UsersRound size={19} />}>
      {groups.map((group) => (
        <article key={group.id} className={styles.groupCard}>
          <span><UsersRound size={20} /></span>
          <div><strong>{group.name}</strong><small>{group.description || "Gemeinsamer Kalender und Aktivitäten"}</small></div>
          <em>{group.memberCount} Mitglieder</em>
        </article>
      ))}
      {groups.length === 0 ? <EmptyMessage text="Erstelle deine erste Gruppe." /> : null}
    </RequestSection>
  );
}

function CreateGroupForm() {
  const [state, action, pending] = useActionState(createSocialGroup, initialState);
  return (
    <form action={action} className={styles.formCard}>
      <UsersRound size={22} />
      <h2>Neue Gruppe</h2>
      <p>Für Freundeskreise, Teams oder gemeinsame Trainings.</p>
      <label>Name<input name="name" minLength={2} maxLength={80} required /></label>
      <label>Beschreibung<textarea name="description" maxLength={500} rows={3} /></label>
      <button type="submit" disabled={pending}>{pending ? "Wird erstellt ..." : "Gruppe erstellen"}</button>
      {state.message ? <small>{state.message}</small> : null}
    </form>
  );
}

function InviteGroupForm({ groups, people }: { groups: InboxOverview["groups"]; people: InboxOverview["people"] }) {
  const [state, action, pending] = useActionState(inviteToGroup, initialState);
  return (
    <form action={action} className={styles.formCard}>
      <UserPlus size={22} />
      <h2>Person einladen</h2>
      <p>Nur Besitzer und Gruppen-Admins können Einladungen senden.</p>
      <label>Gruppe<select name="groupId" required disabled={groups.length === 0}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <label>Person<select name="invitedUserId" required disabled={people.length === 0}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <button type="submit" disabled={pending || groups.length === 0 || people.length === 0}>{pending ? "Wird gesendet ..." : "Einladung senden"}</button>
      {state.message ? <small>{state.message}</small> : null}
    </form>
  );
}

function MembershipRequestForm({
  organizations,
  accountType,
}: {
  organizations: InboxOverview["organizations"];
  accountType: AccountType;
}) {
  const [state, action, pending] = useActionState(createMembershipRequest, initialState);
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id || "",
  );
  const selectedOrganization = organizations.find(
    (organization) => organization.id === organizationId,
  );
  const requestedRole = selectedOrganization
    ? getRequestedOrganizationRole(accountType, selectedOrganization.level)
    : null;

  return (
    <form action={action} className={styles.formCard}>
      <Building2 size={22} />
      <h2>Organisation beitreten</h2>
      <p>Die zuständige Verwaltung erhält deine Anfrage im Postfach.</p>
      <input type="hidden" name="requestedRole" value={requestedRole || ""} />
      <label>
        Verein oder Verband
        <select
          name="organizationId"
          value={organizationId}
          onChange={(event) => setOrganizationId(event.target.value)}
          required
          disabled={organizations.length === 0}
        >
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>
      {requestedRole ? (
        <p>Beantragte Rolle: <strong>{organizationRoleLabels[requestedRole]}</strong></p>
      ) : null}
      <label>Nachricht<textarea name="note" maxLength={500} rows={4} placeholder="Kurze Vorstellung oder Rückfrage ..." /></label>
      <button type="submit" disabled={pending || !requestedRole}>{pending ? "Wird gesendet ..." : "Beitritt anfragen"}</button>
      {state.message ? <small>{state.message}</small> : null}
    </form>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <div className={styles.empty}><Inbox size={24} /><span>{text}</span></div>;
}
