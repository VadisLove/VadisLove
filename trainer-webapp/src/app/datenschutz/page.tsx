import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import styles from "@/components/legal/legal-page.module.css";

export const metadata: Metadata = { title: "Datenschutz · Trainer Hub" };

/**
 * Inhaltlicher Arbeitsentwurf. Betreiber, Auftragsverarbeiter, Fristen und
 * Rechtsgrundlagen muessen vor der Freigabe abschliessend geprueft werden.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Rechtliche Informationen · Entwurf"
      title="Datenschutz"
      description="Hier wird erklärt, welche personenbezogenen Daten der Trainer Hub für Konten, Vereinsorganisation und Trainingsarbeit verarbeitet."
    >
      <section>
        <h2>1. Verantwortliche Stelle</h2>
        <address className={styles.placeholder}>
          Betreiber noch festzulegen<br />
          Vollständige Anschrift ergänzen<br />
          Datenschutzkontakt ergänzen
        </address>
      </section>

      <section>
        <h2>2. Verarbeitete Daten</h2>
        <p>Je nach Rolle und Nutzung verarbeitet der Trainer Hub insbesondere:</p>
        <ul>
          <li>Kontodaten wie Name, E-Mail-Adresse, Rolle und Anmeldedaten,</li>
          <li>Vereins- und Verbandszuordnungen sowie Freigabeanfragen,</li>
          <li>Termine, Teilnahmen, Nachrichten und Trainingspläne,</li>
          <li>sportliche Bewertungen, Ziele und Trainingsfortschritte,</li>
          <li>freiwillige Profilangaben und Profilbilder sowie</li>
          <li>technisch notwendige Protokoll-, Sicherheits- und Sitzungsdaten.</li>
        </ul>
      </section>

      <section>
        <h2>3. Minderjährige</h2>
        <p>
          Personen ab 13 Jahren können ein Konto selbst anlegen. Bis zum 18.
          Geburtstag wird der fachliche Zugriff erst freigeschaltet, nachdem
          eine erziehungsberechtigte Person die Registrierung über einen
          zeitlich begrenzten Link bestätigt hat. Das eingegebene Geburtsdatum
          wird nur zur Altersprüfung verwendet; gespeichert wird lediglich, bis
          wann eine Elternfreigabe erforderlich ist.
        </p>
      </section>

      <section>
        <h2>4. Zwecke und Rechtsgrundlagen</h2>
        <p>
          Die Datenverarbeitung dient der Bereitstellung des Mitgliederbereichs,
          der Organisation von Vereinen und Verbänden, der Trainingsplanung,
          Kommunikation, Kontosicherheit und Erfüllung gesetzlicher Pflichten.
        </p>
        <p className={styles.placeholder}>
          Die konkreten Rechtsgrundlagen nach Art. 6 DSGVO und gegebenenfalls
          besondere Kategorien nach Art. 9 DSGVO sind durch die verantwortliche
          Stelle vor Veröffentlichung verbindlich zuzuordnen.
        </p>
      </section>

      <section>
        <h2>5. Hosting und technische Dienstleister</h2>
        <p>
          Die Webanwendung ist für den Betrieb auf Vercel vorgesehen. Anmeldung,
          Datenbank und Dateispeicher werden über Supabase bereitgestellt. Mit
          den eingesetzten Dienstleistern sind vor dem Produktionsstart die
          erforderlichen Auftragsverarbeitungsvereinbarungen, Regionen und
          möglichen Drittlandübermittlungen zu dokumentieren.
        </p>
      </section>

      <section>
        <h2>6. Cookies und lokale Speicherung</h2>
        <p>
          Der Trainer Hub verwendet derzeit nur technisch notwendige Sitzungs-
          und Spracheinstellungen. Analyse-, Marketing- oder Werbetracker sind
          im aktuellen Stand nicht eingebunden. Werden später optionale Dienste
          ergänzt, werden sie vor einer erforderlichen Einwilligung nicht geladen.
        </p>
      </section>

      <section>
        <h2>7. Speicherdauer und Löschung</h2>
        <p>
          Kontodaten werden grundsätzlich so lange gespeichert, wie das Konto
          besteht und die Verarbeitung für die genannten Zwecke erforderlich ist.
          Die App bietet einen Prozess zur Kontolöschung mit Wiederherstellungsfrist.
        </p>
        <p className={styles.placeholder}>
          Verbindliche Löschfristen für Fach-, Sicherungs- und Protokolldaten ergänzen.
        </p>
      </section>

      <section>
        <h2>8. Rechte betroffener Personen</h2>
        <p>
          Betroffene Personen können insbesondere Auskunft, Berichtigung,
          Löschung, Einschränkung, Datenübertragbarkeit und – soweit anwendbar –
          Widerspruch oder den Widerruf einer Einwilligung verlangen. Außerdem
          besteht ein Beschwerderecht bei einer Datenschutzaufsichtsbehörde.
        </p>
      </section>

      <section>
        <h2>9. Stand</h2>
        <p>Arbeitsentwurf vom 1. September 2026.</p>
      </section>
    </LegalPage>
  );
}
