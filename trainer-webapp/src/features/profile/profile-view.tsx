"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  MapPin,
  Medal,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  changeActiveFederation,
  leaveClub,
  scheduleAccountDeletion,
  updateProfile,
  type ProfileActionState,
} from "@/app/profil/actions";
import { PageHeader } from "@/components/ui/page-header";
import {
  accountTypeLabels,
  organizationRoleLabels,
  profileVisibilityLabels,
  type ClubMembership,
  type EligibleFederation,
  type ProfileOverview,
} from "@/domain/profile";
import { ProfilePhotoEditor } from "./profile-photo-editor";
import styles from "./profile-view.module.css";

const initialActionState: ProfileActionState = { status: "idle", message: "" };

function createInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TH";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function AccessibleDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  // Der globale Tastatur-Listener bleibt stabil; die jeweils aktuelle
  // Schließfunktion liegt im Ref und verursacht keinen erneuten Fokuszyklus.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = dialog?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
    );
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={styles.dialogBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" aria-label="Dialog schließen" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function ActionMessage({ state }: { state: ProfileActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={state.status === "error" ? styles.actionError : styles.actionSuccess}
      role={state.status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {state.status === "success" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
      {state.message}
    </p>
  );
}

export function ProfileView({
  profile,
  deleteError,
  restored,
}: {
  profile: ProfileOverview;
  deleteError: string;
  restored: boolean;
}) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateProfile,
    initialActionState,
  );
  const [leaveState, leaveAction, leavePending] = useActionState(
    leaveClub,
    initialActionState,
  );
  const [federationState, federationAction, federationPending] = useActionState(
    changeActiveFederation,
    initialActionState,
  );
  const [leaveTarget, setLeaveTarget] = useState<ClubMembership | null>(null);
  const [federationTarget, setFederationTarget] =
    useState<EligibleFederation | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(Boolean(deleteError));
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const initials = createInitials(profile.displayName);
  const roleLabels = useMemo(
    () => profile.organizationRoles.map((role) => organizationRoleLabels[role]),
    [profile.organizationRoles],
  );

  return (
    <>
      <PageHeader
        title="Mein Profil"
        description="Persönliche Angaben, Vereinsmitgliedschaften und Datenschutz zentral verwalten."
      />

      <div className={styles.profileLayout}>
        {restored ? (
          <div className={styles.successBanner} role="status">
            <CheckCircle2 size={20} />
            Dein Profil wurde vollständig wiederhergestellt.
          </div>
        ) : null}
        {leaveState.message ? <ActionMessage state={leaveState} /> : null}
        {federationState.message ? <ActionMessage state={federationState} /> : null}

        <section className={styles.profileHero} aria-labelledby="profile-name">
          <ProfilePhotoEditor
            userId={profile.id}
            initials={initials}
            initialPath={profile.avatarPath}
            initialUrl={profile.avatarUrl}
          />
          <div className={styles.heroIdentity}>
            <span className={styles.eyebrow}>Trainer Hub Profil</span>
            <h2 id="profile-name">{profile.displayName}</h2>
            <p>{accountTypeLabels[profile.accountType]}</p>
            <div className={styles.heroMeta}>
              {profile.location ? (
                <span><MapPin size={16} />{profile.location}</span>
              ) : null}
              <span><ShieldCheck size={16} />{profileVisibilityLabels[profile.visibility]}</span>
            </div>
          </div>
        </section>

        <form action={profileAction} className={styles.profileForm}>
          <section className={styles.sectionCard} aria-labelledby="personal-heading">
            <header className={styles.sectionHeader}>
              <span><UserRound size={21} /></span>
              <div>
                <h2 id="personal-heading">Persönliche Angaben</h2>
                <p>Diese Angaben beschreiben dich innerhalb des Trainer Hubs.</p>
              </div>
            </header>
            <div className={styles.fieldGrid}>
              <label>
                <span>Vorname</span>
                <input
                  name="firstName"
                  required
                  maxLength={80}
                  defaultValue={profile.firstName}
                  autoComplete="given-name"
                />
              </label>
              <label>
                <span>Nachname</span>
                <input
                  name="lastName"
                  required
                  maxLength={80}
                  defaultValue={profile.lastName}
                  autoComplete="family-name"
                />
              </label>
              <label>
                <span>Telefon <small>optional</small></span>
                <input
                  name="phone"
                  type="tel"
                  maxLength={40}
                  defaultValue={profile.phone}
                  autoComplete="tel"
                />
              </label>
              <label>
                <span>Wohnort oder Region <small>optional</small></span>
                <input
                  name="location"
                  maxLength={120}
                  defaultValue={profile.location}
                  autoComplete="address-level2"
                />
              </label>
              <label className={styles.fullField}>
                <span>Kurzbeschreibung <small>optional</small></span>
                <textarea
                  name="bio"
                  maxLength={1000}
                  rows={4}
                  defaultValue={profile.bio}
                  placeholder="Was sollten andere Mitglieder über dich wissen?"
                />
              </label>
            </div>
          </section>

          <section className={styles.sectionCard} aria-labelledby="sport-heading">
            <header className={styles.sectionHeader}>
              <span><Medal size={21} /></span>
              <div>
                <h2 id="sport-heading">Sportliches Profil</h2>
                <p>Disziplinen mit Komma trennen, zum Beispiel Street, Park, Bowl.</p>
              </div>
            </header>
            <label className={styles.singleField}>
              <span>Disziplinen <small>optional</small></span>
              <input
                name="disciplines"
                maxLength={1200}
                defaultValue={profile.disciplines.join(", ")}
                placeholder="Street, Park, Bowl"
              />
            </label>
          </section>

          <section className={styles.sectionCard} aria-labelledby="privacy-heading">
            <header className={styles.sectionHeader}>
              <span><LockKeyhole size={21} /></span>
              <div>
                <h2 id="privacy-heading">Sichtbarkeit und Datenschutz</h2>
                <p>Lege fest, wer dein Profil im Mitgliederverzeichnis sehen darf.</p>
              </div>
            </header>
            <fieldset className={styles.visibilityOptions}>
              <legend>Profilsichtbarkeit</legend>
              {Object.entries(profileVisibilityLabels).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="visibility"
                    value={value}
                    defaultChecked={profile.visibility === value}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {value === "all_members"
                        ? "Dein Profil ist für angemeldete aktive Mitglieder sichtbar."
                        : value === "contacts"
                          ? "Nur bestätigte Kontakte und zuständige Verantwortliche sehen dein Profil."
                          : "Nur du und betrieblich zuständige Organisationsverantwortliche haben Zugriff."}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          <section className={styles.sectionCard} aria-labelledby="account-heading">
            <header className={styles.sectionHeader}>
              <span><ShieldCheck size={21} /></span>
              <div>
                <h2 id="account-heading">Konto und Rollen</h2>
                <p>Sicherheitsrelevante Daten sind hier bewusst nur lesbar.</p>
              </div>
            </header>
            <div className={styles.readonlyGrid}>
              <div>
                <span>E-Mail-Adresse</span>
                <strong>{profile.email}</strong>
                <small>Änderungen benötigen einen gesonderten sicheren Prozess.</small>
              </div>
              <div>
                <span>Kontotyp</span>
                <strong>{accountTypeLabels[profile.accountType]}</strong>
                <small>Der Kontotyp kann nicht über das Profil geändert werden.</small>
              </div>
              <div className={styles.fullReadonly}>
                <span>Organisationsrollen</span>
                <strong>{roleLabels.join(" · ") || "Keine Organisationsrolle"}</strong>
                <small>Rollen werden ausschließlich von zuständigen Organisationen vergeben.</small>
              </div>
            </div>
          </section>

          <div className={styles.formFooter}>
            <ActionMessage state={profileState} />
            <button className={styles.primaryButton} type="submit" disabled={profilePending}>
              {profilePending ? "Wird gespeichert …" : "Profil speichern"}
            </button>
          </div>
        </form>

        <section className={styles.sectionCard} aria-labelledby="clubs-heading">
          <header className={styles.sectionHeader}>
            <span><Building2 size={21} /></span>
            <div>
              <h2 id="clubs-heading">Meine Vereine</h2>
              <p>Mehrere parallele Vereinsmitgliedschaften bleiben unabhängig voneinander bestehen.</p>
            </div>
          </header>
          <div className={styles.membershipList}>
            {profile.clubMemberships.length > 0 ? profile.clubMemberships.map((membership) => (
              <article key={membership.organizationId} className={styles.membershipCard}>
                <div className={styles.membershipIcon}><Building2 size={21} /></div>
                <div className={styles.membershipMain}>
                  <h3>{membership.clubName}</h3>
                  <p>{membership.federationName}</p>
                  <div className={styles.membershipMeta}>
                    <span className={styles.activeBadge}>Aktiv</span>
                    <span>{membership.roles.map((role) => organizationRoleLabels[role]).join(" · ")}</span>
                    <span>Beitritt {formatDate(membership.joinedAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.leaveButton}
                  onClick={() => setLeaveTarget(membership)}
                >
                  Verein verlassen
                </button>
              </article>
            )) : (
              <div className={styles.emptyState}>
                <Building2 size={26} />
                <p>Du hast noch keine aktive Vereinsmitgliedschaft.</p>
              </div>
            )}
          </div>
          <footer className={styles.sectionFooter}>
            <Link href="/organisation">
              Beitrittsanfrage an neuen Verein stellen <ChevronRight size={18} />
            </Link>
          </footer>
        </section>

        {profile.accountType === "athlete" ? (
          <section
            id="startverband"
            className={styles.sectionCard}
            aria-labelledby="federation-heading"
          >
            <header className={styles.sectionHeader}>
              <span><Medal size={21} /></span>
              <div>
                <h2 id="federation-heading">Mein Startverband</h2>
                <p>Der Verband, für den du offiziell fährst. Es kann immer nur einen aktiven geben.</p>
              </div>
            </header>
            {profile.invalidFederation && !profile.activeFederation ? (
              <div className={styles.warningBanner} role="alert">
                <AlertTriangle size={20} />
                <div>
                  <strong>Dein bisheriger Startverband ist nicht mehr gültig.</strong>
                  <p>
                    Du gehörst keinem aktiven Verein in {profile.invalidFederation.federationName} mehr an.
                    Wähle unten bewusst einen anderen berechtigten Verband.
                  </p>
                </div>
              </div>
            ) : null}
            {profile.activeFederation ? (
              <div className={styles.currentFederation}>
                <span>Aktueller Startverband</span>
                <strong>{profile.activeFederation.federationName}</strong>
                <small>Ausgewählt am {formatDate(profile.activeFederation.selectedAt)}</small>
              </div>
            ) : null}
            <div className={styles.federationOptions}>
              {profile.eligibleFederations.length > 0 ? profile.eligibleFederations.map((federation) => {
                const selected = federation.id === profile.activeFederation?.federationId;
                return (
                  <button
                    key={federation.id}
                    type="button"
                    className={selected ? styles.selectedFederation : styles.federationOption}
                    disabled={selected}
                    onClick={() => setFederationTarget(federation)}
                  >
                    <span>
                      <strong>{federation.name}</strong>
                      <small>Qualifiziert über {federation.qualifyingClubs.join(", ")}</small>
                    </span>
                    {selected ? <CheckCircle2 size={20} /> : <ChevronRight size={20} />}
                  </button>
                );
              }) : (
                <div className={styles.emptyState}>
                  <Medal size={26} />
                  <p>Du benötigst zuerst eine aktive Mitgliedschaft in einem Verein.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        <section
          id="gefahrenbereich"
          className={`${styles.sectionCard} ${styles.dangerCard}`}
          aria-labelledby="danger-heading"
        >
          <header className={styles.sectionHeader}>
            <span><Trash2 size={21} /></span>
            <div>
              <h2 id="danger-heading">Gefahrenbereich</h2>
              <p>Deaktiviere dein Konto mit einer Wiederherstellungsfrist von 30 Tagen.</p>
            </div>
          </header>
          {deleteError ? (
            <p className={styles.deleteError} role="alert">
              <AlertTriangle size={18} />{deleteError}
            </p>
          ) : null}
          <div className={styles.dangerBody}>
            <div>
              <strong>Profil und Konto löschen</strong>
              <p>
                Dein Profil wird sofort unsichtbar und alle Sitzungen werden beendet.
                Nach 30 Tagen werden personenbezogene Daten gelöscht oder anonymisiert.
              </p>
            </div>
            <button type="button" onClick={() => setDeleteOpen(true)}>
              Konto löschen
            </button>
          </div>
        </section>
      </div>

      <AccessibleDialog
        open={Boolean(leaveTarget)}
        title="Verein wirklich verlassen?"
        onClose={() => !leavePending && setLeaveTarget(null)}
      >
        {leaveTarget ? (
          <div className={styles.dialogBody}>
            <div className={styles.dialogWarning}><AlertTriangle size={22} /></div>
            <p>
              Deine Mitgliedschaft in <strong>{leaveTarget.clubName}</strong> wird
              ausdrücklich beendet. Verein und Verband werden benachrichtigt.
            </p>
            {profile.activeFederation?.federationId === leaveTarget.federationId ? (
              <p className={styles.dialogHint}>
                Ist dies dein letzter Verein in diesem Startverband, wird die
                Verbandszugehörigkeit ungültig und kein Ersatz automatisch gewählt.
              </p>
            ) : null}
            <ActionMessage state={leaveState} />
            {leaveState.status === "success" ? (
              <div className={styles.dialogActions}>
                <button type="button" onClick={() => setLeaveTarget(null)}>Schließen</button>
              </div>
            ) : (
              <form action={leaveAction} className={styles.dialogActions}>
                <input type="hidden" name="clubId" value={leaveTarget.organizationId} />
                <button type="button" onClick={() => setLeaveTarget(null)}>Abbrechen</button>
                <button className={styles.confirmDanger} type="submit" disabled={leavePending}>
                  {leavePending ? "Wird beendet …" : "Verein verlassen"}
                </button>
              </form>
            )}
          </div>
        ) : null}
      </AccessibleDialog>

      <AccessibleDialog
        open={Boolean(federationTarget)}
        title="Startverband wechseln?"
        onClose={() => !federationPending && setFederationTarget(null)}
      >
        {federationTarget ? (
          <div className={styles.dialogBody}>
            <div className={styles.dialogWarning}><Medal size={22} /></div>
            <p>
              Du wählst <strong>{federationTarget.name}</strong> als Verband, für den
              du offiziell fährst.
            </p>
            {profile.activeFederation ? (
              <p className={styles.dialogHint}>
                Dein bisheriger Startverband {profile.activeFederation.federationName},
                beide Verbände und betroffene Vereine werden informiert.
              </p>
            ) : null}
            <ActionMessage state={federationState} />
            {federationState.status === "success" ? (
              <div className={styles.dialogActions}>
                <button type="button" onClick={() => setFederationTarget(null)}>Schließen</button>
              </div>
            ) : (
              <form action={federationAction} className={styles.dialogActions}>
                <input type="hidden" name="federationId" value={federationTarget.id} />
                <button type="button" onClick={() => setFederationTarget(null)}>Abbrechen</button>
                <button className={styles.confirmPrimary} type="submit" disabled={federationPending}>
                  {federationPending ? "Wird geändert …" : "Verbindlich auswählen"}
                </button>
              </form>
            )}
          </div>
        ) : null}
      </AccessibleDialog>

      <AccessibleDialog
        open={deleteOpen}
        title="Konto zur Löschung vormerken?"
        onClose={() => setDeleteOpen(false)}
      >
        <form action={scheduleAccountDeletion} className={styles.dialogBody}>
          <div className={styles.dialogWarning}><Trash2 size={22} /></div>
          <p>
            Dein Profil wird sofort deaktiviert und du wirst auf allen Geräten
            abgemeldet. Innerhalb von 30 Tagen kannst du es nach erneuter Anmeldung
            wiederherstellen.
          </p>
          <p className={styles.dialogHint}>
            Bist du die letzte verantwortliche Person einer Organisation, wird die
            Löschung blockiert, bis eine Nachfolge festgelegt ist.
          </p>
          <label className={styles.confirmationField}>
            <span>Zur Bestätigung „LÖSCHEN“ eingeben</span>
            <input
              name="confirmation"
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
          </label>
          <div className={styles.dialogActions}>
            <button type="button" onClick={() => setDeleteOpen(false)}>Abbrechen</button>
            <button
              className={styles.confirmDanger}
              type="submit"
              disabled={deleteConfirmation !== "LÖSCHEN"}
            >
              Profil deaktivieren
            </button>
          </div>
        </form>
      </AccessibleDialog>
    </>
  );
}
