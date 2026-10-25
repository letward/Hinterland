/**
 * @fileoverview Hinterland Extension SDK - Security, Sanitization & Safe Storage
 * Protects user data from being exploited, leaked, or hijacked by untrusted input.
 */

/**
 * Escapes HTML characters to prevent XSS.
 *
 * @param {string} str - Raw string
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

const DANGEROUS_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'object',
  'embed',
  'applet',
  'meta',
  'link',
  'base',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'svg',
  'math',
]);

const DANGEROUS_ATTRIBUTES = [
  /^on[a-z]+/i, // inline event handlers (onclick, onload, etc.)
  /^formaction$/i,
  /^srcdoc$/i,
  /^xlink:href$/i,
];

const DANGEROUS_PROTOCOLS = /^(javascript|vbscript|data):/i;
const SAFE_DATA_IMAGES = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

/**
 * Sanitizes an HTML string by removing scripts, inline event handlers,
 * dangerous protocols (javascript:, vbscript:), and exploitable tags.
 *
 * @param {string} dirty - Unsanitized HTML string
 * @returns {string} Clean, safe HTML string
 */
export function sanitizeHtml(dirty) {
  if (typeof dirty !== 'string') return '';
  if (!dirty.includes('<') && !dirty.includes('&')) return dirty;

  // In browser/DOM contexts, use DOMParser with an inert HTML document
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirty, 'text/html');

    const cleanNode = (node) => {
      // Remove dangerous tags
      if (node.nodeType === 1) { // ELEMENT_NODE
        const tag = node.tagName.toLowerCase();
        if (DANGEROUS_TAGS.has(tag)) {
          node.remove();
          return;
        }

        // Clean attributes
        const attrs = [...node.attributes];
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          const val = attr.value.trim();

          // Strip event handlers
          if (DANGEROUS_ATTRIBUTES.some((pattern) => pattern.test(name))) {
            node.removeAttribute(attr.name);
            continue;
          }

          // Strip dangerous protocols in links and sources
          if (name === 'href' || name === 'src' || name === 'action') {
            if (DANGEROUS_PROTOCOLS.test(val) && !SAFE_DATA_IMAGES.test(val)) {
              node.removeAttribute(attr.name);
            }
          }
        }
      }

      // Recursively clean children
      let child = node.firstChild;
      while (child) {
        const next = child.nextSibling;
        cleanNode(child);
        child = next;
      }
    };

    cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  // Fallback for Service Worker / Node environments (regex-based sanitizer)
  return dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/<[^>]+on[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/<[^>]+(javascript|vbscript):[^>]*>/gi, '')
    .replace(/<[^>]+srcdoc\s*=\s*(['"]).*?\1/gi, '');
}

/**
 * Tagged template literal for creating safe HTML with auto-escaped interpolation.
 *
 * @example
 * const html = safeHtml`<div class="user-card"><h3>${userName}</h3></div>`;
 */
export function safeHtml(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val === null || val === undefined) {
        // Skip
      } else if (typeof val === 'object' && val.__rawSafeHtml) {
        result += val.content;
      } else if (Array.isArray(val)) {
        result += val.map((item) => (item?.__rawSafeHtml ? item.content : escapeHtml(String(item)))).join('');
      } else {
        result += escapeHtml(String(val));
      }
    }
  }
  return result;
}

/**
 * Marks a string as pre-sanitized safe HTML to prevent double-escaping in `safeHtml`.
 *
 * @param {string} content - Pre-sanitized HTML
 * @returns {{ __rawSafeHtml: true, content: string }}
 */
export function rawSafeHtml(content) {
  return { __rawSafeHtml: true, content: sanitizeHtml(content) };
}

/**
 * Validates that an incoming sender matches expected extension ID or origin.
 *
 * @param {object} sender - chrome.runtime sender object
 * @param {string[]} [allowedOrigins] - Optional list of allowed origins
 * @returns {boolean} True if sender is verified
 */
export function validateOrigin(sender, allowedOrigins = []) {
  if (!sender) return false;

  // Internal extension message (from background, popup, or content script)
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    if (sender.id === chrome.runtime.id) return true;
  }

  // Cross-origin message check
  if (sender.origin && allowedOrigins.length > 0) {
    return allowedOrigins.includes(sender.origin);
  }

  return false;
}

/**
 * Masks sensitive patterns (passwords, auth tokens, credit cards) in text strings.
 *
 * @param {string} text - Raw input text
 * @returns {string} Masked string
 */
export function maskSensitiveText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[MASKED_TOKEN]')
    .replace(/(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._-]+/gi, '$1[MASKED_KEY]')
    .replace(/(password\s*[:=]\s*)\S+/gi, '$1[MASKED_PASSWORD]')
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[MASKED_CARD]');
}

/* ------------------------------------------------------------- Web Crypto AES-GCM */

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a plaintext string using AES-GCM with PBKDF2 key derivation.
 *
 * @param {string} plaintext - Data to encrypt
 * @param {string} secretKey - Passphrase or encryption secret
 * @returns {Promise<string>} Base64-encoded encrypted payload
 */
export async function encryptData(plaintext, secretKey) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API is not available in this environment.');
  }
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secretKey, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts an AES-GCM encrypted string.
 *
 * @param {string} ciphertext - Base64 encoded encrypted payload
 * @param {string} secretKey - Passphrase used during encryption
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptData(ciphertext, secretKey) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API is not available in this environment.');
  }
  const dec = new TextDecoder();
  const binary = atob(ciphertext);
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);

  const key = await deriveKey(secretKey, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );

  return dec.decode(decrypted);
}

/* ----------------------------------------------------------------- Secure Storage */

class MemoryStorageBackend {
  constructor() {
    this.map = new Map();
  }
  async get(keys) {
    const res = {};
    const keyList = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(this.map);
    for (const k of keyList) {
      if (this.map.has(k)) res[k] = this.map.get(k);
    }
    return res;
  }
  async set(items) {
    for (const [k, v] of Object.entries(items)) this.map.set(k, v);
  }
  async remove(keys) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) this.map.delete(k);
  }
  async clear() {
    this.map.clear();
  }
}

/**
 * Secure, namespaced, schema-validated storage wrapper for Hinterland extensions.
 */
export class SecureStorage {
  /**
   * @param {object} [options]
   * @param {string} [options.namespace='hinterland'] - Namespace prefix
   * @param {string} [options.encryptionKey] - Secret passphrase for AES-GCM encrypted entries
   * @param {'local'|'session'|'memory'} [options.area='local'] - Storage area
   */
  constructor(options = {}) {
    this.namespace = options.namespace || 'hinterland';
    this.encryptionKey = options.encryptionKey || null;
    this.prefix = `_ht_${this.namespace}_`;

    if (options.area === 'memory' || typeof chrome === 'undefined' || !chrome.storage) {
      this.backend = new MemoryStorageBackend();
    } else {
      this.backend = options.area === 'session' && chrome.storage.session
        ? chrome.storage.session
        : chrome.storage.local;
    }
  }

  _key(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * Retrieves a stored value.
   *
   * @param {string} key - Storage key
   * @param {*} [fallback=null] - Default fallback value
   * @returns {Promise<*>} Stored value or fallback
   */
  async get(key, fallback = null) {
    const prefixed = this._key(key);
    const data = await this.backend.get(prefixed);
    const item = data[prefixed];

    if (item === undefined || item === null) return fallback;

    // Handle encrypted data
    if (typeof item === 'object' && item.__encrypted && this.encryptionKey) {
      try {
        const decryptedJson = await decryptData(item.payload, this.encryptionKey);
        return JSON.parse(decryptedJson);
      } catch (err) {
        console.warn(`[SecureStorage] Failed to decrypt key "${key}":`, err.message);
        return fallback;
      }
    }

    return item;
  }

  /**
   * Stores a value safely with optional AES-GCM encryption.
   *
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   * @param {object} [options]
   * @param {boolean} [options.encrypt=false] - Force AES-GCM encryption for this entry
   * @returns {Promise<void>}
   */
  async set(key, value, options = {}) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('Storage key must be a non-empty string.');
    }

    // Prevent Prototype Pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error('Forbidden storage key: Prototype pollution attempt detected.');
    }

    const prefixed = this._key(key);
    let payloadToStore = value;

    if ((options.encrypt || this.encryptionKey) && value !== undefined) {
      if (!this.encryptionKey) {
        throw new Error('Encryption requested but no encryptionKey was provided in SecureStorage configuration.');
      }
      const serialized = JSON.stringify(value);
      const encrypted = await encryptData(serialized, this.encryptionKey);
      payloadToStore = { __encrypted: true, payload: encrypted };
    }

    await this.backend.set({ [prefixed]: payloadToStore });
  }

  /**
   * Removes a key from storage.
   *
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async remove(key) {
    await this.backend.remove(this._key(key));
  }

  /**
   * Clears all storage keys under this extension's namespace.
   *
   * @returns {Promise<void>}
   */
  async clear() {
    if (this.backend instanceof MemoryStorageBackend) {
      await this.backend.clear();
      return;
    }
    const all = await this.backend.get(null);
    const keysToRemove = Object.keys(all).filter((k) => k.startsWith(this.prefix));
    if (keysToRemove.length > 0) {
      await this.backend.remove(keysToRemove);
    }
  }
}

/**
 * Factory helper for creating an isolated SecureStorage instance.
 *
 * @param {object} [options]
 * @returns {SecureStorage}
 */
export function createSecureStorage(options = {}) {
  return new SecureStorage(options);
}
