import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import styles from "@/components/legal/legal-page.module.css";

export const metadata: Metadata = { title: "Impressum · Trainer Hub" };

export default function ImprintPage() {
  return (
    <LegalPage
      eyebrow="Anbieterkennzeichnung · Entwurf"
      title="Impressum"
      description="Die Anbieterangaben werden ergänzt, sobald die rechtlich verantwortliche Organisation feststeht."
    >
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <address className={styles.placeholder}>
          Name und Rechtsform des Betreibers ergänzen<br />
          Straße und Hausnummer ergänzen<br />
          Postleitzahl und Ort ergänzen<br />
          Vertretungsberechtigte Person ergänzen
        </address>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p className={styles.placeholder}>
          E-Mail-Adresse und eine weitere schnelle Kontaktmöglichkeit ergänzen.
        </p>
      </section>

      <section>
        <h2>Register- und Steuerangaben</h2>
        <p className={styles.placeholder}>
          Soweit vorhanden: Vereinsregister, Registergericht, Registernummer und
          Umsatzsteuer-Identifikationsnummer ergänzen.
        </p>
      </section>

      <section>
        <h2>Inhaltlich verantwortliche Person</h2>
        <p className={styles.placeholder}>
          Falls redaktionelle Inhalte angeboten werden, verantwortliche Person
          und Anschrift nach § 18 Abs. 2 MStV ergänzen.
        </p>
      </section>
    </LegalPage>
  );
}
