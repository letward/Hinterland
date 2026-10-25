# Sicherheit

## Unterstützte Versionen

Nur der aktuellste stabile Release erhält Sicherheitsaktualisierungen. Ältere Versionen (1.0.0, 1.1.x) werden nicht gepatcht; ein Update auf die neueste Version wird dringend empfohlen.

## Schwachstellen melden

Security-Hinweise bitte über GitHub Private Vulnerability Reporting einreichen (Reiter „Security" des Repos → „Report a vulnerability"). Nicht in öffentlichen Issues, Pull Requests oder Commits veröffentlichen.

## Regeln für das Repository

- Keine API-Keys, Tokens, Passwörter oder Zertifikate im Quellcode (`.env` ist über `.gitignore` ausgeschlossen).
- Signaturschlüssel für das Browser-Update dürfen weder im Quellcode noch in allgemeinen Agent-Umgebungen liegen.
- Pull Requests von Unbekannten erhalten keine Rechte auf privilegierte Runner. Alle Builds laufen aktuell auf GitHub-Hosted-Runnern (`ubuntu-latest`, `windows-latest`).

## Erweiterungssicherheit & Schutz von Nutzerdaten (Extension Sandboxing)

Hinterland isoliert Browser-Erweiterungen nach dem Zero-Trust-Prinzip:
- **Preload-Isolation:** Erweiterungs-Popups erhalten niemals Zugriff auf die interne Browser-IPC (`window.hinterland`). Popups laufen in einer isolierten Sandbox mit `EXTENSION_PRELOAD`.
- **Rechte-Governance:** Gefährliche Berechtigungen (`debugger`, `nativeMessaging`, `management`, `privacy`, `proxy`) sind bei Drittanbieter-Erweiterungen gesperrt.
- **Speicher- und Ursprungstrennung:** Daten werden über den Hinterland Extension SDK (`@hinterland/extension-sdk`) partitions- und schlüsselsicher gekapselt, mit nativer AES-GCM-Verschlüsselung für vertrauliche Inhalte.
- **CSP-Erzwingung:** Dynamische Code-Ausführung (`unsafe-eval`) und unverschlüsselte HTTP-Quellen werden im Extension-Runtime blockiert.
- Ausführliche Sicherheitsarchitektur: siehe `docs/extensions-security.md`.
