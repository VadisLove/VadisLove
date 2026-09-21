# Mobile Praxisprüfliste – Roadmap-Schritt 2

Stand: 21.09.2026. Diese Liste trennt die fachliche Praxisabnahme von den
lokal bestandenen technischen Prüfungen. Ausschließlich synthetische Konten
und Testadressen verwenden; keine produktiven Minderjährigen- oder
Vereinsdaten eingeben.

## Vorbereitung

- [ ] Staging oder lokales, isoliertes Supabase-Projekt mit angewandter
  Migration `20260921102535_step_2_auth_onboarding.sql` steht bereit.
- [ ] E-Mail-Bestätigung, erlaubte Callback-Adresse und Testabsender sind
  konfiguriert; Google und Apple nur mit freigegebenen Test-Clients aktivieren.
- [ ] Zwei Mobilbrowser (oder getrennte Browserprofile) für Kind und
  Sorgeberechtigte stehen bereit.

## Kernabläufe auf dem Smartphone

- [ ] Athlet, Trainer, medizinische Fachkraft und Eltern können ohne Verein
  registrieren und nach Abschluss ihren persönlichen Bereich öffnen.
- [ ] Eine freiwillige Vereinsauswahl erzeugt keine unmittelbare Rolle und
  öffnet keine Vereins- oder Teamdaten.
- [ ] Genau am 16. Geburtstag ist kein Elternlink nötig; am Vortag bleibt der
  Fachzugriff bis zur bestätigten Elternfreigabe gesperrt. Dasselbe gilt für
  ein synthetisches Kind unter 13.
- [ ] Ablehnung, abgelaufener Link und erneuter Versand führen verständlich
  zur Warteseite und nie zu Fachzugriff.
- [ ] Link in Einladung: Weiterleitung oder Öffnen allein vergibt keine Rolle;
  widerrufene, abgelaufene und erneut angenommene Links bleiben wirkungslos.
- [ ] Nach simuliertem Netzabbruch wird der tatsächlich gespeicherte Status
  beim erneuten Öffnen angezeigt; ein wiederholter Abschluss erzeugt keine
  doppelte Rolle oder Einladung.

## Sicherheits- und Providerchecks

- [ ] Externe `next`-Adresse im Login- und Callback-Link wird verworfen.
- [ ] Google und Apple mit derselben verifizierten E-Mail ergeben nur ein
  Auth-Konto/Profil; ein abweichender Alias oder Private Relay wird nicht
  automatisch verknüpft.
- [ ] Provider ohne E-Mail bleibt bis zur Ergänzung und Bestätigung einer
  regulären Adresse gesperrt. Diese Adresse wird nicht stillschweigend als
  Recovery-Adresse verwendet.
- [ ] Direkter API-/Datenbankzugriff eines unvollständigen Kontos liefert
  keine Fach-, Vereins- oder Teamdaten.

## Abnahmeprotokoll

| Prüfer | Gerät/Browser | Umgebung/Version | Datum | Ergebnis/Befund |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Offene Befunde werden getrennt von der technischen Prüfung bewertet. Diese
Checkliste bestätigt weder Rechtsgrundlagen noch den Produktionsbetrieb.
