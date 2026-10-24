# Architektur — Hinterland Browser & Release-Infrastruktur

## 1. Überblick

Hinterland ist ein auf Electron basierender Browser (Chromium-Integration über Electron, nicht über direktes Chromium-C++-Monorepo). Die Release-Infrastruktur läuft über GitHub Actions auf GitHub-hosted Runnern (`ubuntu-latest` für Prüfungen, `windows-latest` für den Windows-NSIS-Build via electron-builder). Es gibt keine dauerhaften Cloud-Server; Jobs sind ereignisgesteuert.

## 2. Komponenten

| Komponente | Pfad | Aufgabe |
|---|---|---|
| Hauptprozess | `src/main/*.js` | App-Lebenzyklus, Auto-Updater, IPC, Sicherheit, Fenster |
| Preload | `src/preload/chrome.cjs` | Brückentypen zum Renderer (inkl. `app.checkForUpdates`) |
| UI / Renderer | `src/ui/*` | Fenster, Tabs, Gruppen, Menü, Locales |
| Build | `build/icons/icon.ico`, `build/icons/icon.png`, `package.json` (`build` block) | electron-builder Konfiguration (NSIS, GitHub Publish) |
| CI / Release | `.github/workflows/release.yml` | Tag-getriebener Build + Publish auf GitHub Releases |
| CI / PR-Checks | `.github/workflows/pr-checks.yml` | `npm ci` + `npm run check` an PRs |
| Security | `.github/workflows/codeql.yml`, `SECURITY.md`, `CODEOWNERS`, `dependabot.yml` | CodeQL, Dependabot, Sicherheitsrichtlinie |
| Agent-Orchestrator | `agent/orchestrator/*.py` | Python-Zustandsmaschine, Task-Modell, Policies, Audit-Trail |
| Agent-Tests | `agent/tests/*.py` | Tests für Orchestrator, Policies, Dedup, Retry |
| Updater-Client | `updater/client/update_client.py` | Signaturprüfung, Trust-Anchor, Hash-Validierung |
| Updater-Verifikation | `updater/verification/verify.py` | Offline-Verifikation von Manifesten und Paketen |
| Updater-Manifest | `updater/manifest/manifest.schema.json` | Schema für signierte Update-Metadaten |

## 3. Datenfluss Update

1. Browser (verpackt) ruft `autoUpdater.checkForUpdates()` auf (GET auf GitHub Releases `latest.yml`).
2. `latest.yml` enthält Version, Download-URL, SHA512, Release-Datum.
3. electron-updater lädt das Installer-Exe herunter und validiert den SHA512 gegen `latest.yml`.
4. Bei Erfolg: `update-downloaded` → Dialog "Restart now / Later" → `quitAndInstall()`.
5. **Lücke (bekannt):** `latest.yml` wird über einfaches HTTPS bezogen; es gibt derzeit keinen kryptografischen Trust-Anchor und keine Signaturprüfung der Metadaten (siehe Phase G).

## 4. Vertrauensgrenzen (Trust Boundaries)

| Grenze | Seiten | Regel |
|---|---|---|
| Quellcode → Build | GitHub Repo → GitHub Actions Runner | Nur `contents: write` für Releases; PRs von Unbekannten erhalten keine privilegierten Rechte |
| Build → Release | electron-builder → GitHub Releases | Veröffentlichung nur bei bestandenen Pflichtprüfungen und gültigem Tag `v*` |
| Release → Client | GitHub Releases → Browser-Installer | Hash-Prüfung via `latest.yml` (inkrementell, nicht kryptografisch signiert) |
| Client → Netzwerk | Browser → GitHub / Web | HTTPS-only, Referrer-Stripping, DNT, Tracker-Blocking |
| Agent → Runner | Python-Orchestrator → Isolierter Arbeitsbereich | Keine Änderung von Sicherheitsregeln, Statuschecks oder Release-Gates durch Agenten |

## 5. Kosten

| Posten | Kosten | Quelle |
|---|---|---|
| GitHub Actions (Public Repo) | 0 € | Kostenlose Minuten, GitHub Free |
| Dependabot, CodeQL | 0 € | In GitHub Free enthalten |
| GitHub Releases / Artefakte | 0 € | Bandbreite im Free-Tier |
| Code-Signing-Zertifikat (EV) | ca. 100–300 €/Jahr | Optional; ohne Zertifikat SmartScreen-Warnung |
| Selbst gehosteter Runner | 0 € (eigene HW) | Nicht im Kontext; GitHub-hosted reicht |
| KI-API | 0 € optional | Lokale Modelle bevorzugt, Aufrufe begrenzt |

## 6. Offene Entscheidungen

- **Electron vs. Chromium-C++:** Der Master-Prompt sieht Chromium mit depot_tools/GN/Ninja vor; das vorhandene Repo ist ein Electron-Projekt. Ein Wechsel wäre ein neues Projekt und wird nicht ohne ausdrückliche Anweisung vorgenommen.
- **Signaturschlüssel für Updater:** Noch nicht generiert. Private Schlüssel dürfen nicht ins Repo; Speicherung erst bei konkreter Implementierung (Phase G).
- **Selbst gehosteter Windows-Runner:** Nicht vorhanden; alle Builds laufen auf `windows-latest`.

## 7. Risiken und bekannte Lücken

- Kein kryptografischer Trust-Anchor für Update-Metadaten (Man-in-the-Middle auf `latest.yml` möglich, wenn TLS kompromittiert).
- Keine SLSA-Attestierungen oder Build-Provenance.
- Keine Idempotenz-Prüfung gegen doppelte Releases im Release-Workflow.
- Kein strukturiertes Update-Fehlerprotokoll / kein Rollback im Client.
