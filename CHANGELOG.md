# Changelog

All notable changes to Hinterland are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.1] - 2026-10-23

### Added
- In-app auto-update checks against GitHub Releases (electron-updater).
- GitHub Actions release workflow for Windows builds.

### Changed
- Build artifact naming uses hyphens for reliable auto-update downloads.

## [1.1.0] - 2026-10-23

### Added
- Tab groups: create, rename, assign tabs, collapse/expand, delete, and persist across restarts.
- Group entries in the tab context menu.
- Group headers and colour dots in the tab bar.
- Auto-update support via GitHub Releases (electron-updater).
- Release pipeline (GitHub Actions) for building and publishing Windows installers.

### Changed
- Settings schema extended with `tabs.groups`.
- Tab snapshots and session persistence now carry `groupId`.
- Browsing-data clearing now also clears app-managed history.
- HTTPS-first mode now upgrades external links to HTTPS.

### Fixed
- Invalid `en.json` locale file (duplicate block) that broke startup strings.
- Missing locale keys for tab groups (`menu.group*`, `settings.tabs.groups*`).
- `app.js` `state` ReferenceError in the `tabs:groups` listener.
- Tab group changes now propagate to the UI reactively.
- Group assignment resolves group names to ids.
- Hardcoded German strings in group UI replaced with translated keys.
- History visit counts now increment instead of resetting.
- Zoom IPC semantics corrected.
- Extension popup URLs now resolve correctly on Windows.

### [1.0.0] - 2026-10-19

### Added
- Initial release of Hinterland browser.
- Multi-tab browsing with private tabs, pinning, and session restore.
- Privacy features: tracker blocking, third-party media blocking, HTTPS-only/first, referrer stripping, DNT, permission prompts.
- Content controls, zoom, fonts, custom CSS.
- Network settings: proxy, user agent, download directory and throttling.
- History, bookmarks, downloads shelf.
- Unpacked MV3 extensions support.
- Settings import/export, reset, schema-driven UI.
- English and German localisation.
- Internal pages: new tab, history, bookmarks, extensions, settings.