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
Keine separate Staging-Abnahme. Fachliche Praxisabnahme noch offen:
- Profil öffnen, Regular speichern, neu laden und Auswahl prüfen.
- Auf Goofy wechseln, speichern und neu laden.
- Keine Angabe speichern und neu laden.
- Auf einem Mobilgerät Auswahl und Beschriftungen prüfen.
