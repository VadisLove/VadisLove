# Trainingspläne mit anderen Trainern teilen

Stand: 30. September 2026. Branch `claude/plaene-vorlagen-teilen-e8e308`, Basis
`origin/main` (`a086a5e`, Live-Stand). Umsetzung von Punkt 8 aus
[roadmap-review-2026-09-08.md](roadmap-review-2026-09-08.md) (Nachtrag 30.09.2026).
Baut auf [Archivieren und Löschen](plan-archive-trash.md) (Punkt 7) auf.

## Ziel

Trainer können eigene Pläne wieder mit anderen Trainern teilen – auch vereins- und
verbandsübergreifend. Empfänger bearbeiten eine eigene Kopie, die Vorlage des Erstellers
bleibt unverändert. Der Einstieg liegt im neuen Planbereich (`/trainingsplaene`).

## Ist-Stand vor der Umsetzung (geprüft 30.09.2026)

- Im PlanHub gab es kein Teilen mehr (beim Redesign weggefallen).
- Die alte Funktion in `src/features/plans/plans-view.tsx` (nur noch unter der nicht
  verlinkten Seite `/trainingsplaene/freigaben`) schrieb über `shareTrainingPlanSnapshot`
  direkt eine Kopie in `training_plan_snapshot_shares`: nur an bestätigte Kontakte,
  ohne Annehmen/Ablehnen, ohne Suche.
- `training_plan_snapshot_shares` ist inzwischen die **Athletenkopie** mit Fortschritt,
  Nachweisen, Archivstatus und Vererbung an Gruppen. Für Trainer-Empfänger ist sie
  ungeeignet; deshalb eine eigene Tabelle.
- Wiederverwendet: Planinhalt aus `training_plan_versions`, `training_validate_plan`,
  Rollen-Helfer (`is_trainer_profile`, `training_is_board`, `account_is_active`),
  Benachrichtigungstyp `training_plan_shared`, Sheet- und Listenbausteine des PlanHub.

## Bestätigte Entscheidungen (Nutzer, 30.09.2026)

- Alle Trainer und Vorstands-/Verbandskonten (auch Bundestrainer) teilen mit allen
  Trainern, vereins- und verbandsübergreifend.
- **Empfängerauswahl:** Suche nach Name oder Verein über alle Trainer (ab 2 Zeichen,
  höchstens 20 Treffer, sichtbar sind nur Name und Organisation) plus
  „Alle Trainer meines Vereins“. Kein „an alle“. Höchstens 50 Personen bzw. 10 Vereine
  je Vorgang, insgesamt 200 Empfänger, 500 Vorschläge je Person und Tag.
- **Geteilter Plan = Vorschlag:** Empfänger nehmen an oder lehnen ab. Erst beim Annehmen
  entsteht ein eigener Plan (Entwurf, Version 1, neue ID, ohne Verweis auf Vorlage oder
  Ersteller), frei bearbeitbar.
- **Wo sichtbar:** Zeile „N geteilte Pläne für dich“ oben in der Planübersicht und eine
  Benachrichtigung im Postfach (Link `/trainingsplaene?geteilt=1`). Begriff „geteilte
  Pläne“ statt „Angebot“ (Nutzerwunsch).
- **Nur Inhalt:** Titel, Kategorie, Niveau, Beschreibung, Ziele, Tricks/Lines mit Zielwert
  und Hinweis. Nicht übernommen: Athleten, Gruppen, Frist, Fortschritt, Nachweis- und
  Demovideos.
- **Ersteller sieht nicht, wer den Plan verwendet:** Vorschläge existieren nur, solange
  sie offen sind, und sind ausschließlich für die empfangende Person lesbar. Die
  Rückmeldung nach dem Senden nennt nur die Anzahl.
- **Keine Versionsverwaltung:** Erneutes Teilen ersetzt einen noch offenen Vorschlag
  desselben Plans; nach Annahme/Ablehnung entsteht ein neuer.
- Archivierte Pläne sind teilbar, Pläne im Papierkorb nicht.
- Alte Ansicht `/trainingsplaene/freigaben` bleibt vorerst; nur ihr Teilen ist
  stillgelegt. Die Seite wird in einem eigenen Schritt entfernt, nachdem geprüft ist,
  dass der PlanHub alle Video-/Nachweisfunktionen abdeckt.

## Umsetzung

### Migration `20260930120000_plan_trainer_shares`

- Tabelle `training_plan_trainer_shares` (offene Vorschläge): Absender, Empfänger,
  Ursprungsplan (`on delete set null`), bereinigter Planinhalt. RLS aktiv **ohne**
  Policies und ohne Tabellenrechte – Zugriff nur über die RPCs.
- RPCs (`security invoker` → `private`, Prüfung in der DB, nur `authenticated`):
  - `training_share_targets(p_query)` – eigene Vereine mit Anzahl und Suchtreffer.
  - `training_share_plan_with_trainers(p_plan, p_recipients, p_clubs)` – nur eigene
    persönliche Pläne, nicht im Papierkorb; Empfänger müssen Trainer/Vorstand mit
    aktivem Konto sein; legt Vorschläge an bzw. ersetzt offene und benachrichtigt
    (Einstellung `notification_preferences.training_plans` wird beachtet).
  - `training_shared_plans()` – offene Vorschläge der angemeldeten Person.
  - `training_accept_shared_plan(p_share)` – legt `training_plans` + Version 1 an
    (Status `draft`, Autor = Empfänger) und entfernt den Vorschlag.
  - `training_decline_shared_plan(p_share)` – entfernt den Vorschlag.
- Inhaltsbereinigung per Positivliste (`private.training_share_content`) beim Teilen
  und erneut beim Annehmen. Rein additiv; keine bestehende Funktion wird ersetzt.

### App

- Plandetail: Button „Teilen“ neben „Bearbeiten“ (mobil in der Kopfzeile, Desktop in der
  Detailkarte), für eigene gespeicherte Pläne inkl. Archiv.
- Teilen-Sheet (`plan-share.tsx`): Suchfeld, Zeile „Alle Trainer meines Vereins“,
  Personen mit Organisation, eine Hauptaktion „An N Trainer senden“.
- Geteilte Pläne: Einstiegszeile in der Übersicht (nur bei offenen Vorschlägen), Liste und
  Vorschau mit Tricks, „Annehmen“ (öffnet danach den neuen Entwurf) und „Ablehnen“.
- `/trainingsplaene` lädt `training_shared_plans`; fehlt die Migration, bleibt die
  Übersicht wie bisher (keine Zeile, kein Fehler). Ein fehlender Teilen-RPC zeigt im
  Sheet „Die Suche ist gerade nicht verfügbar“.
- Stillgelegt: Teilen-Button und Dashboard-Direkteinstieg der alten Ansicht;
  `shareTrainingPlanSnapshot` nimmt nur noch Athletenkonten an.
- Dateien: `supabase/migrations/20260930120000_plan_trainer_shares.sql` (neu),
  `src/features/plan-hub/plan-share.tsx` (neu), `plan-hub.tsx`, `plan-detail.tsx`,
  `plan-hub-model.ts`, `plan-hub.module.css`, `src/app/trainingsplaene/{actions.ts,page.tsx}`,
  `src/features/plans/plans-view.tsx`, `tests/plan-trainer-share-database.test.mjs` (neu),
  `tests/support/plan-hub-fixture-server.mjs`.

### Bewusste Grenzen

- Die Suche zeigt Namen und Organisation aller aktiven Trainerkonten allen Trainern
  (gewollt für vereinsübergreifendes Teilen).
- Die Postfach-Benachrichtigung bleibt nach Annahme/Ablehnung stehen; ihr Link führt dann
  zur normalen Übersicht.
- Die Empfängerzahl auf dem Button zählt Vereinsmitglieder und einzeln gewählte Personen
  zusammen; doppelt Gewählte erhalten nur einen Vorschlag, die Rückmeldung nennt die
  tatsächliche Zahl.

## Technischer Nachweis (30.09.2026, lokal)

- `npm test`: 282 Tests bestanden, darunter neu `tests/plan-trainer-share-database.test.mjs`
  (8 Tests: Suche nur nach Trainern/Vorstand, vereins- und verbandsübergreifend, ohne
  eigene Person, ohne inaktive Konten, LIKE-Platzhalter wirkungslos; nur Trainer/Vorstand
  dürfen suchen/teilen, keine fremden Pläne, keine Athleten als Empfänger, kein direkter
  Tabellenzugriff; nur Planinhalt wird geteilt, Benachrichtigung; erneutes Teilen ersetzt;
  Annehmen legt eigenen Entwurf an, nur durch Empfänger, Kopie bearbeitbar, Vorlage
  unverändert, Ersteller ohne Zugriff; Ablehnen ohne Spur; Vereinsauswahl; Archiv teilbar,
  Papierkorb und Übergrößen nicht).
- Typprüfung, `eslint src tests` und Produktionsbuild bestanden.
- Lokaler Browserprüfstand (PGlite mit echten Migrationen, synthetische Konten), mobil
  375 × 812: als Tina geteilten Plan von Frank (anderer Verein) angesehen und angenommen
  → eigener Entwurf mit „Bearbeiten“/„Teilen“; Teilen-Sheet mit Suche „Kiel“ und
  Vereinszeile, an Frank gesendet; als Frank über `?geteilt=1` geöffnet und abgelehnt.
  Desktop: Teilen-Sheet als Seitenleiste.
- Produktion nur lesend geprüft: letzte eingetragene Migration `20260930100100`;
  `account_is_active`, `training_is_board`, `training_validate_plan`,
  Benachrichtigungstyp `training_plan_shared` und `notification_preferences.training_plans`
  vorhanden; `training_plan_trainer_shares` existiert noch nicht.

## Veröffentlichung

Stand 30.09.2026: Migration vom Nutzer vor dem Deploy im SQL-Editor angewendet und in
`supabase_migrations.schema_migrations` eingetragen; per Abfrage bestätigt (Tabelle mit
RLS, 10 Funktionen, kein Tabellenrecht für `authenticated`, kein Aufruf für `anon`).
Rollback-Tag `production/stable-before-plaene-teilen-20260930` → `a086a5e`. `main` per
Fast-Forward auf `22276ce`; Vercel-Deployment `dpl_CiX2m6PccSbhvcQ5RAAq5qGDZSqe` Ready,
Alias trainer-webapp-ruby.vercel.app zeigt darauf (per Vercel-CLI bestätigt).
Praxisprüfung offen.

Rollback: App über den Rollback-Tag zurücksetzen. Die Migration ist additiv; eine ältere
App ignoriert Tabelle und RPCs. Vollständig entfernen ließe sie sich mit
`drop table public.training_plan_trainer_shares` und den zehn neuen Funktionen.

## Praxisprüfliste (offen)

- Plan im Plandetail teilen: nach Name suchen, nach Verein suchen, „Alle Trainer meines
  Vereins“ wählen → Rückmeldung mit Anzahl.
- Als Empfänger: Postfach-Benachrichtigung öffnen → geteilter Plan; Tricks und Ziele
  vollständig, keine Athleten/Frist.
- Annehmen → Plan unter „Entwürfe“, bearbeiten und zuweisen möglich; Original beim
  Ersteller unverändert.
- Ablehnen → Vorschlag weg; Ersteller sieht nichts davon.
- Überarbeiteten Plan erneut teilen, solange der erste Vorschlag offen ist → nur ein
  Vorschlag mit der neuen Fassung.
- Archivierten Plan teilen.
