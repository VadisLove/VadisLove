# Technischer Bericht: Schritt 3 – Passwortverwaltung

Stand: 22.09.2026

## Ziel und Nutzungskontext

Zielentität ist die Passwortanmeldung einer Person mit bestätigter Auth-E-Mail.
Der Schritt umfasst den Passwortwechsel im angemeldeten Profil sowie die
öffentliche Wiederherstellung auf mobilen und Desktop-Webbrowsern. Bestehende
Onboarding-, Elternfreigabe-, Rollen- und RLS-Sperren bleiben unverändert.

Betroffen sind angemeldete Personen mit Passwortidentität, angemeldete
OAuth-only-Personen mit bestätigter E-Mail sowie abgemeldete Personen im
Recovery-Ablauf. Organisationen, Trainer und Administratoren können keine
Passwörter anderer Personen ändern.

## Umgesetzter Umfang

- Im Profil lässt sich ein Passwort mit mindestens acht Zeichen und doppelter
  Eingabe setzen oder ändern.
- Ein bestehendes Passwortkonto bestätigt die Änderung durch eine frische
  Passwortanmeldung an der bereits authentifizierten Login-E-Mail. Zusätzlich
  wird `current_password` beim Update übergeben.
- Ein OAuth-only-Konto fordert für das erstmalige Setzen eines Passworts einen
  E-Mail-Einmalcode über Supabase Reauthentication an.
- Nach einer Profiländerung bleibt die neue aktuelle Sitzung bestehen; andere
  Sitzungen werden widerrufen. Schlägt dieser Widerruf fehl, beendet der
  strengere Fallback alle Sitzungen.
- `/passwort-vergessen` liefert unabhängig von Kontoexistenz und Provider eine
  neutrale Antwort und nutzt die Supabase-Auth-Limits. Cloudflare Turnstile ist
  als optionale weitere Schutzschicht dokumentiert, aber nicht aktiviert.
- Recovery-E-Mails verwenden auch bei einer Anfrage aus einer Vorschau die
  verbindliche öffentliche App-Adresse. Passwortfelder können auf Wunsch lokal
  angezeigt und wieder verborgen werden.
- Der Recovery-Link wird im Auth-Callback eingelöst. Eine kurzlebige,
  HttpOnly-signierte Berechtigung bindet `/passwort-zuruecksetzen` an Nutzer
  und Ablaufzeit. Nach dem Reset werden alle Sitzungen beendet.
- Passwörter, Codes, Tokens und der freigegebene Testempfänger werden weder im
  Repository noch in Diagnosetexten gespeichert.

## Ausgeschlossener Umfang

Nicht enthalten sind die Aktivierung von Google oder Apple, manuelles
Provider-Linking, Passwortänderungen durch Dritte, eine eigene E-Mail-
Versandinfrastruktur und die Aktivierung von Cloudflare Turnstile.

## Qualitätsbewertung nach ISO/IEC 25002

| Qualitätsmerkmal | Mess- oder Prüfverfahren | Abnahmekriterium |
| --- | --- | --- |
| Funktionale Eignung | Domain- und Vertragstests, Browserprüfung | Setzen, Ändern und Recovery folgen den bestätigten Abläufen. |
| Sicherheit | Quelltextprüfung, Grant-Signaturtests, anonyme Recovery-Antwort | Kein Konto-Leak; Reset nur mit gültiger nutzergebundener Berechtigung; Sitzungswiderruf wie festgelegt. |
| Interaktionsfähigkeit | Desktop- und Mobile-Browserprüfung | Öffentlicher Einstieg und Rückmeldungen sind verständlich und ohne App-Navigation nutzbar. |
| Zuverlässigkeit | Fehlerpfade, abgelaufene und manipulierte Grants | Fehler führen zu erneutem Login oder neuer Recovery-Anfrage, nicht zu einem offenen Reset. |
| Wartbarkeit | Zentralisierte Passwortregeln, kommentierte Sicherheitsgrenzen, Typecheck und Lint | Gemeinsame Regeln und nachvollziehbare Verantwortlichkeiten ohne duplizierte Geheimnisse. |

## Technischer Prüfnachweis

Geprüfter und produktiv gebauter Quellstand ist Commit `daa464e` auf
`codex/step-3-password-recovery`, aufbauend auf `bf21c15`. Prüfdatum ist der
22.09.2026.

- `npm run typecheck`: bestanden
- `npm run lint`: bestanden
- `npm test`: 126/126 Tests bestanden
- `npm run build`: bestanden
- `git diff --check`: bestanden
- lokale Browserprüfung von `/passwort-vergessen` in Desktop- und Mobile-Größe
- Weiterleitung einer Reset-Seite ohne gültige Sitzung zur Anmeldung
- produktive Recovery-Anfrage an den freigegebenen externen Testempfänger;
  Supabase bestätigte die Annahme mit HTTP 200

Vercels Produktions-Build mit Node 24.x bestand. Deployment
`dpl_EWwb45J21EamZtEkG8ZwJqsgCjZY` ist `Ready`; die anschließende Prüfung zeigt,
dass der öffentliche Alias `https://trainer-webapp-ruby.vercel.app` auf die
Deployment-URL `https://trainer-webapp-104wbuk2w-vladi-sntlove.vercel.app`
verweist. Der vorherige Produktionsstand `38cd671` ist mit dem Git-Tag
`production/stable-before-step-3-recovery-url-2026-09-22` als Rollback-Punkt
gesichert.

Die Supabase-Auth-URL-Konfiguration wurde am 22.09.2026 geprüft und korrigiert:
Die Site URL lautet nun `https://trainer-webapp-ruby.vercel.app`. Als Redirect-
Ziele bleiben ausschließlich `https://trainer-webapp-ruby.vercel.app/**` und
`http://localhost:3000/**` erhalten. Die konkrete alte Vorschauadresse sowie
die allgemeine Vercel-Vorschau-Wildcard wurden entfernt. Eine neue Recovery-
Anfrage über die Produktionsseite zeigte die neutrale Bestätigung; die Prüfung
des tatsächlich empfangenen Mail-Links erfolgt durch den Nutzer, ohne Token
oder Link in Dokumentation oder Chat zu speichern.

Zum Prüfzeitpunkt begrenzt die konfigurierte Supabase-Auth-Mail-Quote weitere
Recovery-Mails. Daher ist die Konfigurationskorrektur technisch nachgewiesen,
aber der Empfang eines nach der Korrektur erzeugten Links noch als offene
Produktions-Praxisabnahme markiert. Nach Ablauf des Limits genügt genau eine
neue Anfrage über die Produktionsseite und die Prüfung der Zieladresse.

## Bekannte Grenzen und fachliche Praxisabnahme

Der HTTP-200-Nachweis bestätigt nur, dass Supabase die Recovery-Anfrage
angenommen hat. Der tatsächliche Eingang im Postfach, der einmalige Linkaufruf,
das Setzen des neuen Passworts und der anschließende Login müssen durch den
Nutzer bestätigt werden. Nach der Korrektur ist zusätzlich ein neuer
Recovery-Link von der Produktionsseite anzufordern und darauf zu prüfen, dass
er auf `trainer-webapp-ruby.vercel.app` zurückführt. Der Profilwechsel mit einem
realen Passwortkonto und das erstmalige Setzen bei einem realen OAuth-only-Konto
sind noch nicht fachlich abgenommen. Google und Apple sind weiterhin deaktiviert.

Die lokale Prüfung lief mit Node 26.7.0, während das Projekt Node 24.x verlangt.
Der zusätzliche Produktions-Build in Vercels Node-24-Umgebung war erfolgreich.
Die technische Prüfung und die fachliche Praxisabnahme werden bewusst getrennt
ausgewiesen.

Die Prüfschritte für den Nutzer stehen in
[Praxisprüfliste für Schritt 3](mobile-praxispruefliste-schritt-3.md).
