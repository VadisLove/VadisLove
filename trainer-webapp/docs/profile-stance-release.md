# Stance im eigenen Profil – Release 24.09.2026

Zuordnung: Ergänzung zu Roadmap-Schritt 2 (Profilerstellung), vom Nutzer freigegeben.
Zielentität: eigenes Profilformular und persistenter Profilwert. Nutzungskontext:
angemeldete aktive Konten aller bisherigen Rollen im Browser, Desktop und Mobil.
Umfang: Regular, Goofy, Keine Angabe; bestehende Profile bleiben ohne Angabe.
Ausgeschlossen: Fremdprofilbearbeitung, Trainingsauswertung nach Stance, Switch/Fakie,
Änderungen an Rollen oder Sichtbarkeitsregeln und weitere lokale Änderungen.

Qualitätsmerkmale nach ISO/IEC 25002: funktionale Korrektheit, Datenintegrität,
Zugriffsschutz, Verständlichkeit und Wartbarkeit. Abnahmekriterien: alle drei Werte
speichern und erneut laden; ungültige Werte ablehnen; nur aktives eigenes Konto
kann ändern/lesen; keine Regression der bestehenden Produktionsfunktionen.
Technischer Nachweis: Typprüfung, Lint, Gesamttests, Produktionsbuild, isolierter
SQL-Test der echten Migration einschließlich Berechtigungen; anschließend Prüfung
des Datenbankschemas und des Vercel-Produktionsalias. Ergebnisse folgen nach Prüfung.

Basis: Produktionscommit 6dceb7a, Deployment dpl_9r8oXSv6spsCnTpxEtC8dN5F7Wmg.
Stance wird als additive nullable Spalte ergänzt. Bei App-Rollback bleibt sie erhalten.
Keine separate Staging-Abnahme. Fachliche Praxisprüfliste (nach Veröffentlichung vom Nutzer bestätigt):
- Profil öffnen, Regular speichern, neu laden und Auswahl prüfen.
- Auf Goofy wechseln, speichern und neu laden.
- Keine Angabe speichern und neu laden.
- Auf einem Mobilgerät Auswahl und Beschriftungen prüfen.

## Veröffentlichung

Sicherungstag `production/stable-before-profile-stance-20260924` auf `6dceb7a`
vor Datenbankänderung und Produktionsumschaltung zu origin gepusht. Freigegebener
Codecommit `c085a61` auf `codex/profile-stance-release`; öffentliches GitHub-Ziel
nach automatischer Rückfrage zusätzlich ausdrücklich vom Nutzer bestätigt.
Migration erfolgreich auf `lglmlktrngmrimvhwxab` angewandt, MCP-Version
`20260924102610`; Dateiname und SQL-Testverweis anschließend angeglichen, Inhalt
unverändert, alle 14 Profiltests erneut erfolgreich. Live geprüft: nullable Textspalte,
CHECK-Constraint, Stance im RPC-Ergebnis, anonym kein EXECUTE, angemeldet EXECUTE
und UPDATE vorhanden. Sicherheitsadvisor-Kategorien und Anzahlen unverändert
(3 interne Tabellenhinweise, 2 anonyme und 12 angemeldete bestehende Definer-RPCs,
1 Hinweis zum Passwort-Leak-Schutz). Keine Berechtigungen erweitert.
Siehe [Definer-RPC-Hinweise](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
und [Passwortschutz](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Vercel: `dpl_B563561MMB8zifvLcR1Ty7K7rN6r`, Status READY, Ziel Produktion,
`trainer-webapp-bz223t9o0-vladi-sntlove.vercel.app`. Nach erfolgreichem Build promoviert.
Abfrage der bestehenden Adresse `https://trainer-webapp-ruby.vercel.app` bestätigt
diese Deployment-ID. Login HTTP 200; Profil und Trainingspläne ohne Anmeldung
HTTP 307 zum Login. Kein authentifizierter Produktions-Browsertest durch Codex
durchgeführt. Die anschließende Nutzerabnahme ist unten dokumentiert. Keine separate
Staging-Praxisabnahme.

Ein wegen fehlender Root-Verknüpfung versehentlich erzeugtes Zusatzprojekt
`trainer-profile-stance-release` wurde vollständig entfernt. Das bestehende
Produktionsprojekt blieb bis zur gezielten Promotion auf dem bisherigen Release.
Rollback: vorheriges Deployment `dpl_9r8oXSv6spsCnTpxEtC8dN5F7Wmg` erneut promovieren;
die additive Spalte samt Werten beibehalten.

Betriebsprüfung direkt nach Promotion: Vercel-Fehlerlogs dieses Deployments für
die letzten zehn Minuten ohne Einträge. Momentaufnahme; dauerhaftes Monitoring
und Drains wurden in diesem Release nicht verändert oder neu geprüft.

## Fachliche Produktionsabnahme – bestätigt

24.09.2026: Der Nutzer bestätigt nach Aufforderung zur Prüfung der drei Stance-
Optionen mit Speichern und Neuladen im Produktionsprofil: „passt. alles ist geprüft
und funktioniert.“ Damit ist die Stance-Erweiterung fachlich abgenommen und der
Produktionsbetrieb für diesen Ablauf bestätigt. Bezug: Deployment
`dpl_B563561MMB8zifvLcR1Ty7K7rN6r`, Code `c085a61`. Gerät und Browser wurden nicht
genannt; eine gesonderte Mobilgeräteprüfung wird daraus nicht abgeleitet.
