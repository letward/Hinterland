# Changelog

All notable changes to Hinterland are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.11.0] - 2026-10-25

### Added
- Native Browser Password Manager ("Hinterland Pass", `hinterlandPass`):
  - End-to-End Zero-Knowledge Encryption: Hardware-accelerated AES-GCM 256-bit vault encryption derived via PBKDF2 (100,000 iterations of SHA-256) with verification token validation and auto-locking.
  - In-Page Form Detection & Autofill: Automatically scans web pages for login and registration forms, attaching an in-field shield badge with a closed Shadow DOM menu to view and autofill matching credentials.
  - Native "Save Password?" In-Page Banner: Intercepts form submissions and Enter key presses, detecting newly entered or changed credentials and prompting users with an isolated Shadow DOM top-right prompt banner.
  - Action Popup UI (`popup.html`): Designed with Hinterland design tokens and dark/light modes, featuring Master Password Setup, Vault Unlock, Current Site quick actions, All Logins live search and editing, and Vault Settings.
  - Built-in Password Generator & Strength Meter: Shannon entropy calculation and strength grading (Weak to Excellent) with configurable length (8–64) and character set filtering (A-Z, a-z, 0-9, symbols, ambiguous characters).
  - Backup & Migration: Full JSON vault export and import for backups and migration.
  - Unit Tests: Comprehensive test coverage (`sdk/test/hinterlandPass.test.mjs`) for encryption round-trip, incorrect master password rejection, password generation constraints, entropy calculation, and domain normalization.

### Changed
- Extension Action Popup Isolation & Navigation: Enhanced `executeAction` in `src/main/extensions.js` to load popups with native `chrome-extension://${extension.id}/...` URLs and automatic closing on blur and Escape.

## [1.10.0] - 2026-10-25

### Added
- Official Hinterland Extension SDK (`@hinterland/extension-sdk`): Comprehensive developer toolkit for creating secure, Manifest V3 extensions for Hinterland.
  - Manifest Builder & Validator (`defineManifest`): Enforces MV3 compliance, permission tier auditing, and secure Content Security Policies.
  - Hardened Secure Storage (`createSecureStorage`): Namespaced, prototype-pollution resistant key-value store with hardware-accelerated AES-GCM encryption and automatic sanitization.
  - XSS Prevention & Sanitization (`sanitizeHtml`, `safeHtml`): Built-in zero-dependency HTML sanitizer and tagged template literals to prevent DOM XSS and script injections.
  - Safe Message Bus (`createMessageBus`): Typed, promise-based IPC between background service workers, content scripts, and popups with origin verification and timeout management.
  - Content Script Isolation (`ContentHelper`): Closed Shadow DOM encapsulation preventing host page scripts from inspecting or hijacking extension UI elements, plus privacy-safe article text extraction.
  - Hinterland UI Kit (`UIHelper`, `createStore`): Pre-styled accessible components (`createSwitch`, `createButton`, `createCard`, `createBadge`) matching Hinterland dark/light design tokens.
  - Developer CLI (`hinterland-sdk` / `hinterland-ext`): Instant project scaffolding (`init`), security and manifest auditing (`validate`), and pure Node zip packager (`pack`).
  - Full TypeScript Definitions: Complete `.d.ts` declaration file with comprehensive JSDoc annotations for IDE autocompletion.
  - Showcase Example Extension: Fully functional Smart Reading Companion extension in `examples/smart-reader`.
  - Comprehensive Documentation: Developer Guide & API Reference (`docs/extensions-sdk.md`) and Security Specification (`docs/extensions-security.md`).

### Security
- Extension Preload Sandbox Isolation: Replaced privileged `CHROME_PRELOAD` in extension popup windows with a dedicated sandboxed `EXTENSION_PRELOAD` (`window.hinterlandExtension`), preventing untrusted extensions from accessing internal browser controls, settings, or user history.
- Extension Action Injection Hardening: Serialized extension ID parameters safely in tab action dispatches to prevent code injection.
- Unpacked Extension Permission Auditing: Runtime rejection of dangerous permissions (`debugger`, `nativeMessaging`, `management`, `privacy`, `proxy`) and verification of safe directory file bounds.

## [1.9.0] - 2026-10-25

### Added
- Built-in Browser Task Manager (`Shift+Esc`): Live real-time memory and CPU inspector for all browser processes (Main Browser, GPU, Utility, and Web Tabs) with tab title, favicon, process PID, memory footprint (MB/GB), CPU percentage, live refresh, and direct "Put to sleep" and "End task" controls.
- Web Page Screen Capture tool (`Ctrl+Shift+S`): Capture high-resolution screenshots of the visible viewport or web content via native Chromium rendering with direct "Copy to clipboard" and "Save as PNG image" options, accessible from in-page context menu, omnibox tools menu, tab menu, and Command Palette.
- Reading List / Read Later panel (`openReadingList`, `Ctrl+Shift+L`): Save articles and web pages to read later, with categorized filter tabs ("Unread" with count badge, "Read", "All"), real-time search filter, mark read/unread toggles, open in new tab, and direct "Clear read items" action.
- Context menu integrations for Reading List: "Add link to Reading list" from link context menu and "Add page to Reading list" from web content context menu.
- Close duplicate tabs (`tabs:closeDuplicates`): Automatically detects redundant open tabs with identical URLs and closes duplicates while preserving original tabs, accessible from tab context menu, tabstrip context menu, and Command Palette.
- Mute / Unmute all tabs (`tabs:muteAll`): One-click audio management to silence or re-enable all tabs across the browser from the tabstrip context menu and Command Palette.
- Interactive Zoom controls in the main menu: Quick zoom out (`-`), reset (`100%`), zoom in (`+`), and full screen toggle (`F11`) directly accessible from the primary browser menu.
- Symmetrical English and German localizations across all new task manager views, reading list items, screen capture dialogs, menus, and toasts.

## [1.8.0] - 2026-10-24

### Added
- Tab Snoozing / Memory Saver: Put inactive background tabs to sleep (`Alt+S`) to release renderer resources and memory while preserving tab title, icon, and URL; tabs wake up automatically upon activation or click.
- "Sleep tab" / "Wake tab" and "Sleep other tabs" options in the tab context menu, tabstrip actions, and Command Palette.
- Save page as PDF (`Ctrl+Shift+E`) via native Chromium print-to-PDF rendering with direct file save dialog, accessible from in-page context menu, tab menu, omnibox tools menu, and Command Palette.
- Copy page and link as Markdown (`[Title](URL)`, `Ctrl+Shift+C`) available from in-page link context menu, web content context menu, tab menu, omnibox menu, and Command Palette.
- Enhanced Bookmarks panel with instant real-time search filter and alphabetical title sorting.
- Netscape Bookmarks HTML import and export for seamless cross-browser migration with Chrome, Firefox, Safari, Edge, and Brave.
- In-page selection translation via Google Translate, accessible directly from the text selection context menu.
- Full-page translation integration in the omnibox tools menu and Command Palette.
- "Paste and open" action in the omnibox right-click context menu.
- Symmetrical English and German localizations across all new features, dialogs, toasts, and menus.

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