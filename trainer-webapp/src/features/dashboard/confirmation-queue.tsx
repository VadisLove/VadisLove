"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ClipboardCheck, Eye } from "lucide-react";
import { updateSharedTrickProgress } from "@/app/trainingsplaene/actions";
import type { PendingConfirmation } from "@/features/evaluations/evaluation-model";
import styles from "./confirmation-queue.module.css";

const visibleLimit = 6;

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

/**
 * Warteschlange „Zu bestätigen“: gemeldete Tricks aller Athleten auf einen Blick.
 * Bestätigen nutzt dieselbe Datenbankfunktion wie der Trainingsplan (inkl. XP);
 * „Ansehen“ öffnet den Plan, wo auch ein eingereichtes Video geprüft werden kann.
 */
export function ConfirmationQueue({ items }: { items: PendingConfirmation[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();

  const open = items.filter((item) => !done[item.id]);
  if (!items.length) return null;

  const confirm = (item: PendingConfirmation) => {
    if (busy) return;
    setBusy(item.id);
    startTransition(async () => {
      try {
        const result = await updateSharedTrickProgress({ planId: item.planId, trickId: item.trickId, status: "confirmed" });
        if (result.status === "success") {
          setDone((current) => ({ ...current, [item.id]: true }));
          setMessage(`„${item.trickName}“ von ${item.athleteName} bestätigt.`);
          router.refresh();
        } else {
          setMessage(result.message);
        }
      } catch {
        setMessage("Nicht gespeichert. Bitte erneut versuchen.");
      } finally {
        setBusy("");
      }
    });
  };

  return (
    <section className={styles.queue} aria-label="Zu bestätigen">
      <header className={styles.head}>
        <h2><ClipboardCheck size={19} aria-hidden="true" /> Zu bestätigen <span>{open.length}</span></h2>
        <Link href="/trainingsplaene?tab=fortschritt">Alle Meldungen</Link>
      </header>
      {open.length ? (
        <ul className={styles.list}>
          {open.slice(0, visibleLimit).map((item) => (
            <li key={item.id} className={styles.item}>
              <span className={styles.avatar} aria-hidden="true">{initialsOf(item.athleteName)}</span>
              <span className={styles.text}>
                <strong>{item.trickName}</strong>
                <small>
                  <Link href={`/auswertung?athlete=${encodeURIComponent(item.athleteId)}`} title="Auswertung öffnen">{item.athleteName}</Link>
                  {" · "}{item.planTitle}
                </small>
              </span>
              <span className={styles.actions}>
                <Link className={styles.secondary} href={`/trainingsplaene?tab=fortschritt&plan=${encodeURIComponent(item.planId)}`} aria-label={`${item.trickName} im Plan ansehen`}>
                  <Eye size={16} aria-hidden="true" /><span>Ansehen</span>
                </Link>
                <button type="button" className={styles.primary} onClick={() => confirm(item)} disabled={Boolean(busy)}>
                  <Check size={16} aria-hidden="true" />{busy === item.id ? "…" : "Bestätigen"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Alles bestätigt – keine offenen Meldungen.</p>
      )}
      {open.length > visibleLimit ? (
        <Link className={styles.more} href="/trainingsplaene?tab=fortschritt">+ {open.length - visibleLimit} weitere Meldungen</Link>
      ) : null}
      {message ? <p className={styles.message} role="status">{message}</p> : null}
    </section>
  );
}
