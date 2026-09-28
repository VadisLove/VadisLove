"use client";

import { Info } from "lucide-react";
import { useId } from "react";
import styles from "./parks.module.css";

/**
 * Kleines „i“ neben einem Feld: erklärt per Hover (Maus) bzw. Tippen (Touch, über den
 * Fokus), was das Feld bewirkt. Rein per CSS eingeblendet, ohne eigenen Zustand.
 */
export function InfoTip({ text }: { text: string }) {
  const id = useId();
  return (
    <span className={styles.infoTip}>
      <button
        type="button"
        className={styles.infoButton}
        aria-label="Erklärung anzeigen"
        aria-describedby={id}
        // Klick im Label soll nicht das zugehörige Eingabefeld fokussieren.
        onClick={(e) => e.preventDefault()}
      >
        <Info size={13} />
      </button>
      <span id={id} role="tooltip" className={styles.infoText}>
        {text}
      </span>
    </span>
  );
}
