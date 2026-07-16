"use client";

import Link from "next/link";
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
  respondToCalendarEvent,
  saveCalendarEvent,
} from "@/app/kalender/actions";
import { PageHeader } from "@/components/ui/page-header";
import { getIntlLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./calendar-view.module.css";

interface CalendarViewProps {
  initialEvents: CalendarEvent[];
  organizationOptions: EventOrganizationOption[];
  initialSelectedEventId?: string;
}

interface CalendarContextMenu {
  date: string;
  x: number;
  y: number;
}

type CalendarViewMode = "month" | "week" | "day";
type CalendarColorMode = "type" | "organization";

interface DateRange {
  startDate: string;
  endDate: string;
}

interface ResizeDraft {
  eventId: string;
  edge: "start" | "end";
  range: DateRange;
}

interface EventDraft {
  organizationId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

const eventTypes: EventType[] = ["training", "contest", "medical", "meeting"];
const typePalette: Record<EventType, { color: string; background: string; text: string }> = {
  training: { color: "#2563eb", background: "#dbeafe", text: "#075fae" },
  contest: { color: "#7c3aed", background: "#f4effb", text: "#5d3191" },
  medical: { color: "#d97706", background: "#fff5e8", text: "#9c5600" },
  meeting: { color: "#059669", background: "#eaf8ef", text: "#0e7035" },
};
const organizationPalette = [
  { color: "#2563eb", background: "#dbeafe", text: "#17458f" },
  { color: "#7c3aed", background: "#ede9fe", text: "#4c1d95" },
  { color: "#059669", background: "#d1fae5", text: "#065f46" },
  { color: "#dc2626", background: "#fee2e2", text: "#991b1b" },
  { color: "#d97706", background: "#fef3c7", text: "#92400e" },
  { color: "#0891b2", background: "#cffafe", text: "#155e75" },
];

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

function fromIsoDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`);
}

function addDays(isoDate: string, amount: number) {
  const date = fromIsoDate(isoDate);
  date.setDate(date.getDate() + amount);
  return toIsoDate(date);
}

function diffDays(startDate: string, endDate: string) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (fromIsoDate(endDate).getTime() - fromIsoDate(startDate).getTime()) /
      millisecondsPerDay,
  );
}

function normalizeDateRange(startDate: string, endDate: string): DateRange {
  return startDate <= endDate
    ? { startDate, endDate }
    : { startDate: endDate, endDate: startDate };
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  const mondayOffset = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  return weekStart;
}

function buildWeekDays(date: Date) {
  const weekStart = getWeekStart(date);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
}

function chunkIntoWeeks(days: Date[]) {
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );
}

function formatEventDateRange(event: CalendarEvent) {
  return event.date === event.endDate ? event.date : `${event.date} - ${event.endDate}`;
}

function isDateWithinRange(isoDate: string, range: DateRange | null) {
  return Boolean(range && isoDate >= range.startDate && isoDate <= range.endDate);
}

function buildEventFormData(event: CalendarEvent, range: DateRange) {
  const data = new FormData();

  data.set("id", event.id);
  data.set("organizationId", event.organizationId || "");
  data.set("title", event.title);
  data.set("type", event.type);
  data.set("startDate", range.startDate);
  data.set("endDate", range.endDate);
  data.set("startTime", event.startTime);
  data.set("endTime", event.endTime);
  data.set("location", event.location);
  data.set("state", event.state);
  data.set("region", event.region);
  data.set("capacity", String(event.capacity));
  data.set("description", event.description);

  return data;
}

function rangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function buildLocalDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}

/**
 * Berechnet echte Wochen-Balken fuer Termine.
 *
 * Jeder Termin wird pro Kalenderwoche auf den sichtbaren Ausschnitt gekappt.
 * Die greedy-Zeilenzuordnung verhindert, dass sich Balken in derselben Woche
 * ueberlagern, ohne eine externe Kalenderbibliothek einzufuehren.
 */
function buildWeekEventSegments(
  weekDates: string[],
  events: CalendarEvent[],
) {
  const weekStart = weekDates[0];
  const weekEnd = weekDates[weekDates.length - 1];
  const rowEnds: number[] = [];

  return events
    .filter((event) => event.date <= weekEnd && event.endDate >= weekStart)
    .map((event) => {
      const visibleStart = event.date > weekStart ? event.date : weekStart;
      const visibleEnd = event.endDate < weekEnd ? event.endDate : weekEnd;

      return {
        event,
        startColumn: weekDates.indexOf(visibleStart) + 1,
        endColumn: weekDates.indexOf(visibleEnd) + 1,
        startsInWeek: event.date >= weekStart,
        endsInWeek: event.endDate <= weekEnd,
      };
    })
    .sort((left, right) => {
      if (left.startColumn !== right.startColumn) {
        return left.startColumn - right.startColumn;
      }

      if (left.endColumn !== right.endColumn) {
        return right.endColumn - left.endColumn;
      }

      return left.event.startTime.localeCompare(right.event.startTime);
    })
    .map((segment) => {
      const row = rowEnds.findIndex((endColumn) => endColumn < segment.startColumn);
      const assignedRow = row === -1 ? rowEnds.length : row;
      rowEnds[assignedRow] = segment.endColumn;

      return { ...segment, row: assignedRow };
    });
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
  initialSelectedEventId,
}: CalendarViewProps) {
  const initialSelectedEvent = initialEvents.find(
    (event) => event.id === initialSelectedEventId,
  ) ?? initialEvents[0] ?? null;
  const [events, setEvents] = useState(initialEvents);
  const { dictionary, locale, t } = useI18n();
  const [monthCursor, setMonthCursor] = useState(() =>
    initialSelectedEvent ? fromIsoDate(initialSelectedEvent.date) : new Date(),
  );
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [colorMode, setColorMode] = useState<CalendarColorMode>("type");
  const [stateFilter, setStateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(initialSelectedEvent);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    organizationOptions[0]?.id || "",
  );
  const [selectedEventType, setSelectedEventType] = useState<EventType>(
    organizationOptions[0]?.allowedEventTypes[0] || "contest",
  );
  const [eventTypeMenuOpen, setEventTypeMenuOpen] = useState(false);
  const [createDate, setCreateDate] = useState(() => toIsoDate(new Date()));
  const [createEndDate, setCreateEndDate] = useState(() => toIsoDate(new Date()));
  const [eventDraft, setEventDraft] = useState<EventDraft>(() => ({
    organizationId: organizationOptions[0]?.id || "",
    startDate: toIsoDate(new Date()),
    endDate: toIsoDate(new Date()),
    startTime: "17:30",
    endTime: "19:30",
  }));
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatCount, setRepeatCount] = useState(4);
  const [contextMenu, setContextMenu] = useState<CalendarContextMenu | null>(null);
  const [rangeAnchorDate, setRangeAnchorDate] = useState<string | null>(null);
  const [rangeDraft, setRangeDraft] = useState<DateRange | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [resizeDraft, setResizeDraft] = useState<ResizeDraft | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  const days = useMemo(
    () => buildMonthDays(monthCursor.getFullYear(), monthCursor.getMonth()),
    [monthCursor],
  );
  const weeks = useMemo(() => chunkIntoWeeks(days), [days]);
  const weekDays = useMemo(() => buildWeekDays(monthCursor), [monthCursor]);
  const dayDate = toIsoDate(monthCursor);

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
  const displayedEvents = useMemo(
    () =>
      filteredEvents.map((event) =>
        resizeDraft?.eventId === event.id
          ? {
              ...event,
              date: resizeDraft.range.startDate,
              endDate: resizeDraft.range.endDate,
            }
          : event,
      ),
    [filteredEvents, resizeDraft],
  );
  const selectedOrganization = organizationOptions.find(
    (organization) => organization.id === selectedOrganizationId,
  );
  const allowedEventTypes =
    selectedOrganization?.allowedEventTypes || [];

  const monthLabel = new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: "long",
    year: "numeric",
  }).format(monthCursor);
  const weekLabel = `${weekDays[0].toLocaleDateString(getIntlLocale(locale), {
    day: "2-digit",
    month: "short",
  })} - ${weekDays[6].toLocaleDateString(getIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
  const dayLabel = monthCursor.toLocaleDateString(getIntlLocale(locale), {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const calendarTitle =
    viewMode === "month"
      ? monthLabel
      : viewMode === "week"
        ? weekLabel
        : dayLabel;
  const visibleRange =
    viewMode === "month"
      ? { startDate: toIsoDate(days[0]), endDate: toIsoDate(days[days.length - 1]) }
      : viewMode === "week"
        ? { startDate: toIsoDate(weekDays[0]), endDate: toIsoDate(weekDays[6]) }
        : { startDate: dayDate, endDate: dayDate };
  const visibleEvents = displayedEvents.filter(
    (event) =>
      event.date <= visibleRange.endDate &&
      event.endDate >= visibleRange.startDate,
  );
  const conflictEvents = useMemo(() => {
    const draftStartsAt = buildLocalDateTime(
      eventDraft.startDate,
      eventDraft.startTime,
    );
    const draftEndsAt = buildLocalDateTime(eventDraft.endDate, eventDraft.endTime);

    if (
      !eventDraft.organizationId ||
      !eventDraft.startDate ||
      !eventDraft.endDate ||
      draftEndsAt <= draftStartsAt
    ) {
      return [];
    }

    return events.filter((event) => {
      if (editingEvent?.id === event.id) {
        return false;
      }

      if (event.organizationId !== eventDraft.organizationId) {
        return false;
      }

      return rangesOverlap(
        draftStartsAt,
        draftEndsAt,
        buildLocalDateTime(event.date, event.startTime),
        buildLocalDateTime(event.endDate, event.endTime),
      );
    });
  }, [editingEvent?.id, eventDraft, events]);

  function changePeriod(offset: number) {
    setMonthCursor((current) => {
      if (viewMode === "month") {
        return new Date(current.getFullYear(), current.getMonth() + offset, 1);
      }

      const next = new Date(current);
      next.setDate(current.getDate() + offset * (viewMode === "week" ? 7 : 1));
      return next;
    });
  }

  function openCreateDialog(date = toIsoDate(new Date()), endDate = date) {
    const firstOrganization = organizationOptions[0];
    setEditingEvent(null);
    setCreateDate(date);
    setCreateEndDate(endDate);
    setEventDraft({
      organizationId: firstOrganization?.id || "",
      startDate: date,
      endDate,
      startTime: "17:30",
      endTime: "19:30",
    });
    setRepeatWeekly(false);
    setRepeatCount(4);
    setSelectedOrganizationId(firstOrganization?.id || "");
    setSelectedEventType(
      firstOrganization?.allowedEventTypes[0] || "contest",
    );
    setEventTypeMenuOpen(false);
    setFeedback("");
    setDialogOpen(true);
  }

  function openContextMenu(
    event: React.MouseEvent<HTMLDivElement>,
    isoDate: string,
  ) {
    event.preventDefault();

    if (organizationOptions.length === 0) {
      return;
    }

    setContextMenu({
      date: isoDate,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function openCreateDialogFromContextMenu() {
    if (!contextMenu) {
      return;
    }

    openCreateDialog(contextMenu.date);
    setContextMenu(null);
  }

  function startRangeSelection(isoDate: string) {
    if (organizationOptions.length === 0) {
      return;
    }

    setRangeAnchorDate(isoDate);
    setRangeDraft({ startDate: isoDate, endDate: isoDate });
  }

  function updateRangeSelection(isoDate: string) {
    if (!rangeAnchorDate) {
      return;
    }

    setRangeDraft(normalizeDateRange(rangeAnchorDate, isoDate));
  }

  function finishRangeSelection() {
    if (!rangeDraft) {
      return;
    }

    if (rangeDraft.startDate !== rangeDraft.endDate) {
      openCreateDialog(rangeDraft.startDate, rangeDraft.endDate);
    }

    setRangeAnchorDate(null);
    setRangeDraft(null);
  }

  function startResizeEvent(
    event: React.MouseEvent<HTMLElement>,
    calendarEvent: CalendarEvent,
    edge: "start" | "end",
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!calendarEvent.canManage) {
      return;
    }

    setResizeDraft({
      eventId: calendarEvent.id,
      edge,
      range: { startDate: calendarEvent.date, endDate: calendarEvent.endDate },
    });
  }

  function updateResizeSelection(isoDate: string) {
    setResizeDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        range:
          current.edge === "start"
            ? normalizeDateRange(isoDate, current.range.endDate)
            : normalizeDateRange(current.range.startDate, isoDate),
      };
    });
  }

  function finishResizeSelection() {
    if (!resizeDraft) {
      return;
    }

    const resizedEvent = events.find((event) => event.id === resizeDraft.eventId);
    const changed =
      resizedEvent &&
      (resizedEvent.date !== resizeDraft.range.startDate ||
        resizedEvent.endDate !== resizeDraft.range.endDate);

    setResizeDraft(null);

    if (resizedEvent && changed) {
      saveCalendarEventRange(resizedEvent, resizeDraft.range);
    }
  }

  function openEditDialog() {
    if (!selectedEvent?.canManage) {
      return;
    }

    setEditingEvent(selectedEvent);
    setSelectedOrganizationId(selectedEvent.organizationId || "");
    setSelectedEventType(selectedEvent.type);
    setEventDraft({
      organizationId: selectedEvent.organizationId || "",
      startDate: selectedEvent.date,
      endDate: selectedEvent.endDate,
      startTime: selectedEvent.startTime,
      endTime: selectedEvent.endTime,
    });
    setRepeatWeekly(false);
    setRepeatCount(4);
    setEventTypeMenuOpen(false);
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
        const savedEvents = result.events?.length
          ? result.events
          : [result.event as CalendarEvent];
        const savedById = new Map(
          savedEvents.map((calendarEvent) => [calendarEvent.id, calendarEvent]),
        );
        const updatedEvents = current.map((calendarEvent) =>
          savedById.get(calendarEvent.id) || calendarEvent,
        );
        const existingIds = new Set(current.map((calendarEvent) => calendarEvent.id));
        const insertedEvents = savedEvents.filter(
          (calendarEvent) => !existingIds.has(calendarEvent.id),
        );

        return [...updatedEvents, ...insertedEvents];
      });
      setSelectedEvent(result.event);
      setMonthCursor(new Date(`${result.event.date}T12:00:00`));
      setDialogOpen(false);
      setEditingEvent(null);
    });
  }

  function saveCalendarEventRange(calendarEvent: CalendarEvent, range: DateRange) {
    startTransition(async () => {
      const result = await saveCalendarEvent(
        buildEventFormData(calendarEvent, range),
      );
      setFeedback(result.message);

      if (result.status !== "success" || !result.event) {
        return;
      }

      setEvents((current) =>
        current.map((event) =>
          event.id === result.event?.id ? (result.event as CalendarEvent) : event,
        ),
      );
      setSelectedEvent(result.event);
    });
  }

  function moveCalendarEvent(calendarEvent: CalendarEvent, nextStartDate: string) {
    const duration = diffDays(calendarEvent.date, calendarEvent.endDate);
    const nextRange = {
      startDate: nextStartDate,
      endDate: addDays(nextStartDate, duration),
    };

    saveCalendarEventRange(calendarEvent, nextRange);
  }

  function handleDropOnDate(isoDate: string) {
    const draggedEvent = events.find((event) => event.id === draggedEventId);
    setDraggedEventId(null);

    if (!draggedEvent?.canManage) {
      return;
    }

    moveCalendarEvent(draggedEvent, isoDate);
  }

  function getEventColorStyle(calendarEvent: CalendarEvent) {
    if (colorMode === "type") {
      return undefined;
    }

    const organizationIndex = Math.max(
      0,
      organizationOptions.findIndex(
        (organization) => organization.id === calendarEvent.organizationId,
      ),
    );
    const palette = organizationPalette[
      organizationIndex % organizationPalette.length
    ];

    return {
      "--event-color": palette.color,
      "--event-bg": palette.background,
      "--event-text": palette.text,
    } as React.CSSProperties;
  }

  function getTypeColorStyle(type: EventType) {
    const palette = typePalette[type];

    return {
      "--event-color": palette.color,
      "--event-bg": palette.background,
      "--event-text": palette.text,
    } as React.CSSProperties;
  }

  function getOrganizationColorStyle(organizationId: string) {
    const organizationIndex = Math.max(
      0,
      organizationOptions.findIndex(
        (organization) => organization.id === organizationId,
      ),
    );
    const palette = organizationPalette[
      organizationIndex % organizationPalette.length
    ];

    return {
      "--event-color": palette.color,
      "--event-bg": palette.background,
      "--event-text": palette.text,
    } as React.CSSProperties;
  }

  function getEventColorClasses(calendarEvent: CalendarEvent) {
    return [
      colorMode === "type"
        ? styles[calendarEvent.type]
        : styles.organizationColor,
    ].filter(Boolean);
  }

  function renderEventBar(
    segment: ReturnType<typeof buildWeekEventSegments>[number],
    weekStartDate: string,
  ) {
    const isSingleDay = segment.event.date === segment.event.endDate;

    return (
      <button
        key={`${segment.event.id}-${weekStartDate}`}
        type="button"
        draggable={Boolean(segment.event.canManage)}
        className={[
          styles.eventBar,
          ...getEventColorClasses(segment.event),
          segment.startsInWeek
            ? styles.eventBarStarts
            : styles.eventBarContinuesBefore,
          segment.endsInWeek
            ? styles.eventBarEnds
            : styles.eventBarContinuesAfter,
        ].filter(Boolean).join(" ")}
        style={{
          ...getEventColorStyle(segment.event),
          gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`,
          gridRow: segment.row + 2,
        }}
        onClick={() => setSelectedEvent(segment.event)}
        onMouseDown={(event) => event.stopPropagation()}
        onDragStart={(event) => {
          if (!segment.event.canManage) {
            event.preventDefault();
            return;
          }

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", segment.event.id);
          setDraggedEventId(segment.event.id);
        }}
        onDragEnd={() => setDraggedEventId(null)}
      >
        {segment.startsInWeek && segment.event.canManage ? (
          <span
            className={`${styles.resizeHandle} ${styles.resizeStart}`}
            aria-hidden="true"
            onMouseDown={(event) =>
              startResizeEvent(event, segment.event, "start")
            }
          >
            <ChevronLeft size={12} />
          </span>
        ) : null}
        {isSingleDay ? <strong>{segment.event.startTime}</strong> : null}
        <span>{segment.event.title}</span>
        {segment.endsInWeek && segment.event.canManage ? (
          <span
            className={`${styles.resizeHandle} ${styles.resizeEnd}`}
            aria-hidden="true"
            onMouseDown={(event) =>
              startResizeEvent(event, segment.event, "end")
            }
          >
            <ChevronRight size={12} />
          </span>
        ) : null}
      </button>
    );
  }

  function renderWeekRow(week: Date[], compact = false) {
    const weekDates = week.map(toIsoDate);
    const weekSegments = buildWeekEventSegments(weekDates, displayedEvents);
    const eventRowCount = Math.max(
      1,
      ...weekSegments.map((segment) => segment.row + 1),
    );

    return (
      <div
        key={weekDates[0]}
        className={`${styles.weekRow} ${compact ? styles.expandedWeekRow : ""}`}
        style={{ "--event-rows": eventRowCount } as React.CSSProperties}
      >
        {week.map((day, index) => {
          const isoDate = weekDates[index];
          const inCurrentMonth =
            viewMode !== "month" || day.getMonth() === monthCursor.getMonth();

          return (
            <div
              key={isoDate}
              className={[
                inCurrentMonth ? styles.dayCell : styles.outsideDay,
                isDateWithinRange(isoDate, rangeDraft)
                  ? styles.rangeSelection
                  : "",
                draggedEventId ? styles.dropTarget : "",
                resizeDraft ? styles.resizeTarget : "",
              ].filter(Boolean).join(" ")}
              style={{ gridColumn: index + 1 }}
              onContextMenu={(event) => openContextMenu(event, isoDate)}
              onMouseDown={(event) => {
                if (event.button === 0) {
                  startRangeSelection(isoDate);
                }
              }}
              onMouseEnter={() => {
                updateRangeSelection(isoDate);
                updateResizeSelection(isoDate);
              }}
              onMouseUp={() => {
                finishResizeSelection();
                finishRangeSelection();
              }}
              onDragOver={(event) => {
                if (draggedEventId) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDropOnDate(isoDate);
              }}
            >
              <span>{day.getDate()}</span>
            </div>
          );
        })}
        {weekSegments.map((segment) => renderEventBar(segment, weekDates[0]))}
      </div>
    );
  }

  function renderDayView() {
    const dayEvents = displayedEvents
      .filter((event) => event.date <= dayDate && event.endDate >= dayDate)
      .sort((left, right) => left.startTime.localeCompare(right.startTime));

    return (
      <div
        className={[
          styles.dayView,
          draggedEventId ? styles.dropTarget : "",
          isDateWithinRange(dayDate, rangeDraft) ? styles.rangeSelection : "",
        ].filter(Boolean).join(" ")}
        onContextMenu={(event) => openContextMenu(event, dayDate)}
        onMouseDown={(event) => {
          if (event.button === 0) {
            startRangeSelection(dayDate);
          }
        }}
        onMouseUp={finishRangeSelection}
        onDragOver={(event) => {
          if (draggedEventId) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleDropOnDate(dayDate);
        }}
      >
        {dayEvents.map((calendarEvent) => (
          <button
            key={calendarEvent.id}
            type="button"
            draggable={Boolean(calendarEvent.canManage)}
            className={[
              styles.dayEvent,
              ...getEventColorClasses(calendarEvent),
            ].filter(Boolean).join(" ")}
            style={getEventColorStyle(calendarEvent)}
            onClick={() => setSelectedEvent(calendarEvent)}
            onMouseDown={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              if (!calendarEvent.canManage) {
                event.preventDefault();
                return;
              }

              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", calendarEvent.id);
              setDraggedEventId(calendarEvent.id);
            }}
            onDragEnd={() => setDraggedEventId(null)}
          >
            <strong>{calendarEvent.startTime} - {calendarEvent.endTime}</strong>
            <span>{calendarEvent.title}</span>
            <small>{calendarEvent.location}</small>
          </button>
        ))}
        {dayEvents.length === 0 ? (
          <p className={styles.emptyDay}>{t("calendar.noEventsForDay")}</p>
        ) : null}
      </div>
    );
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

  function replaceEvent(nextEvent: CalendarEvent) {
    setEvents((current) =>
      current.map((event) => event.id === nextEvent.id ? nextEvent : event),
    );
    setSelectedEvent(nextEvent);
  }

  function handleEventResponse(status: "confirmed" | "declined") {
    if (!selectedEvent) {
      return;
    }

    startTransition(async () => {
      const result = await respondToCalendarEvent(selectedEvent.id, status);
      setFeedback(result.message);

      if (result.status === "success" && result.event) {
        replaceEvent(result.event);
      }
    });
  }

  return (
    <div
      onClick={() => {
        setContextMenu(null);
        setEventTypeMenuOpen(false);
      }}
    >
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
        <label>
          {t("calendar.view")}
          <select
            value={viewMode}
            onChange={(event) =>
              setViewMode(event.target.value as CalendarViewMode)
            }
          >
            <option value="month">{t("calendar.monthView")}</option>
            <option value="week">{t("calendar.weekView")}</option>
            <option value="day">{t("calendar.dayView")}</option>
          </select>
        </label>
        <label>
          {t("calendar.colorMode")}
          <select
            value={colorMode}
            onChange={(event) =>
              setColorMode(event.target.value as CalendarColorMode)
            }
          >
            <option value="type">{t("calendar.colorByType")}</option>
            <option value="organization">{t("calendar.colorByOrganization")}</option>
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
          onClick={() => openCreateDialog()}
          disabled={organizationOptions.length === 0}
        >
          <Plus size={18} /> {t("calendar.create")}
        </button>
      </section>
      <section className={styles.colorLegend} aria-label={t("calendar.colorLegend")}>
        {colorMode === "type"
          ? eventTypes.map((type) => (
              <button
                key={type}
                type="button"
                className={styles.legendItem}
                style={getTypeColorStyle(type)}
                onClick={() =>
                  setTypeFilter((current) => current === type ? "all" : type)
                }
              >
                <span className={styles.legendDot} />
                {t(`eventTypes.${type}`)}
              </button>
            ))
          : organizationOptions.map((organization) => (
              <span
                key={organization.id}
                className={styles.legendItem}
                style={getOrganizationColorStyle(organization.id)}
              >
                <span className={styles.legendDot} />
                {organization.name}
              </span>
            ))}
      </section>
      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
      {organizationOptions.length === 0 ? (
        <p className={styles.feedback}>
          {t("calendar.noOrganization")}{" "}
          <Link href="/postfach">{t("calendar.joinOrganization")}</Link>
        </p>
      ) : null}

      <div className={styles.calendarLayout}>
        <section className={styles.calendarPanel}>
          <div className={styles.calendarHeader}>
            <div className={styles.monthNavigation}>
              <button type="button" aria-label={t("calendar.previousPeriod")} onClick={() => changePeriod(-1)}>
                <ChevronLeft size={19} />
              </button>
              <button type="button" aria-label={t("calendar.nextPeriod")} onClick={() => changePeriod(1)}>
                <ChevronRight size={19} />
              </button>
            </div>
            <h2>{calendarTitle}</h2>
            <span>{t("calendar.filteredCount", { count: visibleEvents.length })}</span>
          </div>

          {viewMode === "day" ? null : (
            <div className={styles.weekdays}>
              {dictionary.calendar.weekdays.map((day) => <strong key={day}>{day}</strong>)}
            </div>
          )}
          {viewMode === "day" ? (
            renderDayView()
          ) : (
            <div className={styles.monthGrid}>
              {(viewMode === "month" ? weeks : [weekDays]).map((week) =>
                renderWeekRow(week, viewMode === "week"),
              )}
            </div>
          )}
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
                <div><dt>{t("calendar.date")}</dt><dd>{formatEventDateRange(selectedEvent)}</dd></div>
                <div><dt>{t("calendar.time")}</dt><dd>{selectedEvent.startTime} – {selectedEvent.endTime}</dd></div>
                <div><dt>{t("calendar.place")}</dt><dd><MapPin size={14} /> {selectedEvent.location}</dd></div>
                <div><dt>{t("calendar.participation")}</dt><dd>{selectedEvent.confirmed} / {selectedEvent.capacity}</dd></div>
              </dl>
              <div className={styles.attendanceSummary}>
                <span className={styles.confirmedStatus}>
                  {t("attendance.confirmed")}
                  <strong>{selectedEvent.attendanceSummary.confirmed}</strong>
                </span>
                <span className={styles.openStatus}>
                  {t("attendance.open")}
                  <strong>{selectedEvent.attendanceSummary.open}</strong>
                </span>
                <span className={styles.declinedStatus}>
                  {t("attendance.declined")}
                  <strong>{selectedEvent.attendanceSummary.declined}</strong>
                </span>
              </div>
              <div className={styles.responseActions}>
                <button
                  type="button"
                  className={
                    selectedEvent.attendanceStatus === "confirmed"
                      ? styles.activeResponse
                      : ""
                  }
                  onClick={() => handleEventResponse("confirmed")}
                  disabled={pending}
                >
                  {t("calendar.confirmAttendance")}
                </button>
                <button
                  type="button"
                  className={
                    selectedEvent.attendanceStatus === "declined"
                      ? styles.activeResponse
                      : ""
                  }
                  onClick={() => handleEventResponse("declined")}
                  disabled={pending}
                >
                  {t("calendar.declineAttendance")}
                </button>
              </div>
              <div className={styles.participantPreview}>
                <h4>{t("calendar.participantStatus")}</h4>
                {selectedEvent.participants.length > 0 ? (
                  selectedEvent.participants.slice(0, 8).map((participant) => (
                    <div key={participant.id} className={styles.participantRow}>
                      <span>
                        <strong>{participant.name}</strong>
                        <small>
                          {t(`accountTypes.${participant.accountType}`)}
                        </small>
                      </span>
                      <em className={styles[participant.status]}>
                        {t(`attendance.${participant.status}`)}
                      </em>
                    </div>
                  ))
                ) : (
                  <p>{t("calendar.noParticipantsVisible")}</p>
                )}
              </div>
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

      {contextMenu ? (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={openCreateDialogFromContextMenu}
          >
            <Plus size={15} />
            {t("calendar.createOnDate", { date: contextMenu.date })}
          </button>
        </div>
      ) : null}

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
              key={editingEvent?.id || `new-event-${createDate}-${createEndDate}`}
              onSubmit={handleSaveEvent}
            >
              {editingEvent ? (
                <input type="hidden" name="id" value={editingEvent.id} />
              ) : null}
              <label>
                {t("calendar.organization")}
                <select
                  name="organizationId"
                  value={selectedOrganizationId}
                  onChange={(event) => {
                    const nextOrganizationId = event.target.value;
                    const nextOrganization = organizationOptions.find(
                      (organization) =>
                        organization.id === nextOrganizationId,
                    );

                    setSelectedOrganizationId(nextOrganizationId);
                    setEventDraft((current) => ({
                      ...current,
                      organizationId: nextOrganizationId,
                    }));
                    setSelectedEventType((currentType) =>
                      nextOrganization?.allowedEventTypes.includes(currentType)
                        ? currentType
                        : nextOrganization?.allowedEventTypes[0] || "contest",
                    );
                    setEventTypeMenuOpen(false);
                  }}
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
              <div
                className={styles.eventTypePicker}
                onClick={(event) => event.stopPropagation()}
              >
                <span className={styles.fieldLabel}>{t("calendar.eventType")}</span>
                <input type="hidden" name="type" value={selectedEventType} />
                <button
                  type="button"
                  className={styles.eventTypeTrigger}
                  aria-haspopup="listbox"
                  aria-expanded={eventTypeMenuOpen}
                  onClick={() => setEventTypeMenuOpen((open) => !open)}
                >
                  <span
                    className={styles.eventTypeDot}
                    style={getTypeColorStyle(selectedEventType)}
                  />
                  {t(`eventTypes.${selectedEventType}`)}
                </button>
                {eventTypeMenuOpen ? (
                  <div className={styles.eventTypeMenu} role="listbox">
                    {allowedEventTypes.map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="option"
                        aria-selected={selectedEventType === value}
                        className={
                          selectedEventType === value
                            ? styles.eventTypeOptionActive
                            : styles.eventTypeOption
                        }
                        onClick={() => {
                          setSelectedEventType(value);
                          setEventTypeMenuOpen(false);
                        }}
                      >
                        <span
                          className={styles.eventTypeDot}
                          style={getTypeColorStyle(value)}
                        />
                        {t(`eventTypes.${value}`)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={styles.dateTimeRow}>
                <label>{t("calendar.startDate")}<input name="startDate" type="date" value={eventDraft.startDate || createDate} onChange={(event) => setEventDraft((current) => ({ ...current, startDate: event.target.value }))} required /></label>
                <label>{t("calendar.endDate")}<input name="endDate" type="date" value={eventDraft.endDate || createEndDate} onChange={(event) => setEventDraft((current) => ({ ...current, endDate: event.target.value }))} required /></label>
                <label>{t("calendar.from")}<input name="startTime" type="time" value={eventDraft.startTime} onChange={(event) => setEventDraft((current) => ({ ...current, startTime: event.target.value }))} required /></label>
                <label>{t("calendar.until")}<input name="endTime" type="time" value={eventDraft.endTime} onChange={(event) => setEventDraft((current) => ({ ...current, endTime: event.target.value }))} required /></label>
              </div>
              {!editingEvent ? (
                <fieldset className={styles.repeatBox}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      name="repeatWeekly"
                      value="weekly"
                      checked={repeatWeekly}
                      onChange={(event) => setRepeatWeekly(event.target.checked)}
                    />
                    {t("calendar.repeatWeekly")}
                  </label>
                  <label>
                    {t("calendar.repeatCount")}
                    <input
                      name="repeatCount"
                      type="number"
                      min="1"
                      max="26"
                      value={repeatCount}
                      disabled={!repeatWeekly}
                      onChange={(event) =>
                        setRepeatCount(Number(event.target.value))
                      }
                    />
                  </label>
                </fieldset>
              ) : null}
              {conflictEvents.length > 0 ? (
                <div className={styles.conflictWarning} role="alert">
                  <strong>{t("calendar.conflictWarning")}</strong>
                  <span>
                    {conflictEvents
                      .slice(0, 2)
                      .map((event) => event.title)
                      .join(", ")}
                  </span>
                </div>
              ) : null}
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
    </div>
  );
}
