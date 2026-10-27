# Changelog

All notable changes to Hinterland are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.20.0] - 2026-10-27

### Added
- **Community Hinter Store Uploads & Serverless Backend**:
  - **Vercel Serverless Store Endpoint (`website/api/store.js`)**: Serverless upload API supporting community themes and extensions backed by Supabase with Bearer token authentication, input validation, and per-IP rate limiting.
  - **Dynamic Community Catalog Merging (`src/ui/js/hinterStore.js`)**: Real-time retrieval and integration of community themes and extensions from the cloud catalog alongside official presets.
  - **Theme Studio Cloud Publishing**: Logged-in users can publish custom themes directly to the community catalog with one click (`Im Store veröffentlichen`) and instant live validation.
  - **Login-Gated Extension Upload Portal**: Added studio upload section for contributing community extensions with metadata validation, category tagging, and permission descriptors.
  - **Login Banner & Auth Routing**: Interactive authentication prompts in the Hinter Store directing unauthenticated users to sign up or log in.
- **Hinterland Web Account Dashboard & Serverless Microservices**:
  - **Web Account Portal (`website/account.html`)**: Complete responsive web dashboard for Hinterland accounts, supporting account registration, authentication, display name updates, one-click manual sync triggers, and privacy controls.
  - **Serverless Account API (`website/api/account.js`)**: Endpoints for user profile retrieval (`GET /api/account/me`), metadata updates (`PUT /api/account/me`), and sync provider status discovery (`GET /api/account/providers`).
  - **Privacy-Preserving UX Telemetry API (`website/api/telemetry.js`)**: Opt-in anonymized telemetry collector with strict PII filtering (stripping emails, passwords, IPs, auth tokens), event allowlisting, and batch size caps.
- **UI & Brand Polish**:
  - **Unified Hinterland Brand Logos**: Integrated official browser logo into Store Hero and Account profile avatars (`hinterland://assets/icon.png`), replacing generic placeholders.
  - **Theme Studio Styles (`src/ui/css/store.css`, `src/ui/css/panels.css`)**: Enhanced upload forms, inputs, textareas, and login-required banner styles.
- **Automated Regression & Serverless Test Suite (`sdk/test/v120Features.test.mjs`)**:
  - Added 11 automated unit and integration tests covering the Account API, Telemetry API (PII scrubbing, event filtering, opt-out handling), and Community Store API.

### Fixed
- **Supabase Auth Headers**: Standardized Bearer token string concatenation in `src/main/sync.js`, `website/api/feedback.js`, and `website/api/store.js` for consistent HTTP authorization header formatting.
- **Hinter Store Scoping & Event Routing**: Resolved module-level scoping for server upload helpers and updated account modal navigation triggers.

## [1.19.0] - 2026-10-26

### Added
- **Account System & Free Cloud Sync (Supabase & Vercel)**:
  - **Core Sync Engine (`src/main/sync.js`)**: Real-time cross-device synchronization of bookmarks (`data.bookmarks`) and user preferences (themes, appearance, privacy shields, density, start mode, reading list, notes, shortcuts).
  - **Zero-Knowledge Client-Side End-to-End Encryption (E2EE)**: Optional user passphrase derives an authenticated AES-256-GCM encryption key via PBKDF2 (100,000 iterations of SHA-256) client-side before upload, ensuring zero-knowledge privacy.
  - **Free Cloud Backend Support**:
    - **Personal Supabase (Direct)**: Connects directly to any free Supabase project via GoTrue Auth and user metadata/PostgREST with zero SQL setup or table migrations required.
    - **Hinterland Cloud (Vercel Serverless API `website/api/sync.js`)**: Out-of-the-box serverless sync endpoint supporting signup, login, pull, push, and intelligent two-way merge with rate limiting.
  - **Dedicated Account & Sync Modal Panel (`openAccount` in `src/ui/js/panels.js`)**:
    - **Status & Auth Card**: Seamless switching between Sign In and Free Account registration, profile hero with user avatar, connection status, last sync timestamp, and manual actions ("Sync Now", "Upload to Cloud", "Download from Cloud", "Sign Out").
    - **Sync Preferences Tab**: Granular control over Automatic Sync, Bookmarks sync, Settings sync, and E2EE sync passphrase configuration.
    - **Cloud Provider Tab**: Provider selector supporting default Hinterland Cloud or custom Supabase Project URL and public anon key with live credential saving.
  - **Quality-of-Life & Browser Integration**:
    - Quick "Sync Now" trigger embedded directly into Bookmarks panel (`openBookmarks`) action bar.
    - Dedicated Account section in Settings (`settings.section.account`) with quick panel launcher and instant sync action.
    - Integrated into Main Menu (`menu.account`), Command Palette (`commandPalette.account`, `commandPalette.syncNow`), and address bar navigation (`hinterland://account/`, `hinterland://sync/`).
    - Real-time status event broadcasting (`account:status`) and desktop toasts on sync success/failure.
  - **Automated Account & Cloud Sync Test Suite (`sdk/test/accountSync.test.mjs`)**:
    - 15 automated unit and integration tests covering bookmark normalization, conflict merge, syncable settings extraction, AES-256-GCM E2EE round-trip, Vercel serverless API handlers, rate limiting, and client lifecycle state.

## [1.18.0] - 2026-10-26

### Added
- **Interactive Hinterland Privacy Shields & Per-Site Tracker Blocker**:
  - **Site Shield Engine (`src/main/security.js`)**: Real-time per-origin blocked request monitor and tracker categorizer (Analytics, Advertising, Telemetry, Beacons/Pixels).
  - **Per-Site Protection Toggles**: Allows users to toggle enhanced tracking protection on or off on a per-site basis (`site:toggleShield`, `site:getShield`), seamlessly persisting exceptions in `privacy.allowedSites` and honoring initiator exemptions.
  - **Native Privacy Shield Card (`src/ui/js/siteInfo.js`)**: Embedded shield control inside the Site Info popup (`#omniIcon`) displaying real-time counters of blocked trackers on the current page, an instant protection toggle with auto-reload, and an expandable breakdown of blocked tracker domains and categories.
- **Site Cookies & Storage Inspector**:
  - **Native Cookie Engine (`src/main/sessions.js`, `src/main/ipc.js`)**: Real-time extraction, filtering, and normalization of site cookies across host-only and domain cookies (`site:getCookies`), individual cookie deletion (`site:deleteCookie`), site-specific cookie clearing (`site:clearCookies`), and storage statistics (`site:getStorageStats`).
  - **Dedicated Cookie Inspector Modal (`openCookieInspector`)**: Comprehensive interactive viewer for inspecting stored cookies on the active site, featuring real-time name/domain search filtering, masked values with reveal/hide toggle (`icon('eye')`/`icon('eyeOff')`), clipboard copy, expiration timestamps, security badges (Secure, HttpOnly, SameSite), and single-click cookie deletion.
- **Complete Downloads Manager Overhaul & History Persistence**:
  - **Cross-Session Download History**: Persisted download records in `data.downloadHistory` (capped at 200 items), tracking filename, size, download state (completed, active, interrupted), destination path, URL, and completion timestamp across browser restarts.
  - **Revamped Downloads Panel (`openDownloads` in `src/ui/js/panels.js`)**: Modern downloads manager with instant search filtering, status category tabs (All, Completed, Active, Interrupted), quick header actions ("Open Downloads Folder", "Clear List"), rich file type icons, formatted byte counts, and action buttons ("Open File", "Show in Folder", "Copy Link", "Remove").
- **Tab Audio Indicator Polish & Global Mute Controls**:
  - **Pulsing Tab Sound Animation (`src/ui/css/chrome.css`)**: Added `@keyframes tabAudioPulse` smooth pulsing animation to playing audio tabs (`.tabSound.isPlaying`).
  - **Command Palette & Shortcut Enhancements**: Added commands for toggling site shield (`commandPalette.toggleShield`), inspecting site cookies (`commandPalette.inspectCookies`), and unmuting all tabs (`commandPalette.unmuteAll`).
- **Automated Regression & Feature Test Suite (`sdk/test/v118Features.test.mjs`)**:
  - Added comprehensive test suite with 9 unit and integration specs covering tracker categorization, domain normalization, per-site shield exemptions, cookie deduplication and target URL extraction, and download history persistence.

## [1.17.4] - 2026-10-25

### Added
- **Password Manager Complete Overhaul & Zero-Knowledge Architecture**:
  - **Zero-Knowledge Cryptographic Vault Engine**: Implemented `src/main/passwords.js` leveraging PBKDF2 (100,000 iterations of SHA-256) key derivation and authenticated AES-256-GCM encryption at rest (`data.passwordsVault` in settings schema). Decrypted vault items and keys are held strictly in memory only while unlocked and purged immediately on lock.
  - **Inactivity Auto-Lock Timer**: Automatic vault locking with configurable timeout (default 15 minutes), wiping cached keys and decrypted credentials from memory upon inactivity.
  - **Native Browser Passwords Panel**: Added dedicated Passwords panel (`Ctrl+Alt+P` or `hinterland://passwords/`) with 4 focused tabs:
    - **This Site**: Instantly view, autofill, copy username/password, edit, or delete logins matching the active tab's domain.
    - **All Passwords**: Filterable search across title, username, domain, and notes with quick reveal toggles and modal login editor.
    - **Generator**: Interactive password generator with live entropy/strength scoring, length slider, character presets, and instant clipboard copy.
    - **Settings**: Master password change, auto-lock timeout adjustment, autofill and prompt toggles, never-save domain management, and encrypted vault export/import.
  - **Native Save Password Prompt**: Embedded prompt card below the omnibox toolbar triggered upon credential submission across web forms (`passwords:promptSave`), persisting across redirects with "Save", "Never for this site", and dismiss actions.
  - **In-Page Autofill & Credential Capture**: Isolated preload form listener captures submitted credentials before navigation occurs, and autofill engine dispatches synthetic `input` and `change` events for full compatibility with modern web frameworks (React, Vue, Angular).
  - **Clipboard Auto-Clearing**: Sensitive credentials copied to the clipboard are automatically wiped after 30 seconds for enhanced desktop security.
  - **Never-Save Blacklist**: Blacklist management preventing save prompts on specific domains.
  - **UI Integration**: Integrated into Main Menu (`menu.passwords` with `key` icon), Tabstrip context menu, Settings panel Data section, and Command Palette (`commandPalette.passwords`).
  - **Automated Password Manager Test Suite**: Added `sdk/test/passwordManager.test.mjs` verifying setup, unlock, CRUD, search filtering, memory wiping on lock, master password changes, domain blacklists, export/import JSON, and generator entropy across 11 automated test cases.

## [1.17.3] - 2026-10-25

### Fixed
- **Extension System Full Overhaul & Service Worker Compatibility**:
  - **Hinterland Pass Service Worker**: Added `"type": "module"` under `background` in `manifest.json`. Resolves `Uncaught SyntaxError: Cannot use import statement outside a module` and service worker initialization failure (status code 15) in Chromium MV3.
  - **Tab Query & Electron Active Tab Resolution**: Fixed `chrome.tabs.query({ active: true, currentWindow: true })` returning empty arrays inside Electron MV3 extensions. In Electron, `WebContentsView` tab contents lack Chromium native tab strip flags. The background service worker now safely queries all session tabs, and popup windows forward active site URL and tab ID via query parameters (`?activeUrl=...&tabId=...`).
  - **Hinterland Pass Autofill Reliability**: `HP_AUTOFILL_ACTIVE_TAB` now respects explicitly targeted tab IDs from the popup, falling back gracefully to query lookup without throwing `Error: No active tab found.`.
  - **Extension Action Content Script Dispatching**: Fixed toolbar button clicks failing for content script-based extensions (`hinterlandFocus`, `hinterlandPanel`, `markdownclipper`). Added listeners for `hinterland:extension-action` in content scripts and dispatched events directly into target web contents upon toolbar action invocation.
  - **Packaged Electron ASAR Unpacking**: Added `"asarUnpack": ["src/extensions/**/*"]` to `package.json` and updated `src/main/resources.js` to dynamically resolve `app.asar.unpacked/src/extensions`. This ensures the Chromium C++ extension loader can read unpacked extensions directly from the physical filesystem when running in packaged Windows builds.
  - **Extension Toolbar Interaction & Context Menus**: Left-clicking an extension toolbar button now seamlessly opens the extension popup dialog if action handling returns false or is not handled in-page. Right-clicking an extension toolbar button now triggers a context menu to inspect and manage extension details.
  - **Electron Session Extension API Version Fallbacks**: Hardened `getSessionExtensions`, `removeSessionExtension`, and `loadSessionExtension` in `src/main/extensions.js` with defensive fallbacks across `session.extensions` and `session` root methods, alongside case-insensitive path normalization on Windows.

### Added
- **Extension SDK Toolbar Helper (`ContentHelper.onExtensionAction`)**: Added high-level listener method in `sdk/src/content.js` allowing custom extensions to subscribe to Hinterland toolbar action clicks.
- **Manifest Validator Type Enforcement**: Updated `validateManifest` in `sdk/src/manifest.js` to ensure `"background.type"` is verified when service workers use ES module syntax.
- **Automated Extension Regression Test Suite**: Added automated tests verifying service worker module declarations, action content script event subscriptions, packaged ASAR unpack configuration, and popup parameter passing.
- **Search Engine Omnibox Chips**: Fast switching between configured search engines (@google, @duckduckgo, etc.) with clickable chips in the omnibox popup.
- **Visual Tab Group Color Swatches**: Visual color palette picker popup when clicking a tab group's color indicator.
- **Reading List "Open All Unread" Action**: One-click action in the Reading List panel to open all unread reading list articles in background tabs and mark them as read.

## [1.17.2] - 2026-10-25

### Fixed
- **Settings Store & Prototype Pollution Hardening**:
  - Protected `deepSet`, `deepGet`, `set()`, and `merge()` against prototype pollution vectors targeting `__proto__`, `prototype`, and `constructor`.
  - Hardened `settings.merge(patch)` against `null`, `undefined`, or non-object primitive inputs, preventing unhandled `TypeError` exceptions.
  - Enabled constructor file path parameter and safe Node/Electron hybrid environment detection for settings and history persistence.
- **PiP & Media Controls Runtime Fix**:
  - Corrected `togglePiP()` and `toggleMediaPlay()` in `src/main/tab.js`: previously evaluated closures in the Node.js main process context rather than serializing them to WebContents, causing PiP and media playback toggles to silently fail.
- **View Lifecycle & Memory Leak Elimination**:
  - Re-engineered `BrowserSurface.stackViews()` to inspect and purge orphaned `WebContentsView` children from the root view hierarchy, preventing leaked view handles when switching tabs or closing windows.
- **IPC Surface Boundary & Security Validation**:
  - Added destroyed-state safety guards to `activeTab(id)` to prevent IPC handlers from invoking operations on destroyed `WebContents`.
  - Added strict parameter validation to `app:killProcess` (rejects non-integer, <= 0, NaN, strings, and the browser's own PID).
  - Hardened `site:setPermission` with an allowed permissions whitelist and prototype pollution defense.
  - Hardened `bookmarks:importHtml`, `stashes:importJson`, and `readingList:add` by strictly filtering protocols to `http://` and `https://` schemes.
  - Guarded `tabs:muteOthers` and `tabs:reloadAll` loops against destroyed background tabs.
- **Protocol Resiliency & URL Navigation**:
  - Wrapped `decodeURIComponent` in the custom `hinterland://` scheme handler in try/catch blocks to gracefully handle malformed percent-encoding without unhandled `URIError` crashes.
  - Enhanced `hostLooksReal` in `src/main/navigation.js` to strip port numbers before hostname validation, properly recognizing local developer endpoints such as `127.0.0.1:8080` and `localhost:3000` without requiring an explicit scheme.
  - Hardened `stripTracking` in `sdk/src/security.js` with case-insensitive `utm_*` matching, expanded ad parameter coverage (`spreportid`, `fb_action_ids`), and safe handling for non-string inputs.
  - Corrected `downloads.applyThrottle` to return its interval handle, ensuring throttled downloads can be cleanly un-throttled.

### Added
- **Automated Stress & Robustness Suite (`sdk/test/stressTest.test.mjs`)**:
  - Added comprehensive test suite with 16 deep robustness specs covering prototype pollution fuzzing, schema constraints validation, navigation port resolution, tracking stripping edge cases, tabstrip directional closing simulations, Hinterland Pass cryptographic tampering detection, IPC security boundaries, and protocol URI decoding resilience.

## [1.17.1] - 2026-10-25

### Fixed
- **Fullscreen (F11) Black Screen Resolution**:
  - Fixed a critical regression where pressing `F11` or triggering full screen resulted in a black screen.
  - Corrected `BrowserSurface.layout` geometry: previously, entering fullscreen set the chrome boundary `edge` equal to window height, erroneously sizing the active tab's `contentView` to 0px height at off-screen coordinates while hiding `chromeView`.
  - Content view is now properly allocated full window bounds (`{ x: 0, y: 0, width, height }`) upon entering fullscreen and on resize.
  - Added keyboard focus handover to `contentView` upon entering fullscreen, enabling uninterrupted web navigation.
  - Added support for the `Escape` key to smoothly exit fullscreen mode alongside `F11`.
  - Added regression test suite in `sdk/test/v117Features.test.mjs` verifying fullscreen layout geometry, visibility toggling, and clean restoration.

## [1.17.0] - 2026-10-25

### Added
- **Unified Hinterland Design System (`design/tokens.css`, `docs/design.md`)**:
  - Established canonical design token foundation shared across the browser UI, extensions, and web properties.
  - Semantic color palette with full light and dark mode color scheme adaptability (`--accent`, `--surface`, `--surfaceAlt`, `--surfaceHover`, `--text`, `--textDim`, `--border`, `--borderSoft`).
  - Standardized elevation shadows, border radii (`--radius`, `--radiusSmall`, `--radiusLarge`), spacing scale, typography, and motion timings (`--anim`).
  - Accessibility and compact density modifiers (`data-theme="light"`, `data-animations="off"`, `data-density="compact"`).
  - Published comprehensive architectural documentation and design philosophy in `docs/design.md`.
- **Autonomous Autopilot Pipeline (`scripts/autopilot.mjs`)**:
  - Implemented automated feedback triage, patch generation, and PR pipeline powered by LLM integration.
  - Added scheduled and dispatchable GitHub Actions workflows (`.github/workflows/autopilot.yml`, `health.yml`, `auto-merge.yml`) for autonomous maintenance and health monitoring.
- **Interactive Feedback System & Hardened Serverless API (`website/api/feedback.js`)**:
  - Serverless feedback collection endpoint deployed on Vercel with automated GitHub issue creation.
  - Multi-tier defense: Honeypot bot protection, in-memory IP rate limiting, control character sanitization, and strict length validation.
  - Added client-side fallback to direct mailto links when backend services or tokens are unavailable.
  - Configured strict web security policies (`website/vercel.json`): Content Security Policy (CSP), Permissions-Policy, X-Content-Type-Options, and X-Frame-Options.
- **Automatic System Language Translation & Global Switcher**:
  - Automatic browser/system language detection on the official portal with Google Translate engine integration.
  - Interactive language switcher dropdown supporting 25+ global languages with persistent user preference storage in `localStorage` (`hl-lang`).
- **Website Smoke Testing Suite (`scripts/website-smoke.mjs`, `.github/workflows/website-smoke.yml`)**:
  - Automated smoke test runner verifying production homepage availability, design tokens, and feedback API validation rules.
- **Unit Test Suite**:
  - Added test suite `sdk/test/v117Features.test.mjs` covering design tokens consistency, feedback validation and sanitization boundaries, and language code mappings.

## [1.16.0] - 2026-10-25

### Added
- **Dedicated Website & Changelog Portal (Vercel)**:
  - Added dedicated `website/` deployment package configured for Vercel with clean URLs and strict security headers.
  - Interactive marketing and download portal featuring real-time release status, direct Windows installer download links, dark/light theme switching, and client-side markdown changelog parser fetching latest updates directly from GitHub.
  - Added 1-click "Official Website" navigation button in the "About Hinterland" panel (`openAbout`), allowing users to visit the portal directly from within the browser.
  - Added "About Hinterland" entry directly to the Main Menu for instant access to version details, diagnostic folders, and portal links.
- **Privacy: Clean Link Sharing (`copyCleanUrl`)**:
  - Added "Copy clean link" to the Tab context menu, Command Palette, and tab actions.
  - Automatically strips invasive tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`, `yclid`, `twclid`, `igshid`, `mc_eid`, `_hsenc`, etc.) from URLs before copying to clipboard.
  - Toast confirmation informs the user whenever a sanitized link has been copied.
  - Exposed `stripTracking` in the Hinterland Extension SDK (`sdk/src/security.js`) and root export for third-party extensions.
- **Tabstrip Management: Directional Tab Closing**:
  - Added "Close tabs to the right" and "Close tabs to the left" directly to the Tabstrip context menu (`openTabMenu`).
  - Seamlessly closes unpinned tabs in the chosen direction while preserving pinned tabs and the selected active tab.
- **Test Suite**:
  - Added unit test suite `sdk/test/v116Features.test.mjs` verifying clean link stripping, tracker parameter removal, and directional tab closing retention policies.

## [1.15.1] - 2026-10-25

### Added
- **Reader Mode Customization Suite & Typography Controls**:
  - Interactive top bar controls for in-page distraction-free article reading.
  - 4 curated reading color schemes: Light (paper white), Sepia (vintage parchment), Slate Dark (charcoal), and Pitch OLED (true black).
  - Multi-family typography switcher: Classic Editorial Serif, Clean Sans-Serif, and Monospace.
  - Interactive font-size stepper (`A-` / `A+`, 14px to 26px) with visual pixel indicator.
  - Configurable reading column width: Compact (580px), Standard (740px), and Wide (960px).
  - Reader quick-actions: 1-click "Add to Reading List" (integrates directly with Hinterland's Reading List store), "Copy Clean Markdown" (extracts structured markdown of headings, paragraphs, blockquotes, and lists), and Print action.
  - Real-time in-page toast feedback on copying markdown or saving articles to reading list.
  - Persistent reader preferences: User theme, typography, font size, and width preferences are remembered across articles and browser sessions in `schema.js`.
- **Test Suite**:
  - Added unit test suite `sdk/test/v115Features.test.mjs` verifying QR code matrix generation, SVG rendering, memory saver tab filtering policies, and reader mode preference normalization.

## [1.15.0] - 2026-10-25

### Fixed
- **Bundled Extensions Default Enablement & Lifecycle Fix**:
  - Fixed an issue where bundled extensions (`Hinterland Focus`, `Hinterland Panel`, `Hinterland Pass`) defaulted to disabled and showed as "nicht geladen" (loadFailed) or could not be activated.
  - Resolved session extension synchronization in `ExtensionManager`: cleanly removes extensions from Electron's session runtime via `session.extensions.removeExtension` upon disabling to prevent `Extension is already loaded` / `loadFailed` crashes on re-enable.
  - Automatically activates bundled extensions by default on initial start while respecting manual user enable/disable selections across browser restarts.
- **Dedicated Extension Symbols & Icon Rendering**:
  - Created high-resolution, custom icons (16px, 32px, 48px, 128px) for all bundled extensions:
    - `Hinterland Focus`: Sapphire and indigo focus target badge representing quiet reading mode.
    - `Hinterland Panel`: Emerald and mint split panel layout badge representing distraction-free sidebar view.
    - `Hinterland Pass`: Dedicated security shield and lock badge.
  - Enhanced `ExtensionManager` with base64 data URI icon resolution (`resolveIcons`), allowing crisp rendering across the browser toolbar, extension popup, and extensions management modal.
  - Added visual icon cards (`extensionCardIcon`) in the Extensions Manager (`#openExtensions`) for every installed extension.

### Added
- **Native Page QR-Code Generator (`openQrCode`)**:
  - Share any webpage directly to a mobile device, smartphone, or tablet camera with 1 click without any external dependencies or third-party web requests.
  - Pure in-browser QR matrix engine with Galois Field math, Reed-Solomon error correction, and optimal byte encoding.
  - Interactive QR Modal with "Copy image", "Copy link", and "Download PNG" capabilities.
  - Omnibox quick action button (`#omniQr`) on all web pages, Tab Context Menu, Main Menu, and Command Palette integration.
- **Task Manager Memory Saver Statistics**:
  - Live statistics in the Task Manager (`#openTaskManager`) tracking active sleeping tabs and estimated RAM savings in megabytes.
  - "Sleep all inactive tabs" action in the main menu and tab context menu for instant resource reclamation.
- **Test Suite**:
  - Comprehensive unit test coverage in `sdk/test/extensionsAndQr.test.mjs` verifying extension icon sets, valid PNG headers, base64 resolution, default enablement, lifecycle toggling, and QR matrix generation.

## [1.14.0] - 2026-10-25

### Added
- **Tab Stash & Workspaces (`openTabStash`, `Ctrl+Shift+U`)**:
  - Save, organize, and restore tab groups and research sessions with 1 click without losing your place.
  - Stash Manager modal panel featuring instant search across stashes and tab titles/URLs, relative creation timestamps, and tab count badges.
  - "Stash All Tabs" and "Stash Inactive Tabs" (keeps current working tab while clearing background tabs into a named stash).
  - Stash management: 1-click "Restore All" (opens all tabs in the stash), inline renaming of stashes, deletion with confirmation dialog, and individual tab removal or direct opening.
  - Full JSON backup and restore: Export single or all stashes to disk (`.json`) and import stashes from any JSON file.
  - Accessible via `Ctrl+Shift+U`, Main Menu, Tabstrip Context Menu ("Stash all tabs", "Stash other tabs"), and Command Palette.
- **Custom Search Engines & Omnibox Keywords (`@keyword`)**:
  - Instant search engine keyword prefixing in the omnibox (e.g. `@gh electron`, `@w quantum`, `@yt lofi`, `@npm react`, `@ddg privacy`, `@g query`).
  - Pre-configured search engines with curated keyword shortcuts: DuckDuckGo (`@ddg`), Google (`@g`), Mojeek (`@m`), GitHub (`@gh`), Wikipedia (`@w`), YouTube (`@yt`), and npm (`@npm`).
  - Typing standalone keywords (e.g. `@gh` or `@yt`) navigates directly to the engine's homepage.
  - Typing `@` in the omnibox presents an interactive search engine and keyword selector card.
- **Per-Site Zoom Memory & Interactive Omnibox Zoom Reset**:
  - Persistent per-host zoom factors saved in user settings (`site.zoomLevels`), automatically remembered and reapplied whenever navigating to or opening tabs on that domain.
  - Interactive `#omniZoom` button in the address bar displaying current zoom percentage (e.g. `120%`, `80%`) whenever the page zoom differs from 100%.
  - 1-click zoom reset on the omnibox badge restoring default zoom (100%), clearing the domain override, and providing visual toast feedback.
- **Site Permissions & Security Inspector (`openSiteInfo`)**:
  - Granular site permissions management inside the omnibox Site Info badge (`#omniIcon`) for any web page.
  - Direct 3-way toggles ("Default", "Allow", "Block") for Camera, Microphone, Geolocation, Notifications, and Clipboard per origin.
  - Persistent origin permission exceptions (`privacy.sitePermissions`) with automated precedence over global browser defaults.
- **Unit Test Suite**:
  - Comprehensive unit test coverage (`sdk/test/stashesAndSearch.test.mjs`) for shortcut registration, keyword search engine matching and URL resolution, tab stash state management, JSON export/import validation, per-site zoom factor storage, and origin-based site permission policy resolution.

## [1.13.0] - 2026-10-25

### Added
- **Quick Notes & Web Scratchpad (`openNotes`, `Ctrl+Shift+Y`)**:
  - Built-in scratchpad for thoughts, research clippings, and markdown notes accessible via `Ctrl+Shift+Y`, the main menu, and Command Palette.
  - Multi-note manager with real-time search, pinned notes, and persistent storage in user settings.
  - One-click active tab link clipping: inserts formatted `[Tab Title](Tab URL)` into notes instantly.
  - Markdown editor and live preview: supports headings (`#`), bold, italics, inline code, fenced code blocks, checklists (`- [ ]`), bullet points, and clickable links.
  - Native file export: export any note directly to `.md` on disk via native file dialog, or copy formatted text with 1 click.
- **Dedicated Clear Browsing Data Dialog (`openClearData`, `Ctrl+Shift+Delete`)**:
  - Modal dialog triggered by `Ctrl+Shift+Delete`, main menu, History panel, and Command Palette.
  - Configurable time ranges: Past hour, Past 24 hours, Past 7 days, Past 4 weeks, and All time.
  - Granular selection for Browsing history, Cookies & site data, Cached images & files, Site storage & settings, Download history, and Recently closed tabs.
- **Global Media Controller & Picture-in-Picture (`openMediaControls`, `togglePiP`, `Ctrl+Shift+X`, `Ctrl+Alt+M`)**:
  - Interactive toolbar Media Controller button (`#mediaButton`) that automatically appears and pulses when any open tab is playing media.
  - Media Controller card showing audible and playing tabs with title, domain, favicon, Play/Pause toggle, audio mute, and Picture-in-Picture controls.
  - Direct Picture-in-Picture shortcut (`Ctrl+Shift+X`) to toggle PiP for videos on the active tab immediately.
- **Bookmark All Open Tabs (`menu.bookmarkAllTabs`)**:
  - One-click session saving in the tabstrip context menu and Command Palette, saving all open web tabs into a dated bookmark folder.
- **Unit Test Suite**:
  - Comprehensive unit test coverage (`sdk/test/notesAndMedia.test.mjs`) for shortcut registration, markdown parsing, XSS sanitization, and timestamp-based history filtering.

### Fixed
- **History Clearance Variable Shadowing**:
  - Resolved an issue in `clearBrowsingData` where the parameter named `history` shadowed the imported `history` store module, causing history deletion to fail silently.
  - Added `clearSince(timestamp)` in `src/main/history.js` for accurate time-range filtering.
- **Tab Sound Indicator Interaction**:
  - Added `mousedown` event stopping on the tab sound button (`.tabSound`) to prevent accidental tab selection or dragging when muting/unmuting tabs.
  - Retained visible mute icon for muted tabs even when audio playback pauses.

## [1.12.2] - 2026-10-25

### Fixed
- **New Tab Button & Click Interception**:
  - Resolved an issue where clicking the `+` (`#newTab`) button was intercepted by the titlebar's `-webkit-app-region: drag` overlay, preventing `click` events from registering on Windows.
  - Added `-webkit-app-region: no-drag;` and proper stacking context (`z-index: 2; cursor: pointer;`) to tab action buttons and tab close buttons.
- **Tab Closing**:
  - Resolved an issue where clicking the tab close button (`.tabClose`) was intercepted by titlebar dragging or race conditions with tab activation.
  - Added `mousedown` event stopping on `.tabClose` to ensure clean tab closure without triggering tab selection or drag sequences.
  - Ensured that closing the sole active tab gracefully creates a fresh new tab rather than leaving the browser in a zero-tab state.
- **Universal Tab Shortcuts (`Ctrl+T`, `Ctrl+W`)**:
  - Removed field focus restrictions (`!inField`) so `Ctrl+T` and `Ctrl+W` reliably trigger regardless of whether focus is inside the omnibox, a webpage input, or a search field.
  - Fixed shortcut key combination parsing in main process (`shortcuts.js`) to cleanly handle modifier keys and accelerators across WebContents.

## [1.12.1] - 2026-10-25

### Added
- Hinter Store Weekly Spotlight ("Fokus der Woche" / "Weekly Pick"):
  - Highlights one curated application or theme every week based on calendar rotation.
  - Features clear editorial breakdowns detailing "Was es ist" (What it is) and "Wieso im Fokus" (Why it's in focus).
  - Direct 1-click install, configure, or theme activation from the spotlight banner.

### Removed
- Removed simulated rating stars and download metrics from all themes and extension cards in Hinter Store until official telemetry and server-backed data are implemented.

### Changed
- Curated store filtering: Streamlined sort options to focus on curated recommendations and alphabetical browsing.
- Theme and extension card metadata redesigned with clean mode badges (Dark/Light) and categorized capability tags.

## [1.12.0] - 2026-10-25

### Added
- Hinter Store Hub (`hinterland://store/` and Store Modal):
  - Centralized store for discovering, installing, and managing official and community extensions and themes.
  - Multi-tab navigation: "All", "Themes", "Extensions", "Installed", and "Theme Studio".
  - Search, source filters ("All", "Official", "Community"), and sort controls (Recommended, Most Popular, Highest Rated, Alphabetical).
- Official & Community Themes:
  - Curated official themes: Hinterland Midnight, Pure Light, OLED Pitch, Nord Frost, Emerald Forest, and Sunset Glow.
  - Community theme presets: Catppuccin Mocha, Tokyo Night, Dracula Pro, Gruvbox Warm Dark, Rosé Pine Dawn, Cyberpunk 2077 Neon, Solarized Horizon, and Bauhaus 1919.
  - Interactive live browser mockup previews displaying real-time accent, background, surface, and text colors.
  - Live Theme Customizer: Interactive accent color picker with quick swatches, border radius slider, density picker (Compact, Cosy, Roomy), and typography font stack selector.
  - Theme Export & Import: Direct JSON export and import for community theme presets (`.hintertheme.json`).
- Official & Community Extensions:
  - Curated extension catalog featuring Hinterland Pass, Hinterland Focus, Hinterland Panel, Hinterland Shield, Hinterland Notes, Hinterland Translator, Dark Reader, Pomodoro Focus Timer, DevTools Plus, Vim Navigation, Tab Suspender Pro, and Markdown Web Clipper.
  - One-click in-store installation and uninstallation of extensions.
  - In-store extension configurator: Live toggles, numeric sliders, option selects, and direct action popup triggers.
- Theme Studio & Creator:
  - Built-in theme creator to design custom Hinterland themes from scratch with live preview mockup, custom branding, and JSON export/import.
- Browser & Menu Integrations:
  - Internal protocol support for `hinterland://store/`.
  - Main menu item ("Hinter Store"), Extensions panel store button, Extensions popup quick link, and Command Palette shortcuts ("Open Hinter Store", "Store: Browse themes", "Store: Browse extensions", "Store: Theme Studio").
  - Persistent settings schema for active theme, installed community themes, and extension preferences.
  - Full English and German localization across all store views, tooltips, dialogs, and notifications.

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