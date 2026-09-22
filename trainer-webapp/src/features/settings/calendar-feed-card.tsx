"use client";

import { useState, useTransition } from "react";
import { CalendarSync, Copy, Link2Off, RefreshCw } from "lucide-react";
import { revokeCalendarFeed, rotateCalendarFeed } from "@/app/einstellungen/actions";
import type { CalendarFeedSubscription } from "@/domain/models";
import styles from "./settings-view.module.css";

/** Der Klartext-Link lebt nur in diesem Browserzustand und wird nie erneut geladen. */
export function CalendarFeedCard({ initialSubscription }: { initialSubscription: CalendarFeedSubscription | null }) {
  const [subscription, setSubscription] = useState(initialSubscription);
  const [feedUrl, setFeedUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function rotate() {
    startTransition(async () => {
      const result = await rotateCalendarFeed();
      setMessage(result.message);
      if (result.status === "success" && result.feedPath) {
        setFeedUrl(`${window.location.origin}${result.feedPath}`);
        setSubscription({ id: "new", createdAt: new Date().toISOString() });
      }
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeCalendarFeed();
      setMessage(result.message);
      if (result.status === "success") {
        setFeedUrl("");
        setSubscription(null);
      }
    });
  }

  async function copyFeedUrl() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setMessage("Der Kalender-Link wurde kopiert.");
    } catch {
      setMessage("Der Kalender-Link konnte nicht kopiert werden. Bitte markiere ihn manuell.");
    }
  }

  return (
    <section className={`${styles.settingsCard} ${styles.feedCard}`}>
      <header>
        <span><CalendarSync size={22} /></span>
        <div>
          <h2>Persönliches Kalender-Abo</h2>
          <p>Eigene Termine, Zusagen und offene Einladungen in einer Kalender-App abonnieren.</p>
        </div>
      </header>
      <div className={styles.feedBody}>
        <p>
          Der geheime Link ist wie ein Passwort. Er enthält keine Familienkalender und kann jederzeit widerrufen werden.
        </p>
        {feedUrl ? (
          <div className={styles.feedLinkRow}>
            <input readOnly value={feedUrl} aria-label="Neuer persönlicher Kalender-Link" />
            <button type="button" onClick={copyFeedUrl}>
              <Copy size={16} /> Kopieren
            </button>
          </div>
        ) : subscription ? (
          <p className={styles.feedStatus}>Ein Link ist aktiv. Aus Sicherheitsgründen kann er nicht erneut angezeigt werden.</p>
        ) : (
          <p className={styles.feedStatus}>Noch kein Kalender-Link aktiv.</p>
        )}
        {message ? <p aria-live="polite">{message}</p> : null}
      </div>
      <footer>
        <button type="button" onClick={rotate} disabled={pending}>
          <RefreshCw size={16} /> {subscription ? "Link erneuern" : "Link erstellen"}
        </button>
        {subscription ? (
          <button type="button" className={styles.secondaryButton} onClick={revoke} disabled={pending}>
            <Link2Off size={16} /> Widerrufen
          </button>
        ) : null}
      </footer>
    </section>
  );
}
