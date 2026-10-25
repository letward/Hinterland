# Hinterland Extension Security & Data Protection Specification

## 1. Objective

The Hinterland Browser extension architecture is designed to allow developers to build powerful browser extensions while guaranteeing that **user data is strictly protected against exploitation, exfiltration, and tampering**.

---

## 2. Protected Assets

The following user assets are strictly isolated and protected from third-party extensions:

1. **Browser Internal IPC & OS Controls**:
   - Process termination (`app:killProcess`), update mechanisms, and filesystem access.
2. **User History & Navigation Activity**:
   - Full browsing history, recently closed tabs, session restore archives.
3. **Saved Credentials & Cookies**:
   - Master session tokens, cookies, form autofill data, and site credentials.
4. **Browser Configuration & Personalization**:
   - Custom search engines, proxy settings, tracker blocking exceptions, and privacy rules.
5. **DOM Form Inputs in Web Pages**:
   - Credit cards, passwords, CVV codes, two-factor authentication tokens.

---

## 3. Threat Model & Mitigations

| Threat | Attack Vector | Hinterland Defense & Mitigation |
|---|---|---|
| **Privilege Escalation via Popup** | Extension popup accessing internal browser IPCs | **Dedicated Preload Isolation:** Extension popups are loaded with `EXTENSION_PRELOAD` which exposes only `window.hinterlandExtension.closePopup()`. The privileged `window.hinterland` API is completely omitted. |
| **Data Exfiltration via History/Cookies** | Extension silently querying all visited URLs or site cookies | **Strict Permission Gating:** Permissions like `cookies` or broad host permissions (`<all_urls>`) trigger audit warnings and require unpacked developer mode. Forbidden permissions (`debugger`, `nativeMessaging`, `privacy`, `proxy`) are blocked at runtime. |
| **Arbitrary Code Execution in Active Tabs** | Malicious extension ID injecting raw scripts into tabs via `executeJavaScript` | **Safe Serialization:** Extension actions use `JSON.stringify(id)` during event dispatch to prevent script injection escapes. |
| **DOM XSS in Extension UI** | Unsanitized API or web data rendered via `innerHTML` in popups | **Built-in Sanitization:** SDK provides `sanitizeHtml()` and `safeHtml` tagged templates, stripping all scripts, frames, and inline `on*` event handlers. The SDK CLI flags raw `innerHTML` assignments. |
| **Extension UI Tampering / Keylogging** | Malicious web page scripts inspecting or altering injected extension UI | **Closed Shadow DOM Encapsulation:** `ContentHelper.mountShadowRoot(host, { mode: 'closed' })` isolates extension UI so page scripts cannot read inputs or modify styles. |
| **Storage Snooping / Cross-Extension Tampering** | One extension attempting to read or overwrite another extension's data | **Storage Partitioning:** `createSecureStorage` namespaces all keys (`_ht_<namespace>_`). Built-in hardware-accelerated AES-GCM encryption ensures sensitive data cannot be read in plaintext. |
| **Prototype Pollution** | Malicious keys (`__proto__`, `constructor`) corrupting the JavaScript runtime | **Key Validation:** `SecureStorage` rejects prototype pollution keys before storage operations execute. |
| **Dynamic Code Execution** | Extension executing remote code or obfuscated `eval()` | **Strict CSP Enforcement:** Default CSP enforces `script-src 'self'; object-src 'none';`. The browser rejects any manifest containing `'unsafe-eval'`. |
| **Path Traversal / Symlink Escapes** | Extension referencing scripts or files outside its directory (`../../`) | **Safe Join & Bounds Check:** `validateExtension` and `safeJoin` verify that every referenced script, popup, or stylesheet exists strictly inside the extension root directory. |

---

## 4. Permission Governance

Hinterland classifies WebExtension permissions into three tiers:

### Safe Tier (Allowed by default)
- `storage`: Local and session key-value storage.
- `activeTab`: Temporary access to the currently focused tab upon explicit user invocation.
- `alarms`: Periodic background tasks.
- `scripting`: Programmatic script injection into permitted tabs.
- `contextMenus`: Custom menu items in browser context menus.
- `action`: Browser toolbar button and popup.
- `declarativeNetRequest`: Safe, declarative rule-based network filtering.

### Sensitive Tier (Audited & Flagged)
- `cookies`: Reading or modifying web cookies.
- `tabs`: Querying URLs and titles of background tabs.
- `history`: Querying user browsing history.
- `bookmarks`: Reading or editing bookmarks.
- `downloads`: Managing file downloads.
- `webRequest`: Intercepting network requests.
- `<all_urls>`, `*://*/*`: Unrestricted host access.

### Forbidden Tier (Strictly Prohibited)
- `debugger`: Chrome DevTools Protocol debugging interface.
- `nativeMessaging`: Launching arbitrary local system executables.
- `management`: Controlling other installed browser extensions.
- `privacy`: Altering browser global security and privacy preferences.
- `proxy`, `vpnProvider`: Intercepting or routing global network traffic.

Any extension attempting to declare permissions from the **Forbidden Tier** is rejected during validation and blocked by the Hinterland extension manager (`validateExtension`).

---

## 5. Security Checklist for Extension Authors

Before distributing an extension for Hinterland, ensure the following checklist passes:

- [ ] Run `npx hinterland-sdk validate . --strict` and resolve all warnings.
- [ ] Use `safeHtml` or `sanitizeHtml` for all dynamic HTML rendering.
- [ ] Ensure all network requests use HTTPS (no plaintext HTTP).
- [ ] Mount in-page UI elements using `ContentHelper.mountShadowRoot(host, { mode: 'closed' })`.
- [ ] Encrypt sensitive tokens or user credentials in `createSecureStorage` with `encrypt: true`.
- [ ] Verify that no `eval()`, `new Function()`, or `document.write()` calls exist in your source code.
- [ ] Package your extension using `npx hinterland-sdk pack .`.
