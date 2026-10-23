# Incident Response

## 1. Verdacht auf kompromittiertes Release

1. GitHub-Release sofort als "prerelease" markieren oder verbergen.
2. Tag `v*` zurücksetzen, falls noch nicht weit verbreitet.
3. Nutzer über in-App-Toast und Website informieren, das Update nicht zu installieren.
4. Signaturschlüssel rotieren (falls betroffen), neuen Trust-Anchor ausrollen.
5. Post-Mortem dokumentieren.

## 2. Verdacht auf kompromittierten Build-Runner

1. Alle laufenden Workflow-Runs abbrechen.
2. `GITHUB_TOKEN` und alle Repository-Secrets rotieren.
3. Neueste Builds als nicht vertrauenswürdig behandeln, nicht veröffentlichen.
4. Runner-Image neu aufsetzen, erst danach wieder Builds zulassen.

## 3. Fehlgeschlagener Update-Check

- Der Browser protokolliert Update-Fehler in der Konsole (`console.warn`).
- Bei wiederholtem Fehlschlag: Nutzer kann manuell "Nach Updates suchen" im Hauptmenü auslösen.
- Kein automatisches Neuinstallieren bei fehlerhaftem Download.

## 4. Kontakt

- Sicherheitsmeldungen: GitHub Private Vulnerability Reporting (siehe `SECURITY.md`).
- Allgemeine Incidents: Issue im Repository eröffnen (nicht für Sicherheitslücken).
