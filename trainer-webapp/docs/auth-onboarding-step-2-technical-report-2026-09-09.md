# Roadmap-Schritt 2: Einfache Anmeldung und Profilerstellung

## Planungsnachtrag vom 21.09.2026

Die fachlichen Ergänzungen stehen verbindlich in der
[Roadmap: Organisationen, Einladungen und Rollen](roadmap.md#bestätigte-ergänzungen-organisationen-einladungen-und-rollen).
Sie erweitern den früheren Vorschlag: Athleten, Trainer, medizinisches
Personal und Eltern dürfen ohne Organisation fortfahren. Verwaltungsnutzer können eine
Organisation anlegen; eine berechtigte Einladung ersetzt die ansonsten nötige
Freigabe. Der Betreiber lädt Verbandsvorstände ein, Verbände ihre Vereine,
Vereine ihre Mitglieder. Einladungen enthalten Organisation und Rolle und
erfordern die Bestätigung der eingeladenen E-Mail sowie bewusste Annahme nach
den persönlichen Pflichtschritten. Weiterleiten allein vergibt keine Rechte.

Erster und zweiter Vorstand sind gleichberechtigt mit getrennten Konten.
Kassenwart und weitere selbst angelegte Rollen benötigen keine externe
Absegnung; sie bleiben zunächst Funktionsbezeichnungen ohne zusätzliche
Zugriffsrechte. Eine Rechteerweiterung folgt erst nach Bedarfsermittlung.
Mehrere Vereine können in einer Liste vorbereitet und gemeinsam eingeladen
werden. Das erweitert den bisherigen Scope: Der frühere Ausschluss einer
vollständigen Organisationsadministration betrifft weitergehende Funktionen,
nicht diese ausdrücklich bestätigten Einladungs- und Rollenabläufe.

Passwortsetzen nach ergänzter, bestätigter E-Mail ist optional. Apple Private
Relay ist erlaubt; normale Notfallkontakte bleiben ein separater Kanal.
Ab dem vollendeten 16. Lebensjahr ist das Onboarding selbstständig möglich;
unter 16 ist eine bestätigte Elternfreigabe erforderlich, auch unter 13.
Bei Login-Verlust bestätigen Trainer die persönliche Prüfung; ausschließlich
zuständige `club_board`-/`specialist`-Verantwortliche autorisieren den Support.
Die Löschfrist beträgt 30 Tage für unvollständige Konten ohne Fachdaten,
einschließlich Auth-User, ab Kontoerstellung. Dies gilt auch bei ausstehender
Elternfreigabe; bloßes Einloggen verlängert die Frist nicht. Vollständig
eingerichtete Konten mit offener Vereinsfreigabe sind ausgenommen.

Die ersten Verbandseinladungen benötigen vorerst die gemeinsame Freigabe des
Projektverantwortlichen (Nutzer) UND der zuständigen DRIV-/SK-Vorsitzenden.
Bestätigt ist: Manuelles Verknüpfen
und Entfernen von Login-Methoden bei unterschiedlichen Login-Adressen wird
auf später verschoben. Automatisches Linking gleicher verifizierter E-Mail
bleibt Bestandteil von Schritt 2.
Die Roadmap führt diese Entscheidungen
getrennt von technischen Ausarbeitungen und Veröffentlichungsblockern.
Aus dem vollständig beschriebenen Ablauf wurde anschließend die minimale
Tabelle `onboarding_accounts` abgeleitet. Sie ist kein Rollen- oder
Berechtigungsnachweis; Fachzugriff bleibt an RLS und bestätigte Beziehungen
gebunden.
Dieser Nachtrag ändert nur Planung. Die unten dokumentierten Tests vom
09.09.2026 belegen nicht die neu beschriebenen Funktionen.

Stand: 09.09.2026. Arbeitsbranch: `codex/step-2-auth-onboarding`, aus
`origin/codex/fahrgemeinschaften-release` erzeugt. Dieser Bericht beschreibt
nur lokale Analyse, Tests und Vorbereitung. Es wurden weder eine
Produktionsmigration noch ein Deployment, Push, Providerprojekt, Geheimnis oder
echtes Nutzerkonto erzeugt.

## Einordnung und Qualitätsauftrag

Zielentität: der Web-Login, die Supabase-Auth-Identität, die fachlichen
Profil-/Onboardingdaten und die zugehörigen RLS-Grenzen. Nutzungskontext:
mobile und Desktop-Webnutzung durch neue volljährige sowie minderjährige
Personen, Eltern und Organisationsverantwortliche.

Betroffene Rollen: Athlet, Trainer, medizinische Fachkraft,
Erziehungsberechtigte Person, Organisationskonto sowie die für
Organisationsanfragen zuständigen Verantwortlichen. Administratoren bearbeiten
keine Auth-Identität unmittelbar.

| Qualitätsmerkmal | Prüfverfahren / Abnahmekriterium |
| --- | --- |
| Funktionale Eignung | Ein neuer Nutzer kann den vollständigen Ablauf nachvollziehbar abschließen; der gewählte Zielpfad nach Login bleibt intern. |
| Sicherheit | Ein unvollständiges Konto erhält über RLS und serverseitige Funktionen keinen Zugriff auf Fachdaten; UI-Weiterleitungen sind nur zusätzliche Führung. |
| Datenintegrität | Pro Person/E-Mail entsteht keine unbemerkte zweite fachliche Identität; Dokumentversionen und Elternfreigaben sind nachweisbar. |
| Nutzungsqualität | Mobil ein klarer Schritt nach dem anderen, verständliche Abbruch-/Fehlerzustände und keine Provider-Details in der Oberfläche. |
| Wartbarkeit | Migrationsreihenfolge, Providerkonfiguration, Tests und offene Entscheidungen sind versioniert dokumentiert. |

Dies sind Abnahmekriterien für die spätere Umsetzung, keine ISO-Zertifizierung.
Technische lokale Prüfung, gehostete Staging-Abnahme und bestätigter
Produktionsbetrieb bleiben getrennte Nachweisstufen.

## Analysierter Ist-Zustand

### Anmeldung, Registrierung und Weiterleitungen

- Die gemeinsame Seite `/login` bietet ausschließlich E-Mail/Passwort und eine
  vollständige Registrierung. Google und Apple sind weder im Client sichtbar
  noch in Code oder Konfiguration aktiviert.
- Die Server Action validiert Anzeigename, Kontotyp, Geburtsdatum,
  Organisationsauswahl, Passwort und Dokumentannahme. Sie ruft
  `supabase.auth.signUp` mit versionsgebundenen Metadaten auf.
- `/auth/callback` tauscht den Code gegen eine Sitzung. Login, Callback und
  Proxy verwenden `getSafeRedirectPath`; externe, doppelt kodierte und
  steuerzeichenhaltige Ziele fallen auf `/` zurück.
- Der Proxy validiert die Sitzung per `auth.getUser()`, nicht über den
  unbestätigten Cookie-Inhalt. Geschützte Routen führen ohne Sitzung zum Login;
  geplanter Kontolöschung und ausstehender Elternfreigabe sind eigene Wege.
- Eine bestehende E-Mail kann vom Auth-Dienst absichtlich als Erfolg ohne neue
  Identity beantwortet werden. Der Code verschickt dann keine Elternfreigabe.
  Eine fachliche Entscheidung zur OAuth-Verknüpfung existiert noch nicht.

### Datenmodell, Trigger und RLS

- `public.handle_new_user()` erstellt ein Profil, eine
  `notification_preferences`-Zeile, zwei versionierte
  `legal_document_acceptances`, bei gültiger Organisation eine offene
  `membership_requests`-Zeile und bei Minderjährigen eine
  `guardian_approval_requests`-Zeile. Ein Geburtsdatum wird nach der Prüfung
  aus `auth.users.raw_user_meta_data` entfernt.
- Das Profil enthält Anzeigename, getrennte Namen, E-Mail, Kontotyp und
  optionale Kontakt-/Profilfelder. Die Organisationsanfrage ist ausdrücklich
  noch keine Rolle oder Berechtigung.
- `private.account_is_active` sperrt Löschungskandidaten und nicht bestätigte
  Minderjährige. Die Migration für Elternfreigaben legt auf den geschützten
  Anwendungstabellen restriktive `active_accounts_only`-Policies an. Damit
  verweigert die Datenbank direkte REST-/RLS-Zugriffe, nicht nur die UI.
- `guardian_approval_requests`, `legal_document_acceptances` und
  Kontolöschstatus bleiben als eng begrenzte Workflow-Ausnahme lesbar. Tokens
  werden nur dem serverseitigen Versandweg geliefert und ausschließlich als
  Hash gespeichert.
- Kontaktfelder werden nicht allgemein über die Data API erteilt; eigene
  Profil-/E-Mail-Daten kommen aus fest an `auth.uid()` gebundenen RPCs.

### Lücke gegenüber Roadmap-Schritt 2

Der E-Mail/Passwort-Ablauf erfüllt bereits wesentliche Teile der
Datenerfassung und Minderjährigen-Sperre. Es fehlen jedoch ein providerneutrales
Onboardingmodell, ein eindeutiger Abschlussstatus für OAuth-Identitäten,
serverseitig kontrollierte Identitätsverknüpfung und die Entscheidungen, wann
eine Organisationsfreigabe den Abschluss beeinflusst. Deshalb darf eine
Google-/Apple-Identität noch nicht produktiv angelegt oder freigeschaltet
werden.

## Vorgeschlagener Onboarding-Ablauf

1. Auf `/login` wählt die Person E-Mail/Passwort, Google oder Apple. Nach
   erfolgreicher Authentisierung ist die Identität nur angemeldet, nicht
   fachlich aktiv.
2. Ein serverseitig gelesenes Onboarding-Statusmodell leitet ausschließlich zu
   `/onboarding` weiter. Der gewünschte interne Zielpfad wird kurzlebig und
   validiert mitgeführt; Abbruch bleibt gesperrt und bietet Abmelden oder
   Fortsetzen an.
3. Mobile Einzelschritte: Anzeigename/erforderliche Profildaten, Kontotyp,
   Geburtsdatum mit Altersprüfung, Verein oder Landesverband, die jeweils
   aktuellen Dokumentversionen und – bei Minderjährigen – Elternadresse und
   Warteseite. Jeder Schritt erklärt Zweck und den nächsten Zustand; ein
   Fehler erhält die Eingaben, ohne interne Providerfehler preiszugeben.
4. Der Server speichert die minimal nötigen Angaben transaktional. Die
   Organisationsauswahl erzeugt nur eine nachvollziehbare Anfrage; eine Rolle
   entsteht erst nach dem bereits vorhandenen Freigabeprozess.
5. `onboarding_completed_at` wird ausschließlich durch eine privilegienarme,
   auth.uid()-gebundene Datenbankfunktion gesetzt, wenn alle Pflichtnachweise
   vorhanden sind. Erst dann liefert `private.account_is_active` `true`.
   Minderjährige benötigen darüber hinaus eine bestätigte Elternfreigabe.
6. Nach Abschluss führt der Ablauf nur zu dem validierten ursprünglichen Pfad,
   sonst zur Startseite. Callback-, Abbruch- und Fehlerpfade bleiben immer
   intern; Provider- oder E-Mail-Konflikte führen zu einer neutralen
   Hilfeseite, nicht zu einer Kontenaufzählung.

### Datenmodell und Berechtigungen für die spätere Umsetzung

Vorgeschlagen ist eine neue, nicht allgemein beschreibbare Tabelle
`onboarding_states` mit `user_id` (1:1 zu `profiles`), Status, begonnen-/
abgeschlossen-/abgebrochen-am, zuletzt abgeschlossenem Schritt und einer
festen Dokumentanforderungsreferenz. Sie enthält weder OAuth-Tokens noch ein
Klartextgeburtsdatum. Änderungen erfolgen nur über explizite RPCs mit
`auth.uid()`-Bindung und serverseitiger Prüfung; `service_role` bleibt auf
Serverjobs beschränkt.

Die bestehende zentrale Funktion `private.account_is_active` wird um den
Abschlussstatus ergänzt. Dadurch bleiben die vorhandenen restriktiven
RLS-Policies und vorhandenen fachlichen RPCs wirksam. Vor einer Migration muss
eine vollständige Policy-/RPC-Inventur erfolgen: Direkte eigene Profil- und
Onboarding-Reads müssen den Fortsetzungsweg erlauben, sonst nichts. Ein
JWT-`user_metadata` darf weder für Abschluss noch für Rollen verwendet werden.

### Ergänzende technische Planungsanforderungen

- **OAuth-Identitätsverknüpfung:** Supabase kann Identitäten automatisch oder
  manuell verknüpfen. Die Oberfläche benötigt einen eindeutigen
  Verknüpfungsdialog: Sie erklärt, welche Methode einem bereits angemeldeten
  Konto hinzugefügt wird, fordert bei Bedarf eine erneute Authentisierung an
  und zeigt erst danach den Erfolg. Bei Konflikt, abgebrochener
  Reauthentisierung oder fehlender bestätigter E-Mail bleibt das bestehende
  Konto unverändert; es wird keine zweite fachliche Identität angelegt.
- **Datenschutzkonforme Bereinigung:** Ein späterer, im vorhandenen
  Supabase-Projekt kontrolliert eingerichteter `pg_cron`-Job bereinigt nur
  unvollständige Konten ohne Fachdaten nach 30 Tagen ab Kontoerstellung,
  einschließlich ausstehender Elternfreigabe. Einloggen verlängert die Frist
  nicht. Vor der Löschung wird der aktuelle Abschlussstatus erneut geprüft;
  vollständig eingerichtete Konten mit offener Vereinsfreigabe sind ausgenommen.
  Abhängige Onboardingdaten und Auth-Identität werden mitbereinigt. Job,
  Berechtigungen, Ausführungsprotokoll und Rückfallverhalten sind separat zu
  testen; kein automatischer Produktivjob ohne Freigabe.
- **Idempotenter Abschluss und Wiederaufnahme:** Der Abschluss-RPC soll den
  gesamten serverseitig vorhandenen Status zurückgeben und bei Wiederholung
  denselben Abschlusszustand liefern. Nach Netzwerk- oder Browserabbruch lädt
  `/onboarding` den Status erneut, führt zur letzten unvollständigen Eingabe
  zurück und verwirft keine bereits bestätigten Schritte. Erst nach einer
  erfolgreichen Datenbanktransaktion wird die Navigation zur Zielseite
  freigegeben.

### Bestätigte Produktentscheidungen vom 09.09.2026

- **Persönlicher Modus statt Organisationswartezimmer:** Nach vollständig
  abgeschlossenem Onboarding ist das Konto aktiv. Eine offene
  Organisationsanfrage sperrt den persönlichen Modus nicht: Eigene Termine und
  persönliche Trainingspläne sind sofort nutzbar. Vereins-, Team- und
  Organisationsdaten bleiben bis zur Rollenfreigabe ausschließlich durch RLS
  und bestehende fachliche Policies unsichtbar und nicht veränderbar. Das UI
  zeigt den offenen Beitritt als Status, nicht als Blockade.
- **OAuth-Linking mit gleicher verifizierter E-Mail:** Das automatische
  Supabase-Linking ist erlaubt. Es darf nur bei derselben verifizierten,
  eindeutigen E-Mail eine zusätzliche Google- oder Apple-Identität an das
  bestehende Auth-Konto binden; es entsteht kein zweites Profil. Die UI zeigt
  anschließend die erfolgreiche Verknüpfung und verweist bei jeder nötigen
  erneuten Authentisierung klar in den Providerfluss. Abweichende,
  nicht verifizierte oder fehlende E-Mail-Adressen werden nicht automatisch
  verknüpft und folgen dem später festzulegenden manuellen Konfliktablauf.
- **OAuth ohne Provider-E-Mail:** Liefert Google oder Apple keine E-Mail,
  darf die Person im Onboarding eine reguläre E-Mail-Adresse eingeben und
  über einen Link bestätigen und danach ein Passwort festlegen. Damit ist
  E-Mail/Passwort neben der OAuth-Identität ein zulässiger Login-Weg. Bis zur
  Bestätigung bleibt der Zugang per RLS gesperrt; ein Abbruch fällt unter die
  30-Tage-Löschfrist. Eine Apple Private-Relay-Adresse ist dagegen eine
  verwendbare Login-Adresse. Die Oberfläche bittet ergänzend um eine
  verifizierte reguläre Kontaktadresse, ohne die Relay-Adresse zu ersetzen.
- **Abgebrochene Onboardings löschen:** Unvollständige Konten ohne Fachdaten
  erhalten eine Abschlussfrist von 30 Tagen. Danach werden
  Onboardingstatus und alle zugehörigen fachlichen Hilfsdaten vollständig
  gelöscht; der serverseitige Bereinigungsdienst löscht anschließend auch den
  Auth-User. Vor dem Auth-Löschen wird der Zustand transaktional gesperrt,
  damit RLS auch einen noch nicht abgelaufenen JWT ablehnt. Der Dienst nutzt
  einen ausschließlich serverseitigen Service-Role-Client und niemals einen
  Browser-Schlüssel. Da `pg_cron` GoTrue nicht selbst administriert, löst er
  nur einen authentisierten internen Worker aus. Dieser ist idempotent,
  protokolliert keine Klartext-E-Mail und behandelt fehlende Auth-User als
  bereits bereinigt.
- **Login-Verlust verhindern und streng bearbeiten:** Bei Apple Private Relay
  oder einer vergleichbar problematischen Identität fordert die Profilseite
  freundlich zu einer alternativen regulären Kontakt-E-Mail auf. Diese
  Adresse ist ein gesonderter, verifizierter Kontaktkanal und keine
  automatische Login-Methode. Der globale Support nimmt keine E-Mail-Änderung
  auf bloßen Zuruf vor. Nach persönlicher Identitätsprüfung durch Trainer oder
  Vereinsadministration autorisieren ausschließlich zuständige
  `club_board`-/`specialist`-Verantwortliche den technischen Support zu einer
  kontrollierten Änderung. Trainer bestätigen nur die Prüfung. Für Minderjährigen-
  und Gesundheitsdaten verlangt der Ablauf zusätzlich die jeweils zuständige
  Berechtigung; die genaue Nachweisform wird vor Einführung mit dem Betreiber
  und rechtlich geprüft.

## Entscheidungsstand (mit Nachtrag vom 21.09.2026)

Bereits bestätigte Punkte bleiben festgelegt. Für die noch offenen Punkte
ist die aktuelle Liste im Roadmap-Nachtrag maßgeblich:

1. **Gleiche E-Mail / bestehendes Passwortkonto (entschieden):** Das
   automatische Supabase-Linking ist bei gleicher verifizierter E-Mail erlaubt.
   Es bindet nur eine weitere Identität an das bestehende Konto und erzeugt
   kein weiteres Profil.
2. **Provider ohne E-Mail (entschieden):** Im Onboarding wird eine reguläre
   E-Mail abgefragt und per Link bestätigt. Vor der Bestätigung bleibt das
   Konto gesperrt; fehlende oder abweichende Provider-E-Mails werden nie
   automatisch verknüpft.
3. **Apple „E-Mail verbergen“ (entschieden):** Relay-Adressen sind verwendbar.
   Eine reguläre verifizierte Notfallkontaktadresse wird ergänzend angeboten;
   sie löst keine automatische Zusammenführung mit einem anderen Konto aus.
4. **Mehrere Login-Methoden (abgegrenzt):** Manuelles Verknüpfen und Entfernen
   bei unterschiedlichen Login-Adressen wird auf später verschoben.
   Automatisches Linking gleicher verifizierter E-Mail bleibt vorgesehen.
5. **Abgebrochenes Onboarding (entschieden):** Fortsetzung innerhalb von
   30 Tagen ab Kontoerstellung; danach Löschung unvollständiger Konten ohne
   Fachdaten einschließlich Auth-Identität. Dokumentwechsel und abhängige
   Organisationsanfragen sind im technischen Ablauf auszuarbeiten.
6. **Organisation und Freigabe (entschieden):** Auswahl plus offene Anfrage
   reicht für den Onboarding-Abschluss. Der persönliche Modus ist sofort
   verfügbar; Vereins- und Teamzugriff folgt ausschließlich bestätigten Rollen
   und RLS.
7. **Rechtstexte:** Betreiber, Rechtsform, vollständige Anschrift und Kontakt
   fehlen weiterhin. Die vorhandenen Entwürfe und Versionen sind kein Ersatz
   für die fachlich/rechtlich freigegebenen Texte.
8. **Aufbewahrung und Löschung abgebrochener Abläufe (entschieden):** Nach 30
   Tagen erfolgt Hard Delete einschließlich Auth-User. Zulässige,
   nicht personenbezogene Betriebsmetriken sind vor der Migration festzulegen.

## Vorgabe für Roadmap-Schritt 3: Passwortverwaltung

Konten mit bestätigter E-Mail-Identität können im Profilbereich ein Passwort
festlegen oder ändern. Der Ablauf fordert bei länger bestehender Sitzung eine
erneute Authentisierung beziehungsweise einen Einmalcode; das neue Passwort
wird zweimal eingegeben und niemals protokolliert. OAuth-only-Konten ohne
bestätigte E-Mail erhalten statt eines Passwortformulars eine Erklärung und
den jeweils verfügbaren Providerweg.

Für „Passwort vergessen“ entsteht eine öffentliche, rate-limitierte Seite.
Sie zeigt unabhängig davon, ob die E-Mail existiert oder ein Passwort hinterlegt
ist, dieselbe neutrale Erfolgsmeldung. Supabase sendet einen Recovery-Link nur
an die bestätigte Auth-E-Mail. Der Link führt ausschließlich auf eine eigene
Passwort-zurücksetzen-Seite; dort wird der Recovery-Status geprüft, ein neues
Passwort gesetzt und anschließend zur Anmeldung geführt. Abgelaufene oder
verbrauchte Links können nur einen neuen Versand auslösen. Der Ablauf darf
weder Onboarding-/Elternfreigabe-/RLS-Sperren umgehen noch E-Mail-Adressen
bestätigen. Provider-only-Konten verwenden weiterhin Google oder Apple; eine
alternative Kontaktadresse wird nicht ohne ausdrückliche Verifikation zur
Login-Adresse gemacht.

## Spätere Supabase- und Provider-Konfiguration

Erst nach den Entscheidungen und einer gesonderten Freigabe:

- finale Produktbezeichnung und die bestehende öffentliche Adresse
  `https://trainer-webapp-ruby.vercel.app` in Google, Apple und Supabase als
  zulässige Callback-/Redirect-Adresse konfigurieren;
- Google- und Apple-Provider im vorhandenen Supabase-Projekt aktivieren,
  Client-ID/Secret bzw. Apple-Key-ID, Team-ID und privater Schlüssel nur in
  den jeweiligen Secret-Speichern hinterlegen; Schlüsselrotation dokumentieren;
- E-Mail-Bestätigung, Redirect-Allowlist, Rate Limits, CAPTCHA-/Bot-Schutz
  und Providerfehlertexte konfigurieren und mit rein synthetischen Konten
  testen;
- keine neuen Vercel-, Supabase-, Google- oder Apple-Projekte erzeugen; keine
  Secrets in Quellcode, Tests, Logs oder Git schreiben.

## Datenschutz- und Sicherheitsgrenzen

Geburtsdaten nur für die Prüfung verarbeiten und wie bisher entfernen; dauerhaft
reicht das Freigabe-Enddatum. Dokumentannahmen speichern Version, Zeitpunkt,
betroffene und handelnde Person, nicht mehr als nötig. Elternrechte entstehen
nur aus einer bestätigten Beziehung, nie aus Benachrichtigungs-Einstellungen.
OAuth-Anbieter erhalten keine Organisations-, Minderjährigen- oder
Dokumentdaten. Konten-E-Mail-Adressen dürfen über Fehlermeldungen, RPCs oder
Providerkonflikte nicht bestätigbar werden.

Ausgeschlossen: öffentliche Aktivierung von Google/Apple, Migration auf
Produktion, Deployment, Push, neue Projekte, Passwortwechsel (Roadmap-Schritt
3), Kontozusammenführung, Selbstbedienungs-Verknüpfung mehrerer Provider,
vollständige Organisationsadministration, native Apps und die Erfindung von
Rechtstextdaten.

## Lokale Änderungen und Prüfstatus

- Neuer Test `tests/auth-onboarding-contract.test.mjs`: sichere interne
  Redirects, Nutzung des gemeinsamen Redirect-Schutzes in Login/Callback/
  Proxy, Sperrweg für unvollständige Minderjährigenkonten und der
  Duplikat-Schutzvertrag beim Signup.
- Vorhandene datenbanknahe Tests decken Altersgrenzen, fehlende
  Dokumentversionen, gesperrte Minderjährige, Tokenmissbrauch und bestätigte
  Elternfreigabe mit synthetischen Daten ab.
- Migration `20260921102535_step_2_auth_onboarding.sql`: führt einen
  geschützten Onboardingstatus für neue Konten ein, setzt die Onboardinggrenze
  in der Auth-Triggerlogik auf den 16. Geburtstag, erlaubt die freiwillige
  Organisationsauswahl und erweitert `private.account_is_active` als
  serverseitige/RLS-wirksame Sperre. Bestehende Konten werden nicht pauschal
  gesperrt, weil die für eine rückwirkende Altersentscheidung notwendigen
  Geburtsdaten absichtlich nicht gespeichert sind.
- Die Registrierungsoberfläche und ihre Server Action lassen Athleten,
  Trainer, medizinisches Personal und Eltern ohne Organisation fortfahren.
  Eine vorhandene Auswahl bleibt eine offene Anfrage; sie erteilt keine Rolle.
- Die Datenbanksperre ist unabhängig von einer UI-Weiterleitung. Ein Redirect
  auf die noch nicht implementierte Provider-Onboardingseite wurde bewusst
  nicht aktiviert; Google und Apple bleiben bis zu diesem UI-Schritt aus.
- Der serverseitige Bereinigungsworker beansprucht fällige Konten atomar,
  sperrt sie als `deletion_due` und löscht die Auth-Identität mit dem nur
  serverseitig verwendeten Service-Role-Client. Fehlgeschlagene Löschungen
  bleiben für einen idempotenten Folgelauf beansprucht. Route und Secretname
  sind vorbereitet; Scheduler und Produktionssecret sind nicht aktiviert.
- `tests/registration-age.test.mjs` prüft unter 13, unter 16 und exakt ab dem
  16. Geburtstag. `tests/auth-onboarding-contract.test.mjs` prüft außerdem
  die freiwillige Organisationsauswahl, sichere Redirects und den
  Metadaten-freien RLS-Vertrag.

Prüfdatum: 21.09.2026, im isolierten Worktree. `npm test` bestand mit
**116/116** Tests; `npm run typecheck`, `npm run lint`, `npm run build` und
`git diff --check` bestanden ebenfalls. Die neue Migration wurde gemeinsam
mit dem bestehenden Elternfreigabe-Schema in einer frischen isolierten
PGlite-Datenbank angewandt. Geprüft wurden unter anderem unter 13, unmittelbar
vor und exakt ab dem 16. Geburtstag, RLS-Sperre, bestätigte Elternbeziehung,
Browserrollen ohne Cleanup-Recht sowie der Wettlauf zwischen Freigabe und
Bereinigungs-Claim. Die vollständige Docker-basierte Supabase-CLI-Umgebung war
auf dem Host nicht verfügbar. Die
verfügbare lokale Node-Version war 26.7.0, obwohl das Projekt
Node 24.x verlangt; `nvm` und eine lokale Node-24-Installation waren auf diesem
Host nicht verfügbar. Die Ergebnisse sind deshalb ein zusätzlicher lokaler
Nachweis, kein Ersatz für die spätere, unter Node 24 auszuführende
Releaseprüfung. Die statische Duplikat-Prüfung bestätigt den lokalen
Fehler-/Token-Vertrag; den tatsächlichen Google-/Apple-Identitätslink kann sie
ohne bewusst nicht aktivierten Provider nicht ersetzen.

Vor einer Produktionsfreigabe sind die verbleibenden Entscheidungen, finale
Rechtstexte, Providerkonfiguration, RLS-/RPC-Migration mit lokaler und
isolierter Datenbankprüfung, mobile Praxisabnahme, kontrollierte
synthetische Provider-Tests, getrennte Staging-Abnahme sowie die übliche
Release-Freigabe erforderlich. Release 1 bleibt unabhängig davon fachlich
offen; sein kontrollierter technischer Produktionsbetrieb wird durch diese
Arbeit nicht verändert.
