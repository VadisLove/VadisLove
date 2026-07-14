"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  Share2,
  Users,
} from "lucide-react";
import type {
  AttendanceStatus,
  CalendarEvent,
  Region,
  TrainingPlan,
} from "@/domain/models";
import { inviteEventParticipant } from "@/app/kalender/actions";
import { formatShortDate } from "@/lib/event-display";
import { PageHeader } from "@/components/ui/page-header";
import { useCurrentUser } from "@/components/auth/current-user-context";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./dashboard.module.css";

interface DashboardProps {
  events: CalendarEvent[];
  plans: TrainingPlan[];
  regions: Region[];
}

/**
 * Erstellt kompakte Avatar-Initialen auch für eingeladene Personen, deren
 * Profil noch nicht vollständig angelegt ist.
 */
function createInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TH";
}

/**
 * People-First-Dashboard des MVP.
 *
 * Die Daten werden serverseitig geladen und hier nur für lokale UI-Zustände
 * weiterverwendet. Die Teilnahme-Liste gehört immer zum nächsten Termin, der
 * direkt darüber angezeigt wird. Neue Einladungen werden per Server Action
 * dauerhaft in Supabase gespeichert.
 */
export function Dashboard({ events, plans, regions }: DashboardProps) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { dictionary, locale, t } = useI18n();
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceStatus | "all">("all");
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [invitePending, startInviteTransition] = useTransition();

  const nextEvent = events[0];
  const eventParticipants = useMemo(
    () => nextEvent?.participants ?? [],
    [nextEvent],
  );
  const visibleParticipants = useMemo(
    () => attendanceFilter === "all"
      ? eventParticipants
      : eventParticipants.filter(
          (participant) => participant.status === attendanceFilter,
        ),
    [attendanceFilter, eventParticipants],
  );

  /** Speichert eine echte Einladung für den oben angezeigten Supabase-Termin. */
  function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!nextEvent) {
      setFeedback(t("dashboard.noEventParticipants"));
      return;
    }

    if (!email.includes("@")) {
      setFeedback(t("dashboard.invalidEmail"));
      return;
    }

    startInviteTransition(async () => {
      const result = await inviteEventParticipant(nextEvent.id, email);
      setFeedback(result.message);

      if (result.status === "success") {
        setEmail("");
        router.refresh();
      }
    });
  }

  return (
    <>
      <PageHeader
        title={t("dashboard.greeting", { name: currentUser?.displayName || t("common.appName") })}
        description={t("dashboard.description")}
        showContext
      />

      {nextEvent ? (
        <section className={styles.nextEvent}>
          <div>
            <span>{t("dashboard.nextEvent")}</span>
            <strong>{nextEvent.startTime}</strong>
            <small>
              {formatShortDate(nextEvent.date, locale)} · {nextEvent.endTime}
            </small>
          </div>
          <div className={styles.nextEventDetails}>
            <h2>{nextEvent.title}</h2>
            <p><MapPin size={17} /> {nextEvent.location}</p>
            <div>
              <span>{t(`eventTypes.${nextEvent.type}`)}</span>
              {nextEvent.region ? <span>{nextEvent.region}</span> : null}
            </div>
          </div>
          <div className={styles.capacity}>
            <CalendarDays size={23} />
            <strong>{formatShortDate(nextEvent.date, locale)}</strong>
            <small>{nextEvent.startTime} – {nextEvent.endTime}</small>
          </div>
          <Link href="/kalender" className={styles.primaryButton}>
            {t("dashboard.openCalendar")}
            <ArrowRight size={18} />
          </Link>
        </section>
      ) : (
        <section className={`${styles.nextEvent} ${styles.emptyNextEvent}`}>
          <CalendarDays size={34} />
          <div className={styles.nextEventDetails}>
            <span>{t("dashboard.nextEvent")}</span>
            <h2>{t("dashboard.noUpcomingEvents")}</h2>
            <p>{t("dashboard.noUpcomingEventsDescription")}</p>
          </div>
          <Link href="/kalender" className={styles.primaryButton}>
            {t("dashboard.openCalendar")}
            <ArrowRight size={18} />
          </Link>
        </section>
      )}

      <div className={styles.dashboardGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><CalendarDays size={19} /> {t("dashboard.schedule")}</h2>
            <Link href="/kalender">{t("dashboard.showAll")}</Link>
          </div>
          <div className={styles.agenda}>
            {events.slice(0, 5).map((event) => (
              <article key={event.id} className={styles.agendaItem}>
                <div className={styles.time}>
                  <strong>{event.startTime}</strong>
                  <span>{event.endTime}</span>
                </div>
                <span className={`${styles.typeDot} ${styles[event.type]}`} />
                <div>
                  <small>{formatShortDate(event.date, locale)} · {t(`eventTypes.${event.type}`)}</small>
                  <h3>{event.title}</h3>
                  <p><MapPin size={13} /> {event.location}</p>
                </div>
                <strong className={styles.agendaCapacity}>{event.confirmed}/{event.capacity}</strong>
              </article>
            ))}
            {events.length === 0 ? (
              <div className={styles.emptyAgenda}>
                <CalendarDays size={24} />
                <p>{t("dashboard.noUpcomingEvents")}</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Users size={19} /> {t("dashboard.participation")}</h2>
            {nextEvent ? <span title={nextEvent.title}>{nextEvent.title}</span> : null}
          </div>
          <form className={styles.inviteForm} onSubmit={handleInvite}>
            <label>
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("dashboard.invitePlaceholder")}
                aria-label={t("dashboard.inviteAria")}
                disabled={!nextEvent || invitePending}
                required
              />
            </label>
            <button type="submit" disabled={!nextEvent || invitePending}>
              {invitePending ? t("dashboard.inviting") : t("dashboard.invite")}
            </button>
          </form>
          {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
          <div className={styles.tabs}>
            {(["all", "confirmed", "open", "declined"] as const).map((status) => {
              const count = status === "all"
                ? eventParticipants.length
                : eventParticipants.filter((entry) => entry.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  className={attendanceFilter === status ? styles.activeTab : ""}
                  onClick={() => setAttendanceFilter(status)}
                >
                  {status === "all" ? t("common.all") : t(`attendance.${status}`)} <span>{count}</span>
                </button>
              );
            })}
          </div>
          <div className={styles.participantList}>
            {visibleParticipants.map((participant) => (
              <div key={participant.id} className={styles.participant}>
                <span className={styles.avatar}>{createInitials(participant.name)}</span>
                <div>
                  <strong>{participant.name}</strong>
                  <small>{t(`accountTypes.${participant.accountType}`)}</small>
                </div>
                <span className={`${styles.status} ${styles[participant.status]}`}>
                  {t(`attendance.${participant.status}`)}
                </span>
              </div>
            ))}
            {visibleParticipants.length === 0 ? (
              <div className={styles.emptyParticipants}>
                <Users size={24} />
                <p>
                  {nextEvent
                    ? t("dashboard.noParticipants")
                    : t("dashboard.noEventParticipants")}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.plansPanel}`}>
          <div className={styles.panelHeader}>
            <h2>{t("dashboard.plans")}</h2>
            <Link href="/trainingsplaene">{t("dashboard.allPlans")}</Link>
          </div>
          <div className={styles.planList}>
            {plans.map((plan) => (
              <article key={plan.id} className={styles.planItem}>
                <div className={styles.planCover}>{plan.title.slice(0, 3).toUpperCase()}</div>
                <div>
                  <h3>{plan.title}</h3>
                  <p>v{plan.version} · {plan.author}</p>
                  <small>{t("dashboard.federalToState")}</small>
                </div>
                <div className={styles.planActions}>
                  <button type="button">{t("common.open")}</button>
                  <button type="button" aria-label={t("common.share", { name: plan.title })}><Share2 size={15} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.lowerGrid}>
        <section className={styles.calendarPreview}>
          <div className={styles.panelHeader}>
            <h2>{t("dashboard.calendar")}</h2>
            <span>Juni 2026</span>
          </div>
          <div className={styles.miniCalendar}>
            {dictionary.dashboard.weekdays.map((day) => <strong key={day}>{day}</strong>)}
            {Array.from({ length: 35 }, (_, index) => {
              const day = index - 1;
              const hasEvent = [2, 5, 9, 10, 14, 16, 18, 21, 24].includes(day);
              return (
                <span key={index} className={day === 9 ? styles.today : ""}>
                  {day > 0 && day <= 30 ? day : ""}
                  {hasEvent ? <i /> : null}
                </span>
              );
            })}
          </div>
          <div className={styles.filterChips}>
            <span>Deutschland</span><span>Bayern</span><span>Region Süd</span>
            <span>Training</span><span>Contest</span><span>Arzttermin</span>
          </div>
          <Link href="/kalender" className={styles.textLink}>
            {t("dashboard.fullCalendar")} <ArrowRight size={17} />
          </Link>
        </section>

        <section className={styles.regions}>
          <div className={styles.panelHeader}>
            <h2>{t("dashboard.regionsNext")}</h2>
          </div>
          <div className={styles.regionGrid}>
            {regions.map((region) => (
              <article key={region.id}>
                <small>{region.state}</small>
                <strong>{region.eventCount}</strong>
                <span>{t("dashboard.events")}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.summaryBar}>
        <CheckCircle2 size={18} />
        <span><strong>12</strong> {t("dashboard.confirmationsToday")}</span>
        <Clock3 size={18} />
        <span><strong>3</strong> {t("dashboard.openResponses")}</span>
        <Link href="/personen">{t("dashboard.findTrainer")} <ArrowRight size={16} /></Link>
      </div>
    </>
  );
}
