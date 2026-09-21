# Onboarding-Ablauf für Roadmap-Schritt 2

Planungsstand: 21. September 2026. Dieser Ablauf ist die fachliche Grundlage
für die spätere Datenbankmigration, Oberfläche und Tests. Er aktiviert keine
Provider, erzeugt keine Konten und ändert keine Produktionsdaten.

## Ziel und Zugriffsstufen

Eine Person darf die Anwendung erst nach den für sie erforderlichen
Onboarding-Schritten nutzen. Danach ist der persönliche Bereich sofort
verfügbar. Organisationsdaten und Funktionen folgen ausschließlich aus einer
bestätigten Rolle; eine offene Vereinsanfrage oder fehlende Mitgliedschaft
sperrt weder eigene Termine noch persönliche Trainingspläne.

| Zugriffsstufe | Zulässig | Nicht zulässig |
| --- | --- | --- |
| Onboarding unvollständig | Eigene Onboarding-, E-Mail-Bestätigungs- und Elternfreigabeseiten | Persönliche Fachfunktionen, Vereinsdaten, Teamkalender, Rollenverwaltung |
| Persönlicher Modus | Eigene Termine, persönliche Trainingspläne, eigenes Profil | Vereins- und Teamdaten ohne bestätigte Mitgliedschaft oder Rolle |
| Organisationsrolle | Persönlicher Modus plus die Rechte der bestätigten Rolle innerhalb der zugeordneten Organisation | Daten anderer Organisationen oder zusätzliche Rechte allein aufgrund einer Amtsbezeichnung |

Die Datenbank setzt diese Grenzen mit RLS und serverseitigen Prüfungen durch.
Weiterleitungen in der Oberfläche dienen nur der verständlichen Führung.

## Gemeinsame Regeln

- Zulässige Login-Wege sind E-Mail/Passwort, Google und Apple.
- Bei derselben verifizierten E-Mail darf Supabase eine weitere Google- oder
  Apple-Identität automatisch an das bestehende Auth-Konto binden. Es entsteht
  kein zweites Profil.
- Apple Private Relay ist eine zulässige Login-Adresse. Eine zusätzliche
  reguläre, verifizierte Kontaktadresse ist ein Notfallkontakt und verändert
  die Login-Adresse nicht automatisch.
- Unterschiedliche Login-Adressen werden in Schritt 2 nicht manuell
  verknüpft oder entfernt. Dieser Funktionsumfang folgt später.
- Der ursprüngliche interne Zielpfad wird nur nach erfolgreichem Abschluss
  verwendet. Externe und unsichere Redirect-Ziele werden verworfen.
- Jeder Zustand wird beim Seitenaufruf serverseitig erneut bestimmt. Ein
  Netzwerk- oder Browserabbruch führt beim nächsten Aufruf zur passenden
  Fortsetzungsseite, ohne bereits bestätigte Angaben zu verlieren.

## Nutzerabläufe

### 1. Registrierung mit E-Mail und Passwort

1. Die Person öffnet „Registrieren“, gibt E-Mail und Passwort ein und erhält
   einen Bestätigungslink.
2. Bis zur E-Mail-Bestätigung sieht sie nur die Fortsetzungsseite. Ein erneuter
   Versand ist möglich, ohne preiszugeben, ob eine andere E-Mail bereits
   registriert ist.
3. Nach dem Link werden Anzeigename, Kontotyp, Geburtsdatum und die aktuellen
   Dokumentversionen erfasst beziehungsweise geprüft.
4. Die Person entscheidet gemäß Kontotyp über die Organisationsauswahl.
5. Nach allen Pflichtschritten erhält sie den persönlichen Modus oder bei
   Minderjährigen die Warteseite für die Elternfreigabe.

### 2. Registrierung mit Google oder Apple

1. Die Person wählt Google oder Apple und bestätigt den Provider-Login.
2. Hat die Identität eine verifizierte E-Mail, wird sie als vorhandener
   Login-Weg gespeichert. Fehlende Profilangaben werden im Onboarding ergänzt.
3. Liefert der Provider keine E-Mail, erfasst das Onboarding eine reguläre
   E-Mail und bestätigt sie per Link. Erst danach kann die Person ein Passwort
   festlegen und damit E-Mail/Passwort als zusätzlichen Login-Weg nutzen.
4. Apple Private Relay bleibt verwendbar. Das Profil bietet zusätzlich einen
   verifizierten Notfallkontakt an.
5. Enthält das Auth-Konto bereits alle Pflichtnachweise, öffnet es direkt den
   persönlichen Modus; sonst wird der letzte unvollständige Schritt fortgesetzt.

### 3. Persönliches Onboarding nach Kontotyp

| Kontotyp | Pflichtschritte | Organisationsweg | Ergebnis nach Abschluss |
| --- | --- | --- | --- |
| Athlet | Name, Alter, Dokumente; bei Minderjährigkeit Elternfreigabe | Verein wählen oder ohne Verein fortfahren | Persönlicher Modus; Vereinszugriff erst nach bestätigter Mitgliedschaft |
| Trainer | Name, Alter, Dokumente | Verein wählen oder ohne Verein fortfahren | Persönlicher Modus |
| Medizinisches Personal | Name, Alter, Dokumente | Verein wählen oder ohne Verein fortfahren | Persönlicher Modus |
| Eltern | Name, Alter, Dokumente | Ohne Verein fortfahren | Persönlicher Modus; Rechte für Kinder nur aus bestätigter Beziehung |
| Organisationsverwaltung | Name, Alter, Dokumente | Einladung annehmen, bestehende Organisation wählen oder Organisation anlegen | Persönlicher Modus; Organisationsverwaltung erst mit gültiger Rolle/Freigabe |

Telefon, Profilfoto, Wohnort, Kurzbeschreibung und Disziplinen sind keine
Voraussetzung für den persönlichen Modus.

### 4. Minderjährige und Elternfreigabe

1. Ab dem vollendeten 16. Lebensjahr kann die Person das Onboarding
   selbstständig abschließen.
2. Unter 16 wird eine andere gültige E-Mail eines Sorgeberechtigten benötigt.
   Diese Person erhält einen einmaligen, zeitlich begrenzten Link zur
   Elternfreigabe. Das gilt auch für unter 13-Jährige; die App führt sie
   besonders verständlich durch diesen Ablauf, verwendet aber keine davon
   abweichende Freigabelogik.
3. Bis zur bestätigten Elternfreigabe bleibt das Konto vollständig im
   Onboarding-Zugriff. Die Person sieht den Status, kann den Versand erneut
   anfordern und sich abmelden.
4. Ablehnung oder abgelaufener Link lassen das Konto gesperrt. Ein neuer Link
   kann innerhalb der Aufbewahrungsfrist angefordert werden.
5. Nach Bestätigung werden die Elternrechte nicht aus der E-Mail abgeleitet,
   sondern aus der bestätigten Beziehung. Danach erhält das minderjährige Konto
   den persönlichen Modus.

### 5. Organisationsauswahl ohne Einladung

Athleten, Trainer, medizinisches Personal und Eltern können ohne Verein oder
Verband fortfahren. Eine freiwillige Auswahl erzeugt eine nachvollziehbare
Beitrittsanfrage, aber keine Rolle.

Eine Verwaltungsregistrierung ohne berechtigte Einladung kann eine
Organisation vorbereiten. Sie erhält jedoch keine Mitglieder- oder
Organisationsrechte, bis die vorgesehene Freigabe erfolgt. Die erste
Verbandsfreigabe benötigt vorerst die gemeinsame Zustimmung des
Projektverantwortlichen und der zuständigen DRIV-/SK-Vorsitzenden.

### 6. Einladung annehmen

1. Eine berechtigte Stelle erstellt eine persönliche E-Mail-Einladung mit
   Organisation und vorgesehener Rolle.
2. Der Link zeigt Organisation und Rolle an. Er führt zur Anmeldung oder
   Registrierung, ohne einen zusätzlichen Button auf der allgemeinen
   Anmeldeseite zu benötigen.
3. Die Person meldet sich an oder registriert sich und schließt ihre
   persönlichen Pflichtschritte ab.
4. Die eingeladene E-Mail wird bestätigt. Das reine Öffnen oder Weiterleiten
   eines Links genügt nie für die Rollenvergabe.
5. Die Person nimmt die Einladung bewusst an. Danach erhält sie die konkrete
   Rolle ohne zusätzliche Absegnung.

Einladungen folgen der Kette Betreiber → Verbandsvorstände → Vereine →
Mitglieder. Ein bestätigter Verband kann mehrere Vereine in einer Liste
vorbereiten und gemeinsam einladen. Pro Einladung sind Entwurf, versendet,
angenommen, abgelehnt, widerrufen und abgelaufen sichtbar. Doppelte
Organisationen und doppelte offene Einladungen werden vor Versand abgefangen.

Erster und zweiter Vorstand haben dieselben Verwaltungsrechte und jeweils ein
eigenes Konto. Kassenwart und weitere frei angelegte Rollen sind zunächst
Funktionsbezeichnungen ohne zusätzliche Zugriffsrechte. Eine spätere
Rechteerweiterung benötigt eine eigene Berechtigungsmatrix.

### 7. Abschluss, Abbruch und Bereinigung

- Der Abschluss prüft alle Pflichtnachweise in einer Datenbanktransaktion. Bei
  Wiederholung liefert er denselben Resultatzustand.
- Ein Abbruch behält nur die zum Fortsetzen erforderlichen Angaben. Das Konto
  bleibt bis zum Abschluss gesperrt.
- Ein unvollständiges Konto ohne Fachdaten wird 30 Tage nach Kontoerstellung
  vollständig gelöscht, einschließlich Auth-Identität. Einloggen verlängert
  die Frist nicht.
- Vollständig eingerichtete Konten mit einer offenen Vereinsfreigabe werden
  nicht gelöscht.
- Vor der Löschung sperrt der Server den Zustand erneut, beendet die Sitzung
  und löscht anschließend Auth-Identität und zugehörige Onboardingdaten. Ein
  Bereinigungsjob behandelt bereits entfernte Auth-Identitäten idempotent.

## Fehler- und Sonderfälle

| Situation | Sichtbarer Ablauf | Serverseitiges Ergebnis |
| --- | --- | --- |
| Netzwerkabbruch beim Speichern | „Verbindung unterbrochen. Bitte erneut öffnen.“ | Bereits bestätigte Schritte bleiben erhalten; Status wird erneut gelesen |
| Login mit abgeschlossenem Konto | Direkter Einstieg in den persönlichen Bereich oder den sicheren ursprünglichen Pfad | Keine erneute Registrierung, kein zweites Profil |
| Login mit unvollständigem Konto | Fortsetzung an der ersten fehlenden Pflichtangabe | RLS bleibt bis zum Abschluss gesperrt |
| Bereits verwendete Einladung | Verständlicher Hinweis ohne Rollenänderung | Einmalige Annahme bleibt unverändert |
| Abgelaufene oder widerrufene Einladung | Hinweis und Kontakt zur einladenden Organisation | Keine Rollenvergabe |
| Einladung an bereits berechtigte Person | Hinweis auf vorhandene Rolle | Keine doppelte Mitgliedschaft oder Rolle |
| Eingeladene E-Mail und Login-Adresse unterscheiden sich | Aufforderung zur Bestätigung der eingeladenen Adresse | Keine automatische Verknüpfung unterschiedlicher Konten |
| Elternfreigabe abgelehnt | Warteseite mit Status | Konto bleibt gesperrt |
| 30 Tage erreicht | Keine App-Nutzung mehr | Vollständige Bereinigung, sofern Onboarding nicht abgeschlossen |

## Abgeleitete fachliche Zustände

Die Oberfläche kann viele Schritte anzeigen, doch sie benötigen nicht alle
einen eigenen dauerhaft gespeicherten Status. Die erste technische Ausarbeitung
soll nur diese Zustände dauerhaft unterscheiden:

| Zustand | Bedeutung | Entstehung | Ende |
| --- | --- | --- | --- |
| `incomplete` | Mindestens ein Pflichtnachweis fehlt | Neue Auth-Identität oder abgebrochener Ablauf | Alle Pflichtnachweise liegen vor |
| `awaiting_email_verification` | Ergänzte oder E-Mail/Passwort-Adresse ist noch nicht bestätigt | E-Mail-Link wurde versendet | Bestätigungslink wird eingelöst |
| `awaiting_guardian_approval` | Konto einer Person unter 16 wartet auf Elternfreigabe | Altersprüfung unter 16 | Zustimmung, Ablehnung oder Volljährigkeit |
| `personal_active` | Persönlicher Bereich ist nutzbar | Onboarding vollständig, bei Minderjährigen mit Freigabe | Kontolöschung oder Sperrprozess |
| `deletion_due` | Unvollständiges Konto ist nach 30 Tagen bereinigungsreif | Zeit seit Kontoerstellung abgelaufen | Hard Delete |

`profile`, `account_type`, `organization_choice`, `legal_documents` und
`set_password` sind Pflichtnachweise beziehungsweise Formularschritte, keine
eigenständigen Ablaufzustände. Eine offene Organisationsanfrage oder Einladung
steht neben dem persönlichen Onboarding und ändert `personal_active` nicht.

Einladungen benötigen eine getrennte Zustandsfolge: `draft`, `sent`,
`accepted`, `declined`, `revoked`, `expired`. Rollenrechte werden ausschließlich
aus bestätigter Mitgliedschaft und Rolle abgeleitet, nie aus dem
Onboardingzustand oder bearbeitbaren Auth-Metadaten.

## Noch vor der technischen Umsetzung festzulegen

Der Ablauf ist fachlich vollständig genug, um das Zustandsmodell zu entwerfen.
Vor dem konkreten Datenmodell und der Migration müssen nur noch zwei technische
Entwürfe geprüft werden: die Rechtegrenzen für die bereits vorhandenen
Vorstandsrollen sowie der genaue Freigabemechanismus für die ersten
Verbandsvorstände. Zusätzliche Rollen erhalten bis zur Bedarfsermittlung keine
neuen Berechtigungen.

Betreiber, Rechtsform, Anschrift, Kontakt und rechtlich geprüfte Dokumenttexte
bleiben Voraussetzung für die öffentliche Aktivierung von Google, Apple und
E-Mail-Links.
