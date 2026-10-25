# Hinterland Extension SDK — Developer Guide & API Reference

Welcome to the official developer guide for creating extensions for the **Hinterland Browser**.

Hinterland extensions are built on the modern **WebExtensions Manifest V3** standard, coupled with an ergonomic, secure JavaScript/TypeScript SDK (`@hinterland/extension-sdk`) and runtime sandboxing designed from the ground up to protect user data from being exploited.

---

## 1. Architecture Overview

Hinterland extensions operate across three distinct environments:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HINTERLAND BROWSER                            │
│                                                                         │
│  ┌────────────────────────┐                   ┌───────────────────────┐ │
│  │   Background Worker    │  MessageBus (IPC) │     Action Popup      │ │
│  │ (background.js, MV3 SW)│ ◄───────────────► │ (popup.html / UI Kit) │ │
│  └───────────┬────────────┘                   └───────────────────────┘ │
│              │                                     ▲                    │
│              │ MessageBus                          │ Safe Preload       │
│              ▼                                     │ (Sandboxed)        │
│  ┌────────────────────────┐                   ┌────┴──────────────────┐ │
│  │     Content Script     │                   │  Preload Isolation    │ │
│  │(content.js / Shadow DOM│                   │  (NO window.          │ │
│  └───────────┬────────────┘                   │      hinterland)      │ │
│              │                                └───────────────────────┘ │
│              ▼                                                          │
│  ┌────────────────────────┐                                             │
│  │    Web Page (DOM)      │                                             │
│  │  (Isolated JS World)   │                                             │
│  └────────────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **Background Service Worker (`background.js`)**:
   Event-driven background script managing state, long-running processes, alarms, and cross-tab coordination.
2. **Action Popup (`popup.html`)**:
   Interactive dialog rendered when clicking the extension's toolbar puzzle button. Runs in a dedicated sandboxed window using Hinterland's isolated extension preload without any access to privileged browser internal IPCs.
3. **Content Scripts (`content.js`)**:
   Scripts injected into web pages matching defined URL patterns. Run in an **isolated world** with access to the DOM but isolated JavaScript scopes, preventing host pages from accessing extension variables.

---

## 2. Getting Started in 5 Minutes

### Step 1: Initialize the Extension

Run the Hinterland SDK CLI to scaffold a new extension:

```bash
npx hinterland-sdk init reading-ruler
cd reading-ruler
```

This generates:
- `manifest.json`: Manifest V3 configuration with secure defaults
- `background.js`: Background service worker with lifecycle hooks
- `content.js` & `content.css`: Content script with DOM isolation
- `popup.html`, `popup.js`, `popup.css`: Action popup matching Hinterland's dark/light design tokens
- `README.md`: Local documentation

### Step 2: Validate Security & Manifest Compliance

Audit the extension using the built-in security linter:

```bash
npx hinterland-sdk validate .
```

The validator verifies:
- Manifest V3 structure
- Permissions least-privilege compliance
- Absence of dangerous functions (`eval()`, `new Function()`, `document.write()`)
- Safe file path boundaries (preventing directory traversal)

### Step 3: Load into Hinterland Browser

1. Open **Hinterland Browser**.
2. Open **Settings** (or press `Ctrl+,`).
3. Scroll down or click **Extensions** in the sidebar.
4. Toggle on **Allow Unpacked Extensions**.
5. Click **Install Unpacked Extension** and select your directory.
6. The extension is now active and pinned in the toolbar!

---

## 3. Core SDK API Reference

### 3.1. Manifest Builder (`@hinterland/extension-sdk/manifest`)

```javascript
import { defineManifest, PERMISSION_LEVELS } from '@hinterland/extension-sdk/manifest';

export default defineManifest({
  name: 'Clean Reading',
  version: '1.0.0',
  description: 'A distraction-free reading assistant for Hinterland.',
  permissions: ['activeTab', 'storage'],
  action: {
    default_title: 'Toggle Clean Reading',
    default_popup: 'popup.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png'
    }
  },
  background: {
    service_worker: 'background.js'
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['content.js'],
      css: ['content.css'],
      run_at: 'document_idle'
    }
  ]
});
```

#### Permission Tiers

| Tier | Permissions | Description |
|---|---|---|
| **Safe** | `storage`, `activeTab`, `alarms`, `scripting`, `contextMenus`, `action`, `declarativeNetRequest` | Standard functional permissions with minimal privacy exposure. |
| **Sensitive** | `cookies`, `tabs`, `history`, `bookmarks`, `downloads`, `webRequest`, `<all_urls>` | Elevated access; flagged with security warnings during audit. Requires explicit user intent. |
| **Forbidden** | `debugger`, `nativeMessaging`, `management`, `privacy`, `proxy`, `vpnProvider` | Blocked by Hinterland runtime. Prohibited to prevent system exploitation. |

---

### 3.2. Secure Storage (`@hinterland/extension-sdk/security`)

Extensions often store user preferences or API credentials. `createSecureStorage` guarantees data isolation and hardware-accelerated AES-GCM encryption.

```javascript
import { createSecureStorage } from '@hinterland/extension-sdk/security';

const storage = createSecureStorage({
  namespace: 'reader_extension',
  encryptionKey: 'user-secret-key' // Optional: enables AES-GCM encryption
});

// Store a preference safely
await storage.set('theme', 'dark');

// Store sensitive credentials (automatically encrypted with AES-GCM + PBKDF2)
await storage.set('userToken', 'auth_token_94821', { encrypt: true });

// Read back data (automatically decrypted)
const token = await storage.get('userToken', null);

// Remove or clear
await storage.remove('theme');
await storage.clear(); // Clears only keys under 'reader_extension' namespace
```

**Key Security Protections:**
- **Prototype Pollution Prevention**: Automatically rejects keys like `__proto__`, `constructor`, or `prototype`.
- **Namespace Isolation**: Keys are prefixed to prevent collisions across extensions or internal browser data.
- **Hardware AES-GCM**: Uses native Web Crypto API (`crypto.subtle`) with PBKDF2 (100,000 iterations) and 256-bit AES-GCM.

---

### 3.3. HTML Sanitization & Safe DOM (`@hinterland/extension-sdk/security`)

Prevent Cross-Site Scripting (XSS) when displaying user content or remote data in extension popups:

```javascript
import { escapeHtml, sanitizeHtml, safeHtml } from '@hinterland/extension-sdk/security';

// 1. Tagged template literal with auto-escaping
const userName = '<script>stealCredentials()</script>';
const html = safeHtml`<div class="user-greeting">Welcome, ${userName}!</div>`;
// Result: <div class="user-greeting">Welcome, &lt;script&gt;stealCredentials()&lt;/script&gt;!</div>

// 2. Rich HTML sanitizer (strips scripts, event handlers, dangerous schemes)
const dirtyInput = '<div onclick="bad()">Safe text <iframe src="evil.com"></iframe></div>';
const cleanHtml = sanitizeHtml(dirtyInput);
// Result: <div>Safe text </div>
```

---

### 3.4. Safe Message Bus (`@hinterland/extension-sdk/messaging`)

Communicate between content scripts, background workers, and popups with origin and sender verification:

```javascript
import { createMessageBus } from '@hinterland/extension-sdk/messaging';

const bus = createMessageBus({
  defaultTimeoutMs: 5000
});

// In Background Worker: register typed handler
bus.on('GET_STATISTICS', async (payload, sender) => {
  // sender.id is automatically verified against chrome.runtime.id
  return {
    articlesRead: 14,
    totalMinutes: 120
  };
});

// In Popup or Content Script: send message
try {
  const stats = await bus.sendToBackground('GET_STATISTICS');
  console.log('Statistics:', stats);
} catch (err) {
  console.warn('Request failed or timed out:', err.message);
}
```

---

### 3.5. Content Script Helper (`@hinterland/extension-sdk/content`)

`ContentHelper` provides DOM encapsulation and safe text extraction:

```javascript
import { ContentHelper } from '@hinterland/extension-sdk/content';

// 1. Mount isolated Shadow DOM for extension UI
const host = document.createElement('div');
document.documentElement.appendChild(host);

const shadow = ContentHelper.mountShadowRoot(host, { mode: 'closed' });
const uiElement = document.createElement('div');
uiElement.textContent = 'Floating Reading Bar';
shadow.appendChild(uiElement);

// 2. Extract article text while strictly ignoring passwords and form inputs
const { title, text, wordCount, readingTimeMinutes } = ContentHelper.extractSafeArticleText();
console.log(`Reading time for "${title}": ${readingTimeMinutes} min (${wordCount} words)`);
```

---

### 3.6. Hinterland UI Kit (`@hinterland/extension-sdk/ui`)

Popups and options pages can use Hinterland design tokens and pre-styled UI controls:

```javascript
import { UIHelper, createStore, injectHinterlandTheme } from '@hinterland/extension-sdk/ui';

// Automatically inject dark/light CSS variables
injectHinterlandTheme(document);

// Create reactive state store
const store = createStore({ enabled: true, wordCount: 0 });

// Accessible toggle switch
const toggle = UIHelper.createSwitch({
  label: 'Enable Clean Reading',
  checked: store.get('enabled'),
  onChange: (checked) => store.set('enabled', checked)
});

// Container card
const card = UIHelper.createCard({
  title: 'Preferences',
  subtitle: 'Configure article presentation',
  content: toggle
});

document.body.appendChild(card);
```

---

## 4. Security & User Data Protection Principles

To protect users against malicious extensions or data exfiltration, every Hinterland extension must follow these core security practices:

### 1. Principle of Least Privilege (PoLP)
Only request the permissions your extension actually needs. Prefer `activeTab` over `<all_urls>`. `activeTab` grants temporary access only to the tab the user is actively viewing when invoking your extension.

### 2. Never Access Browser Internal Files
Extensions run in sandboxed contexts. They cannot read or modify:
- Hinterland profile databases (`history.sqlite`, `bookmarks.json`, `settings.json`)
- System files or user directories
- Passwords stored in the operating system credential manager

### 3. Popup Sandbox Guarantee
Hinterland renders extension popups with:
```javascript
webPreferences: {
  preload: EXTENSION_PRELOAD, // Isolated extension bridge
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
}
```
The internal `window.hinterland` IPC bridge is **never** provided to extension popups.

### 4. Shadow DOM Encapsulation
Always mount in-page UI inside a `closed` Shadow DOM:
```javascript
const shadow = host.attachShadow({ mode: 'closed' });
```
This guarantees:
- Host page scripts cannot inspect or intercept inputs in your extension UI.
- Host page styles cannot override or distort your extension layout.

---

## 5. CLI Tool Reference (`hinterland-sdk`)

| Command | Usage | Description |
|---|---|---|
| `init` | `hinterland-sdk init <name> [--dir <path>]` | Scaffolds a new extension with compliant Manifest V3 structure. |
| `validate` | `hinterland-sdk validate [dir] [--strict]` | Runs deep security audit and schema validation on the extension. |
| `pack` | `hinterland-sdk pack [dir] [out.zip]` | Audits and packages extension into a `.zip` file for distribution. |
| `version` | `hinterland-sdk version` | Prints the SDK version. |
| `help` | `hinterland-sdk help` | Displays the help menu. |

---

## 6. Complete Example Extension

A full, production-ready example extension demonstrating the SDK can be found in the repository at:
[`examples/smart-reader`](file:///C:/Dev/Projects/Hinterland/examples/smart-reader)

To test it:
```bash
npx hinterland-sdk validate examples/smart-reader --strict
```
Then load it as an unpacked extension in Hinterland!
