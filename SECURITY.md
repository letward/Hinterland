# Sicherheit

## Unterstützte Versionen

Nur der aktuellste stabile Release erhält Sicherheitsaktualisierungen. Ältere Versionen (1.0.0, 1.1.x) werden nicht gepatcht; ein Update auf die neueste Version wird dringend empfohlen.

## Schwachstellen melden

Security-Hinweise bitte über GitHub Private Vulnerability Reporting einreichen (Reiter „Security" des Repos → „Report a vulnerability"). Nicht in öffentlichen Issues, Pull Requests oder Commits veröffentlichen.

## Regeln für das Repository

- Keine API-Keys, Tokens, Passwörter oder Zertifikate im Quellcode (`.env` ist über `.gitignore` ausgeschlossen).
- Signaturschlüssel für das Browser-Update dürfen weder im Quellcode noch in allgemeinen Agent-Umgebungen liegen.
- Pull Requests von Unbekannten erhalten keine Rechte auf privilegierte Runner. Alle Builds laufen aktuell auf GitHub-Hosted-Runnern (`ubuntu-latest`, `windows-latest`).
