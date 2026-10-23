# Betriebshandbuch (Operations)

## 1. Release-Veröffentlichen

1. Feature-Branch erstellen, Änderungen implementieren, PR öffnen.
2. PR-Checks und CodeQL müssen grün sein.
3. Maintainer reviewed und merged in `main` oder `release/*`.
4. Tag `v<major>.<minor>.<patch>` erstellen und pushen.
5. Der `release.yml`-Workflow baut den Windows-Installer und veröffentlicht auf GitHub Releases.
6. Artefakte und `latest.yml` werden automatisch hochgeladen.

## 2. Chromium-Upstream / Electron-Updates

- Electron-Version in `package.json` (`devDependencies.electron`) bei neuen Releases prüfen.
- `npm install electron@<neue Version>` und `npm run check` ausführen.
- Änderungen über PR-Prozess einreichen.

## 3. Dependabot

- Wöchentliche Prüfung von npm-Dependencies (konfiguriert in `.github/dependabot.yml`).
- Dependabot-PRs über denselben PR-Prozess wie alle Änderungen behandeln.

## 4. Sicherheitsmeldungen

- Über GitHub Private Vulnerability Reporting einreichen (siehe `SECURITY.md`).
- Keine öffentlichen Issues für Sicherheitslücken erstellen.

## 5. Rollback

- Bei fehlerhaftem Release: Tag löschen, neues Release mit korrigierter Version veröffentlichen.
- Client-seitiger Rollback: Noch nicht implementiert (geplant, siehe Threat Model).

## 6. Kosten

- GitHub Actions, Dependabot, CodeQL, Releases: 0 € (GitHub Free für Public Repos).
- Optionales Code-Signing-Zertifikat: ca. 100–300 €/Jahr.
