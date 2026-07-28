# Arbeitsregeln für Codex

- Kommentiere neu geschriebenen Code übersichtlich, sodass andere Personen ohne zusätzliche Erklärung daran weiterarbeiten können.
- Frage nach, wenn Anforderungen oder Auswirkungen einer Änderung nicht eindeutig sind.

## Git-Sicherung und Deployment

- Wenn eine Änderung für diese Anwendung freigegeben ist, deploye sie direkt auf das verknüpfte Vercel-Produktionsprojekt.
- Führe vor jedem Produktions-Deployment die passenden Prüfungen aus und brich bei Fehlern ab.
- Sichere den zuletzt stabilen Produktionsstand vor dem Deployment mit einem eindeutig benannten Git-Tag.
- Committe und pushe nur die für das Deployment freigegebenen Dateien. Fremde oder noch unfertige Änderungen bleiben unangetastet.
- Verwende den Git-Tag oder den vorherigen Commit als Rollback-Punkt, wenn das neue Deployment einen kritischen Fehler verursacht.
- Prüfe nach dem Deployment, ob die Produktions-URL auf das neue erfolgreiche Deployment zeigt.
