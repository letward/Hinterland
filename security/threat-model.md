# Threat Model — Hinterland Browser & Release-Infrastruktur

## 1. Assets zum Schutz

- Quellcode und Build-Konfiguration im GitHub-Repository
- Release-Installer (Windows NSIS) auf GitHub Releases
- Update-Metadaten (`latest.yml` / signiertes Manifest)
- Signaturschlüssel für Update-Metadaten
- Vertrauensanker (öffentlicher Schlüssel) auf dem Client
- Nutzerdaten (History, Lesezeichen, Einstellungen) im Browser-Profil

## 2. Bedrohungen und Gegenmaßnahmen

| Bedrohung | Angriffsvektor | Gegenmaßnahme |
|---|---|---|
| Manipulierte Update-Metadaten | MITM auf `latest.yml`, Kompromittierung des GitHub-Release-Endpunkts | Kryptografische Signatur der Metadaten, Trust-Anchor außerhalb des Manifests, Hash-Validierung nach Download |
| Unbekannter/böswilliger Installer | Kompromittierter Build-Runner, gefälschtes Release | Build nur auf vertrauenswürdigen Runnern, CodeQL + Dependabot, SLSA-Attestierungen (geplant) |
| Downgrade-Attacke | Client installiert ältere, verwundbare Version | Downgrade-Schutz im Update-Client, `minVersion` im Manifest |
| Abgelaufenes Update | Client vertraut veraltetem Manifest | `expires`-Feld im Manifest, Client prüft Ablaufzeit |
| Agent veröffentlicht Release ohne Gate | Kompromittierter Agent, fehlerhafte Orchestrierung | Keine Release-Rechte für Agents, GATED Workflow, menschliche Freigabe für Releases |
| Prompt Injection via Issues / Commits | Böswillige Inhalte in Issues, PR-Beschreibungen, Commit-Nachrichten | Agents behandeln Issues/PRs als untrusted Input; keine automatische Ausführung ungeprüfter Änderungen auf privilegierten Runnern |
| Secret-Leak | API-Keys, Tokens im Quellcode oder in Logs | `.gitignore` schließt `.env` aus, keine Secrets im Code, minimale `GITHUB_TOKEN`-Berechtigungen |
| Stored XSS im Chat/UI | Unescaped Nutzerinhalte | Escaping aller Renderer-Ausgaben (bekannte Lücke, dokumentiert) |

## 3. Vertrauensgrenzen

- **Quellcode → Build:** Nur Maintainer dürfen Tags pushen, die Releases auslösen. PRs von Unbekannten laufen auf isolierten GitHub-hosted Runnern.
- **Build → Release:** `contents: write` nur im Release-Job. Keine Secrets für untrusted PRs.
- **Release → Client:** Signierte Metadaten, SHA512-Paket-Hash, HTTPS-Transport.
- **Client → Netzwerk:** HTTPS-first, Referrer-Stripping, DNT, Tracker-Blocking.

## 4. Bekannte Lücken (nicht behoben)

- Kein kryptografischer Trust-Anchor im Client implementiert (Update-Client existiert als Python-Referenzimplementierung, ist aber noch nicht in den Electron-Client integriert).
- Keine SLSA-Attestierungen für Builds.
- Kein strukturiertes Update-Fehlerprotokoll / kein Rollback im Client.
- Electron-App speichert kein Update-Audit-Log.
