"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/benachrichtigungen/actions";
import type { NotificationItem } from "@/domain/models";
import styles from "./notification-center.module.css";

function relativeTime(value: string) {
  const date = new Date(value);
  const differenceMinutes = Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / 60_000),
  );

  if (differenceMinutes < 1) return "Gerade eben";
  if (differenceMinutes < 60) return `Vor ${differenceMinutes} Min.`;
  if (differenceMinutes < 1_440) return `Vor ${Math.round(differenceMinutes / 60)} Std.`;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

/**
 * Echte Benachrichtigungsglocke mit Vorschau und optimistischem Lesestatus.
 * Die Server Actions und RLS verhindern, dass fremde Hinweise geaendert werden.
 */
export function NotificationCenter({
  initialItems,
  initialUnreadCount,
}: {
  initialItems: NotificationItem[];
  initialUnreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [, startTransition] = useTransition();

  function readNotification(notification: NotificationItem) {
    if (notification.readAt) return;

    setItems((current) =>
      current.map((item) =>
        item.id === notification.id
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    startTransition(() => markNotificationRead(notification.id));
  }

  function readAll() {
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt })));
    setUnreadCount(0);
    startTransition(() => markAllNotificationsRead());
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.bellButton}
        aria-label={`Benachrichtigungen${unreadCount ? `, ${unreadCount} ungelesen` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={21} />
        {unreadCount > 0 ? (
          <span className={styles.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <section className={styles.panel} aria-label="Benachrichtigungen">
          <header>
            <div>
              <strong>Benachrichtigungen</strong>
              <span>{unreadCount} ungelesen</span>
            </div>
            {unreadCount > 0 ? (
              <button type="button" onClick={readAll}>
                <CheckCheck size={16} /> Alle gelesen
              </button>
            ) : null}
          </header>

          <div className={styles.list}>
            {items.map((notification) => (
              <Link
                key={notification.id}
                href={notification.link}
                className={notification.readAt ? styles.item : styles.unreadItem}
                onClick={() => {
                  readNotification(notification);
                  setOpen(false);
                }}
              >
                <span className={styles.icon}><Bell size={16} /></span>
                <span>
                  <strong>{notification.title}</strong>
                  <small>{notification.message}</small>
                  <time>{relativeTime(notification.createdAt)}</time>
                </span>
              </Link>
            ))}

            {items.length === 0 ? (
              <div className={styles.empty}>
                <Inbox size={28} />
                <strong>Alles erledigt</strong>
                <span>Neue Anfragen und Aktivitaeten erscheinen hier.</span>
              </div>
            ) : null}
          </div>

          <Link href="/postfach" className={styles.openInbox} onClick={() => setOpen(false)}>
            Zum Postfach
          </Link>
        </section>
      ) : null}
    </div>
  );
}
