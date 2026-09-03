import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import styles from "@/components/legal/legal-page.module.css";

export const metadata: Metadata = { title: "Nutzungsbedingungen · Trainer Hub" };

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Vereins- und Verbandsplattform · Entwurf"
      title="Nutzungsbedingungen"
      description="Regeln für die kostenlose Nutzung des Trainer Hub durch Mitglieder angeschlossener Vereine und Verbände."
    >
      <section>
        <h2>1. Anbieter und Geltungsbereich</h2>
        <p className={styles.placeholder}>
          Der Anbieter des Trainer Hub steht noch nicht fest und muss vor der
          Veröffentlichung mit vollständiger Anschrift ergänzt werden.
        </p>
        <p>
          Diese Bedingungen gelten für registrierte Mitglieder der im Trainer
          Hub abgebildeten Vereine und Verbände. Die Nutzung ist derzeit kostenlos.
        </p>
      </section>

      <section>
        <h2>2. Registrierung und Mitgliedschaft</h2>
        <p>
          Bei der Registrierung sind richtige und aktuelle Angaben zu machen.
          Organisationsrollen und damit verbundene Rechte werden gesondert durch
          die zuständige Vereins- oder Verbandsstelle bestätigt.
        </p>
      </section>

      <section>
        <h2>3. Minderjährige</h2>
        <p>
          Jugendliche können sich ab 13 Jahren selbst registrieren. Solange sie
          minderjährig sind, wird das Konto erst nach Bestätigung durch eine
          erziehungsberechtigte Person freigeschaltet. Unter 13 Jahren muss das
          Konto durch eine erziehungsberechtigte Person angelegt werden.
        </p>
      </section>

      <section>
        <h2>4. Zulässige Nutzung</h2>
        <ul>
          <li>Zugangsdaten dürfen nicht an andere Personen weitergegeben werden.</li>
          <li>Inhalte und personenbezogene Daten dürfen nur für Vereins-, Verbands- und Trainingszwecke genutzt werden.</li>
          <li>Rechtswidrige, beleidigende oder Rechte Dritter verletzende Inhalte sind unzulässig.</li>
          <li>Rollen, Beziehungen und Freigaben dürfen nicht irreführend beantragt oder missbraucht werden.</li>
        </ul>
      </section>

      <section>
        <h2>5. Eigene Inhalte</h2>
        <p>
          Nutzende bleiben für eingestellte Inhalte verantwortlich. Sie müssen
          insbesondere berechtigt sein, hochgeladene Bilder, Trainingsinhalte
          und verlinkte Videos innerhalb der Plattform zu verwenden.
        </p>
      </section>

      <section>
        <h2>6. Verfügbarkeit und Änderungen</h2>
        <p>
          Ein Anspruch auf jederzeit unterbrechungsfreie Verfügbarkeit besteht
          nicht. Wartung, Sicherheitsmaßnahmen und sachlich erforderliche
          Weiterentwicklungen können Funktionen vorübergehend einschränken.
        </p>
      </section>

      <section>
        <h2>7. Sperrung und Beendigung</h2>
        <p>
          Konten können bei Sicherheitsrisiken, falschen Angaben oder erheblichen
          Verstößen eingeschränkt werden. Nutzende können ihr Konto über die
          Profileinstellungen zur Löschung vormerken.
        </p>
      </section>

      <section>
        <h2>8. Haftung und Schlussbestimmungen</h2>
        <p className={styles.placeholder}>
          Haftung, anwendbares Recht, Änderungen der Bedingungen und zuständige
          Kontaktstelle müssen nach Festlegung des Betreibers juristisch geprüft
          und vervollständigt werden.
        </p>
      </section>

      <section>
        <h2>9. Stand</h2>
        <p>Arbeitsentwurf vom 1. September 2026.</p>
      </section>
    </LegalPage>
  );
}
