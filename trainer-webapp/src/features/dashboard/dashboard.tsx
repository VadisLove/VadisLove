"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  Attendance,
  AttendanceStatus,
  CalendarEvent,
  Region,
  TrainingPlan,
} from "@/domain/models";
import { formatShortDate } from "@/lib/event-display";
import { PageHeader } from "@/components/ui/page-header";
import { useCurrentUser } from "@/components/auth/current-user-context";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./dashboard.module.css";

interface DashboardProps {
  events: CalendarEvent[];
  attendance: Attendance[];
  plans: TrainingPlan[];
  regions: Region[];
}

/**
 * People-First-Dashboard des MVP.
 *
 * Die Daten werden serverseitig über das Repository geladen und hier nur für
 * lokale UI-Zustände weiterverwendet. Einladungen und Filter sind im MVP
 * simuliert; ihre Handler bilden bereits die späteren API-Aktionen ab.
 */
export function Dashboard({ events, attendance, plans, regions }: DashboardProps) {
  const currentUser = useCurrentUser();
  const { dictionary, locale, t } = useI18n();
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceStatus | "all">("all");
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");

  const nextEvent = events[0];
  const visibleAttendance = useMemo(
    () =>
      attendanceFilter === "all"
        ? attendance
        : attendance.filter((entry) => entry.status === attendanceFilter),
    [attendance, attendanceFilter],
  );

  /**
   * Simuliert eine Einladung. Beim Supabase-Anschluss ruft diese Funktion eine
   * Server Action auf; `email` bleibt dabei der wiederverwendete Formularwert.
   */
  function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.includes("@")) {
      setFeedback(t("dashboard.invalidEmail"));
      return;
    }

    setFeedback(t("dashboard.inviteQueued", { email }));
    setEmail("");
  }

  return (
    <>
      <PageHeader
        title={t("dashboard.greeting", { name: currentUser?.displayName || t("common.appName") })}
        description={t("dashboard.description")}
        showContext
      />

      <section className={styles.nextEvent}>
        <div>
          <span>{t("dashboard.nextTraining")}</span>
          <strong>{nextEvent.startTime}</strong>
          <small>– {nextEvent.endTime}</small>
        </div>
        <div className={styles.nextEventDetails}>
          <h2>{nextEvent.title}</h2>
          <p><MapPin size={17} /> {nextEvent.location}</p>
          <div><span>{t("eventTypes.training")}</span><span>{t("dashboard.indoor")}</span></div>
        </div>
        <div className={styles.capacity}>
          <Users size={23} />
          <strong>{nextEvent.confirmed} / {nextEvent.capacity}</strong>
          <small>{t("dashboard.confirmed")}</small>
        </div>
        <button type="button" className={styles.primaryButton}>
          {t("dashboard.viewParticipants")}
          <ArrowRight size={18} />
        </button>
      </section>

      <div className={styles.dashboardGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><CalendarDays size={19} /> {t("dashboard.schedule")}</h2>
            <Link href="/kalender">{t("dashboard.showAll")}</Link>
          </div>
          <div className={styles.agenda}>
            {events.slice(0, 5).map((event, index) => (
              <article key={event.id} className={styles.agendaItem}>
                <div className={styles.time}>
                  <strong>{event.startTime}</strong>
                  <span>{event.endTime}</span>
                </div>
                <span className={`${styles.typeDot} ${styles[event.type]}`} />
                <div>
                  <small>{index < 2 ? (index === 0 ? t("common.today") : t("common.tomorrow")) : formatShortDate(event.date, locale)}</small>
                  <h3>{event.title}</h3>
                  <p><MapPin size={13} /> {event.location}</p>
                </div>
                <strong className={styles.agendaCapacity}>{event.confirmed}/{event.capacity}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Users size={19} /> {t("dashboard.participation")}</h2>
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
              />
            </label>
            <button type="submit">{t("dashboard.invite")}</button>
          </form>
          {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
          <div className={styles.tabs}>
            {(["all", "confirmed", "open", "declined"] as const).map((status) => {
              const count = status === "all"
                ? attendance.length
                : attendance.filter((entry) => entry.status === status).length;
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
            {visibleAttendance.map((entry) => (
              <div key={entry.id} className={styles.participant}>
                <span className={styles.avatar}>{entry.person.initials}</span>
                <div>
                  <strong>{entry.person.name}</strong>
                  <small>{entry.person.role}</small>
                </div>
                <span className={`${styles.status} ${styles[entry.status]}`}>
                  {t(`attendance.${entry.status}`)}
                </span>
              </div>
            ))}
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
