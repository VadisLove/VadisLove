"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { respondGuardianApproval } from "./actions";
import styles from "./page.module.css";

/** Trennt Zustimmung und Ablehnung, damit nur die Zustimmung Rechtstexte annimmt. */
export function GuardianApprovalForm({ token }: { token: string }) {
  const [guardianName, setGuardianName] = useState("");
  const validName = guardianName.trim().length >= 2;

  return (
    <div className={styles.formArea}>
      <label>
        Vor- und Nachname der erziehungsberechtigten Person
        <input
          type="text"
          value={guardianName}
          onChange={(event) => setGuardianName(event.target.value)}
          autoComplete="name"
          maxLength={120}
          required
        />
      </label>

      <form action={respondGuardianApproval} className={styles.approveForm}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="response" value="approved" />
        <input type="hidden" name="guardianName" value={guardianName} />
        <label className={styles.checkLabel}>
          <input type="checkbox" name="legalConfirmed" value="true" required />
          <span>
            Ich bin erziehungsberechtigt, genehmige die Registrierung, akzeptiere
            die <Link href="/nutzungsbedingungen" target="_blank">Nutzungsbedingungen</Link>{" "}
            für das minderjährige Kind und habe die {" "}
            <Link href="/datenschutz" target="_blank">Datenschutzerklärung</Link>{" "}
            zur Kenntnis genommen.
          </span>
        </label>
        <button type="submit" disabled={!validName} className={styles.approveButton}>
          <Check size={18} /> Registrierung freigeben
        </button>
      </form>

      <form action={respondGuardianApproval}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="response" value="rejected" />
        <input type="hidden" name="guardianName" value={guardianName} />
        <button type="submit" disabled={!validName} className={styles.rejectButton}>
          <X size={18} /> Anfrage ablehnen
        </button>
      </form>
    </div>
  );
}
