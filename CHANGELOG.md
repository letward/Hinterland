# Changelog

All notable changes to Hinterland are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.7.0] - 2026-10-24

### Added
- Interactive in-page context menu for web content: link actions (open in new/private tab, copy link), image actions (open, copy address, save as), text selection search and copy, full editable controls (undo/redo, cut/copy/paste, select all), page navigation, view source, print, and developer tools element inspection.
- Omnibox Site Information & Security popover with connection security indicators, active privacy shield status (tracker blocking and HTTPS-first), and direct origin cookies and site data clearing.
- Recently closed tabs restoration history with session persistence across restarts, dedicated modal tab in the History panel, and one-click restoration or clearing.
- Command Palette integration for recently closed tabs, enabling instant search and restoration of previously closed pages.
- Interactive keyboard shortcuts cheatsheet modal (`openShortcuts`) with categorized groups (Tabs & Windows, Navigation, View & Tools, Browser & Management), real-time search filter, and `<kbd>` badge chips.
- Tab Pinning keyboard shortcut (`Alt+P`) and Command Palette quick action.
- Symmetrical English and German localizations for all new context actions, site information dialogs, shortcuts, and history views.

## [1.6.0] - 2026-10-24

### Added
- Quick-access Bookmarks Bar (`Ctrl+Shift+B`) below the address bar with favicon/icon display, open in current/new/private tab, copy link, and direct bookmark removal.
- Distraction-free Reader Mode (`Ctrl+Alt+R`) with automatic article extraction, reading time estimate, theme-aware styling, and dedicated omnibox toggle button.
- Native HTML5 tab drag-and-drop reordering with visual drop indicators and support for dragging tabs into tab groups.
- "Mute other tabs" action in tab context menu and Command Palette to silence noisy background tabs.
- "Reload all tabs" and "Close all tabs" actions in tab context menu, tabstrip context menu, and Command Palette.
- Symmetrical English and German localizations for all new features and settings.

### Fixed
- Fixed disabled tab drag-and-drop by setting `draggable: 'true'` on tab elements.
- Fixed `ReferenceError: toast is not defined` when checking for updates or creating tab groups from menus.

## [1.5.0] - 2026-10-24

### Added
- Multi-resolution Windows application and installer icon (`.ico` with 16, 32, 48, 64, 128, and 256px) and high-resolution 512px assets.
- Official Hinterland circular badge logo showcased in the About dialog and New Tab page hero section.
- "Close tabs to the left" action in the tab context menu, IPC layer, and Command Palette.
- "Reload tab" and "Copy link" direct actions in the tab context menu.
- Keyboard shortcuts for Downloads (`Ctrl+J`), duplicate tab (`Ctrl+Shift+D`), and mute/unmute tab (`Ctrl+M`).
- Full English and German localization for all new tab context actions and palette entries.

## [1.4.0] - 2026-10-24

### Added
- Quick Command Palette (`Ctrl+Shift+P` / `F1`) for rapid access to browser actions, navigation, dev tools, and active tab switching.
- Interactive tab audio indicator with direct click-to-mute on audible tabs.
- "Close tabs to the right" action in the tab context menu.
- Tabstrip context menu on empty tabstrip area (New tab, Reopen closed tab).
- "Reopen closed tab" action in tab context menu and keyboard shortcut (`Ctrl+Shift+T`).
- Omnibox zoom badge indicator with one-click reset to 100% when page zoom is modified.
- Full English and German localization for all new actions and command palette strings.

## [1.3.1] - 2026-10-24

### Fixed
- Release CI workflow PowerShell command compatibility and artifact publishing (`--publish always`).

## [1.3.0] - 2026-10-24

### Added
- Python agent orchestrator with state machine, task model, policy engine, and audit log.
- Updater client with Ed25519 signature verification, trust anchor, hash validation, downgrade protection, and expiry.
- Automated CI/CD pipelines: PR checks, CodeQL security scanning, and Dependabot.
- Security and operations documentation (threat model, release policy, incident response, architecture).

### Changed
- Release workflow hardened with idempotency check and minimal permissions.

## [1.2.0] - 2026-10-23

### Added
- Inline rename for tab groups (double-click title).
- Color picker for groups (palette + custom hex).
- Drag-and-drop tabs between groups and group reordering.
- Group context menu actions.
- In-app update prompt with "Restart now / Later" and progress.
- Manual "Check for updates" in the main menu.
- Keyboard and ARIA support for group headers.

### Changed
- Persisted group order, colors, and collapsed state.
- Settings list editor improvements for groups.

## [1.1.2] - 2026-10-23

### Fixed
- Auto-updater import (`electron-updater` is CommonJS) that crashed the main process on startup.
- `state.groups` not iterable crash in the tab bar.
- Missing `tabs:groups` channel in the chrome preload.

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