"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FilterX,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type {
  CalendarEvent,
  EventOrganizationOption,
  EventType,
} from "@/domain/models";
import {
  deleteCalendarEvent,
  saveCalendarEvent,
} from "@/app/kalender/actions";
import { PageHeader } from "@/components/ui/page-header";
import { getIntlLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./calendar-view.module.css";

interface CalendarViewProps {
  initialEvents: CalendarEvent[];
  organizationOptions: EventOrganizationOption[];
}

const eventTypes: EventType[] = ["training", "contest", "medical", "meeting"];

/**
 * Erzeugt die 42 Zellen einer Monatsansicht.
 *
 * Die Funktion liefert echte Date-Objekte, sodass Filter und Event-Zuordnung
 * nicht von formatierten Anzeigetexten abhängig sind.
 */
function buildMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Vollständige Kalenderoberfläche mit lokalen MVP-Aktionen.
 *
 * Neue Termine werden in `events` ergänzt. Beim produktiven Anschluss ersetzt
 * eine Server Action lediglich `handleCreateEvent`; Monatslogik und UI bleiben.
 */
export function CalendarView({
  initialEvents,
  organizationOptions,
}: CalendarViewProps) {
  const [events, setEvents] = useState(initialEvents);
  const { dictionary, locale, t } = useI18n();
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [stateFilter, setStateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(initialEvents[0] ?? null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  const days = useMemo(
    () => buildMonthDays(monthCursor.getFullYear(), monthCursor.getMonth()),
    [monthCursor],
  );

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const stateMatches = stateFilter === "all" || event.state === stateFilter;
        const typeMatches = typeFilter === "all" || event.type === typeFilter;
        return stateMatches && typeMatches;
      }),
    [events, stateFilter, typeFilter],
  );
  const availableStates = useMemo(
    () => Array.from(new Set(events.map((event) => event.state))).sort(),
    [events],
  );

  const monthLabel = new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: "long",
    year: "numeric",
  }).format(monthCursor);

  function changeMonth(offset: number) {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function openCreateDialog() {
    setEditingEvent(null);
    setFeedback("");
    setDialogOpen(true);
  }

  function openEditDialog() {
    if (!selectedEvent?.canManage) {
      return;
    }

    setEditingEvent(selectedEvent);
    setFeedback("");
    setDialogOpen(true);
  }

  function handleSaveEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveCalendarEvent(data);
      setFeedback(result.message);

      if (result.status !== "success" || !result.event) {
        return;
      }

      setEvents((current) => {
        const existingIndex = current.findIndex(
          (calendarEvent) => calendarEvent.id === result.event?.id,
        );

        if (existingIndex === -1) {
          return [...current, result.event as CalendarEvent];
        }

        return current.map((calendarEvent) =>
          calendarEvent.id === result.event?.id
            ? (result.event as CalendarEvent)
            : calendarEvent,
        );
      });
      setSelectedEvent(result.event);
      setMonthCursor(new Date(`${result.event.date}T12:00:00`));
      setDialogOpen(false);
      setEditingEvent(null);
    });
  }

  function handleDeleteEvent() {
    if (
      !selectedEvent?.canManage ||
      !window.confirm(t("calendar.confirmDelete"))
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteCalendarEvent(selectedEvent.id);
      setFeedback(result.message);

      if (result.status !== "success") {
        return;
      }

      setEvents((current) =>
        current.filter((event) => event.id !== selectedEvent.id),
      );
      setSelectedEvent(null);
    });
  }

  return (
    <>
      <PageHeader
        title={t("calendar.title")}
        description={t("calendar.description")}
        showContext
      />

      <section className={styles.toolbar}>
        <label>
          {t("calendar.state")}
          <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value="all">{t("calendar.allStates")}</option>
            {availableStates.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </label>
        <label>
          {t("calendar.eventType")}
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as EventType | "all")}
          >
            <option value="all">{t("calendar.allTypes")}</option>
            {eventTypes.map((value) => (
              <option key={value} value={value}>{t(`eventTypes.${value}`)}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.resetButton}
          onClick={() => {
            setStateFilter("all");
            setTypeFilter("all");
          }}
        >
          <FilterX size={17} /> {t("calendar.resetFilters")}
        </button>
        <button
          type="button"
          className={styles.createButton}
          onClick={openCreateDialog}
          disabled={organizationOptions.length === 0}
        >
          <Plus size={18} /> {t("calendar.create")}
        </button>
      </section>
      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
      {organizationOptions.length === 0 ? (
        <p className={styles.feedback}>{t("calendar.noOrganization")}</p>
      ) : null}

      <div className={styles.calendarLayout}>
        <section className={styles.calendarPanel}>
          <div className={styles.calendarHeader}>
            <div className={styles.monthNavigation}>
              <button type="button" aria-label={t("calendar.previousMonth")} onClick={() => changeMonth(-1)}>
                <ChevronLeft size={19} />
              </button>
              <button type="button" aria-label={t("calendar.nextMonth")} onClick={() => changeMonth(1)}>
                <ChevronRight size={19} />
              </button>
            </div>
            <h2>{monthLabel}</h2>
            <span>{t("calendar.filteredCount", { count: filteredEvents.length })}</span>
          </div>

          <div className={styles.weekdays}>
            {dictionary.calendar.weekdays.map((day) => <strong key={day}>{day}</strong>)}
          </div>
          <div className={styles.monthGrid}>
            {days.map((day) => {
              const isoDate = toIsoDate(day);
              const dayEvents = filteredEvents.filter((entry) => entry.date === isoDate);
              const inCurrentMonth = day.getMonth() === monthCursor.getMonth();

              return (
                <div key={isoDate} className={inCurrentMonth ? styles.dayCell : styles.outsideDay}>
                  <span>{day.getDate()}</span>
                  <div>
                    {dayEvents.map((calendarEvent) => (
                      <button
                        key={calendarEvent.id}
                        type="button"
                        className={`${styles.eventChip} ${styles[calendarEvent.type]}`}
                        onClick={() => setSelectedEvent(calendarEvent)}
                      >
                        <strong>{calendarEvent.startTime}</strong>
                        <span>{calendarEvent.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className={styles.detailPanel}>
          <h2>{t("calendar.details")}</h2>
          {selectedEvent ? (
            <>
              <span className={`${styles.typeBadge} ${styles[selectedEvent.type]}`}>
                {t(`eventTypes.${selectedEvent.type}`)}
              </span>
              <h3>{selectedEvent.title}</h3>
              <p>{selectedEvent.description}</p>
              <dl>
                <div><dt>{t("calendar.date")}</dt><dd>{selectedEvent.date}</dd></div>
                <div><dt>{t("calendar.time")}</dt><dd>{selectedEvent.startTime} – {selectedEvent.endTime}</dd></div>
                <div><dt>{t("calendar.place")}</dt><dd><MapPin size={14} /> {selectedEvent.location}</dd></div>
                <div><dt>{t("calendar.participation")}</dt><dd>{selectedEvent.confirmed} / {selectedEvent.capacity}</dd></div>
              </dl>
              <button type="button" className={styles.detailAction}>{t("calendar.manageParticipants")}</button>
              {selectedEvent.canManage ? (
                <div className={styles.ownerActions}>
                  <button type="button" onClick={openEditDialog}>
                    <Pencil size={16} />
                    {t("calendar.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteEvent}
                    disabled={pending}
                  >
                    <Trash2 size={16} />
                    {t("calendar.delete")}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p>{t("calendar.selectEvent")}</p>
          )}
        </aside>
      </div>

      {dialogOpen ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
            <div className={styles.dialogHeader}>
              <div>
                <h2 id="event-dialog-title">
                  {editingEvent ? t("calendar.editEvent") : t("calendar.newEvent")}
                </h2>
                <p>
                  {editingEvent
                    ? t("calendar.editEventDescription")
                    : t("calendar.newEventDescription")}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("calendar.closeDialog")}
                onClick={() => {
                  setDialogOpen(false);
                  setEditingEvent(null);
                }}
              >
                <X size={21} />
              </button>
            </div>
            <form
              key={editingEvent?.id || "new-event"}
              onSubmit={handleSaveEvent}
            >
              {editingEvent ? (
                <input type="hidden" name="id" value={editingEvent.id} />
              ) : null}
              <label>
                {t("calendar.organization")}
                <select
                  name="organizationId"
                  defaultValue={
                    editingEvent?.organizationId || organizationOptions[0]?.id
                  }
                  required
                >
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>{t("calendar.formTitle")}<input name="title" defaultValue={editingEvent?.title || ""} required /></label>
              <label>{t("calendar.eventType")}
                <select name="type" defaultValue={editingEvent?.type || "training"}>
                  {eventTypes.map((value) => (
                    <option key={value} value={value}>{t(`eventTypes.${value}`)}</option>
                  ))}
                </select>
              </label>
              <div className={styles.formRow}>
                <label>{t("calendar.date")}<input name="date" type="date" defaultValue={editingEvent?.date || new Date().toISOString().slice(0, 10)} required /></label>
                <label>{t("calendar.from")}<input name="startTime" type="time" defaultValue={editingEvent?.startTime || "17:30"} required /></label>
                <label>{t("calendar.until")}<input name="endTime" type="time" defaultValue={editingEvent?.endTime || "19:30"} required /></label>
              </div>
              <label>{t("calendar.place")}<input name="location" defaultValue={editingEvent?.location || ""} required /></label>
              <div className={styles.formRow}>
                <label>{t("calendar.state")}<input name="state" maxLength={2} defaultValue={editingEvent?.state || "BY"} required /></label>
                <label>{t("calendar.region")}<input name="region" defaultValue={editingEvent?.region || ""} required /></label>
                <label>{t("calendar.capacity")}<input name="capacity" type="number" min="1" defaultValue={editingEvent?.capacity || 16} required /></label>
              </div>
              <label>{t("calendar.descriptionField")}<textarea name="description" rows={3} defaultValue={editingEvent?.description || ""} /></label>
              {feedback ? <p className={styles.formFeedback}>{feedback}</p> : null}
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  onClick={() => {
                    setDialogOpen(false);
                    setEditingEvent(null);
                  }}
                >
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={pending}>
                  {pending ? t("calendar.saving") : t("calendar.saveEvent")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
