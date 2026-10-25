# Sicherheitsrichtlinie für Releases (Hinterland)

## 1. Veröffentlichung nur nach bestandenen Gates

Ein Release darf nur veröffentlicht werden, wenn alle folgenden Bedingungen erfüllt sind:

1. Der zugehörige Pull Request wurde durch mindestens einen Maintainer geprüft und genehmigt.
2. Alle Pflicht-CI-Prüfungen sind bestanden (Formatierung, Statik-Analyse, CodeQL, Unit-Tests).
3. Der Build wurde auf einem vertrauenswürdigen Runner durchgeführt (GitHub-hosted `windows-latest` oder ein explizit zugelassener selbst gehosteter Runner).
4. Artefakte, Prüfsummen und Build-Attestierungen wurden erzeugt und verifiziert.
5. Die Veröffentlichung wurde durch ein vertrauenswürdiges Ereignis ausgelöst (Tag-Push `v*` durch einen Maintainer oder manueller Workflow-Dispatch mit Maintainer-Berechtigung).

Eine Veröffentlichung darf niemals allein deshalb erfolgen, weil ein Agent behauptet, dass seine Änderung korrekt ist.

## 2. Idempotenz und Doppel-Releases

- Ein Release mit derselben Versionsnummer darf nicht zweimal veröffentlicht werden.
- Vor der Veröffentlichung wird geprüft, ob ein GitHub-Release mit demselben Tag bereits existiert. Falls ja, wird der Vorgang abgebrochen.
- Build-Artefakte erhalten eindeutige Namen (`${productName}-Setup-${version}.${ext}`), um Verwechslungen auszuschließen.

## 3. Signierte Update-Metadaten

- Das Update-Manifest (`latest.yml` bzw. Nachfolgeformat) muss kryptografisch signiert sein (Ed25519).
- Der öffentliche Vertrauensanker liegt außerhalb des Manifests und wird beim Client unabhängig geprüft.
- Private Signaturschlüssel werden niemals im Quellcode, in Agent-Umgebungen oder in allgemeinen Repository-Secrets gespeichert. Sie werden nur im Signing-Schritt des Release-Workflows verwendet.

## 4. Branch Protection

- `main` und alle `release/*`-Branches sind geschützt.
- Pushes direkt auf diese Branches sind verboten; Änderungen laufen über Pull Requests.
- Erforderliche Statusprüfungen: `PR Checks`, `CodeQL`.
- Mindestens ein Review durch einen Maintainer vor dem Merge.

## 5. Was Agents nicht dürfen

- Agents dürfen keine Sicherheitsregeln, erforderlichen Statuschecks, Berechtigungsgrenzen oder Release-Gates verändern.
- Agents dürfen keine Releases veröffentlichen.
- Agents dürfen keine Pull Requests auf geschützten Branches direkt mergen.
- Agents erhalten keine langlebigen Zugangsdaten und keine Rechte auf privilegierte Runner.
