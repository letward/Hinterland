/**
 * @fileoverview Hinterland Password Manager - Core Backend Service
 * Zero-knowledge encrypted vault using AES-256-GCM and PBKDF2 (100,000 iterations).
 * Manages vault state, in-memory unlocked credentials, inactivity auto-lock, and autofill.
 */

import { EventEmitter } from 'node:events';
import { settings } from './settings.js';
import {
  encryptVault,
  decryptVault,
  verifyMasterPassword,
  generatePassword,
  calculateStrength,
  normalizeDomain,
} from '../extensions/hinterlandPass/crypto.js';

const VAULT_SETTING_KEY = 'data.passwordsVault';
const SETTINGS_KEY = 'data.passwordsSettings';

const DEFAULT_SETTINGS = {
  autoLockMinutes: 15,
  autofillEnabled: true,
  savePromptEnabled: true,
  neverDomains: [],
};

export class PasswordManager extends EventEmitter {
  constructor() {
    super();
    this.cachedMasterPassword = null;
    this.cachedVaultItems = null;
    this.autoLockTimer = null;
    this.pendingPrompt = null;
  }

  /**
   * Resets or triggers the auto-lock timer based on user configuration.
   */
  touchActivity() {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    if (!this.cachedMasterPassword) return;

    const conf = this.getSettings();
    const minutes = typeof conf.autoLockMinutes === 'number' ? conf.autoLockMinutes : 15;
    if (minutes > 0) {
      this.autoLockTimer = setTimeout(() => {
        this.lock();
      }, minutes * 60 * 1000);
      if (typeof this.autoLockTimer?.unref === 'function') {
        this.autoLockTimer.unref();
      }
    }
  }

  /**
   * Locks the vault immediately, wiping sensitive keys from memory.
   */
  lock() {
    this.cachedMasterPassword = null;
    this.cachedVaultItems = null;
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
    this.emit('locked');
    return { ok: true, isUnlocked: false };
  }

  /**
   * Returns current settings.
   */
  getSettings() {
    const raw = settings.value(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  }

  /**
   * Saves updated settings.
   */
  async updateSettings(patch) {
    if (!patch || typeof patch !== 'object') return this.getSettings();
    const current = this.getSettings();
    const updated = { ...current };

    if (typeof patch.autoLockMinutes === 'number') {
      updated.autoLockMinutes = Math.max(0, Math.min(1440, patch.autoLockMinutes));
    }
    if (typeof patch.autofillEnabled === 'boolean') {
      updated.autofillEnabled = patch.autofillEnabled;
    }
    if (typeof patch.savePromptEnabled === 'boolean') {
      updated.savePromptEnabled = patch.savePromptEnabled;
    }
    if (Array.isArray(patch.neverDomains)) {
      updated.neverDomains = [...new Set(patch.neverDomains.map((d) => normalizeDomain(d)).filter(Boolean))];
    }

    await settings.set(SETTINGS_KEY, updated);
    this.touchActivity();
    return updated;
  }

  /**
   * Adds a domain to the never-save blacklist.
   */
  async neverSaveDomain(domain) {
    const normalized = normalizeDomain(domain);
    if (!normalized) return { ok: false };
    const conf = this.getSettings();
    const set = new Set(conf.neverDomains || []);
    set.add(normalized);
    await this.updateSettings({ neverDomains: [...set] });
    return { ok: true, neverDomains: [...set] };
  }

  /**
   * Returns true if the vault has been initialized with a master password.
   */
  isInitialized() {
    const pkg = settings.value(VAULT_SETTING_KEY);
    return Boolean(pkg?.ciphertext && pkg?.salt && pkg?.verification);
  }

  /**
   * Returns true if the vault is currently unlocked in memory.
   */
  isUnlocked() {
    return Boolean(this.cachedMasterPassword && Array.isArray(this.cachedVaultItems));
  }

  /**
   * Returns a high-level status summary for the UI.
   */
  getStatus(activeUrl = '') {
    const isInit = this.isInitialized();
    const isUnlock = this.isUnlocked();
    const conf = this.getSettings();
    const domain = normalizeDomain(activeUrl);

    let siteLoginsCount = 0;
    if (isUnlock && domain) {
      siteLoginsCount = this.cachedVaultItems.filter((i) => normalizeDomain(i.domain || i.url) === domain).length;
    }

    return {
      isInitialized: isInit,
      isUnlocked: isUnlock,
      autoLockMinutes: conf.autoLockMinutes,
      vaultCount: isUnlock ? this.cachedVaultItems.length : 0,
      activeTabDomain: domain,
      siteLoginsCount,
      neverDomain: conf.neverDomains.includes(domain),
      settings: conf,
    };
  }

  /**
   * Sets up the master password vault for the first time.
   */
  async setup(masterPassword) {
    if (!masterPassword || typeof masterPassword !== 'string' || masterPassword.length < 8) {
      throw new Error('Master password must be at least 8 characters long.');
    }

    this.cachedMasterPassword = masterPassword;
    this.cachedVaultItems = [];
    const encryptedPkg = await encryptVault([], masterPassword);
    await settings.set(VAULT_SETTING_KEY, encryptedPkg);
    this.touchActivity();
    this.emit('unlocked', { vaultCount: 0 });
    return { ok: true, isUnlocked: true, vaultCount: 0 };
  }

  /**
   * Unlocks the vault using the user's master password.
   */
  async unlock(masterPassword) {
    if (!masterPassword || typeof masterPassword !== 'string') {
      throw new Error('Master password is required.');
    }

    const pkg = settings.value(VAULT_SETTING_KEY);
    if (!pkg?.ciphertext) {
      throw new Error('Vault has not been initialized yet.');
    }

    const isValid = await verifyMasterPassword(pkg, masterPassword);
    if (!isValid) {
      return { ok: false, error: 'Incorrect master password. Please try again.' };
    }

    this.cachedMasterPassword = masterPassword;
    this.cachedVaultItems = await decryptVault(pkg, masterPassword);
    this.touchActivity();
    this.emit('unlocked', { vaultCount: this.cachedVaultItems.length });
    return { ok: true, isUnlocked: true, vaultCount: this.cachedVaultItems.length };
  }

  /**
   * Re-encrypts the vault with a new master password.
   */
  async changeMasterPassword(currentPassword, newPassword) {
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      throw new Error('New master password must be at least 8 characters long.');
    }

    const pkg = settings.value(VAULT_SETTING_KEY);
    if (!pkg) throw new Error('Vault not initialized.');

    const isValid = await verifyMasterPassword(pkg, currentPassword);
    if (!isValid) {
      throw new Error('Current master password does not match.');
    }

    const items = this.cachedVaultItems || (await decryptVault(pkg, currentPassword));
    this.cachedMasterPassword = newPassword;
    this.cachedVaultItems = items;

    const newEncryptedPkg = await encryptVault(items, newPassword);
    await settings.set(VAULT_SETTING_KEY, newEncryptedPkg);
    this.touchActivity();
    return { ok: true };
  }

  /**
   * Returns matching logins for a specific URL or domain.
   */
  getLoginsForUrl(urlOrDomain) {
    const domain = normalizeDomain(urlOrDomain);
    if (!this.isUnlocked()) {
      return { ok: true, locked: true, domain, logins: [] };
    }

    this.touchActivity();
    const logins = this.cachedVaultItems.filter((item) => normalizeDomain(item.domain || item.url) === domain);

    return {
      ok: true,
      locked: false,
      domain,
      logins: logins.map(sanitizeItem),
    };
  }

  /**
   * Returns all logins in the vault, with optional search query.
   */
  getAllLogins(searchQuery = '') {
    if (!this.isUnlocked()) {
      return { ok: false, locked: true, error: 'Vault is locked.' };
    }

    this.touchActivity();
    const query = String(searchQuery || '').trim().toLowerCase();
    let results = [...this.cachedVaultItems];

    if (query) {
      results = results.filter((item) => {
        const title = (item.title || '').toLowerCase();
        const domain = (item.domain || '').toLowerCase();
        const username = (item.username || '').toLowerCase();
        const notes = (item.notes || '').toLowerCase();
        return title.includes(query) || domain.includes(query) || username.includes(query) || notes.includes(query);
      });
    }

    results.sort((a, b) => {
      if (Boolean(a.favorite) !== Boolean(b.favorite)) {
        return a.favorite ? -1 : 1;
      }
      return (a.title || a.domain || '').localeCompare(b.title || b.domain || '');
    });

    return { ok: true, logins: results.map(sanitizeItem) };
  }

  /**
   * Saves or updates a login entry.
   */
  async saveLogin(itemData) {
    if (!this.isUnlocked()) {
      return { ok: false, locked: true, error: 'Vault must be unlocked to save passwords.' };
    }

    if (!itemData || typeof itemData !== 'object') {
      throw new Error('Invalid item data.');
    }

    const domain = normalizeDomain(itemData.domain || itemData.url);
    if (!domain && !itemData.title) {
      throw new Error('Domain or service title is required.');
    }

    const id = itemData.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const entry = {
      id,
      title: String(itemData.title || domain).trim(),
      domain,
      url: String(itemData.url || (domain ? `https://${domain}` : '')).trim(),
      username: String(itemData.username || '').trim(),
      password: String(itemData.password || ''),
      notes: String(itemData.notes || '').trim(),
      favorite: Boolean(itemData.favorite),
      createdAt: Number(itemData.createdAt) || now,
      updatedAt: now,
    };

    const existingIndex = this.cachedVaultItems.findIndex((it) => it.id === id);
    if (existingIndex >= 0) {
      this.cachedVaultItems[existingIndex] = { ...this.cachedVaultItems[existingIndex], ...entry };
    } else {
      // Check if matching domain and username exists to update instead of creating duplicate
      const dupIndex = this.cachedVaultItems.findIndex(
        (it) => it.domain === domain && it.username === entry.username,
      );
      if (dupIndex >= 0) {
        this.cachedVaultItems[dupIndex] = { ...this.cachedVaultItems[dupIndex], ...entry };
      } else {
        this.cachedVaultItems.push(entry);
      }
    }

    await this.persist();
    this.touchActivity();
    return { ok: true, item: sanitizeItem(entry) };
  }

  /**
   * Deletes a login entry by ID.
   */
  async deleteLogin(id) {
    if (!this.isUnlocked()) {
      return { ok: false, locked: true, error: 'Vault is locked.' };
    }

    if (!id) throw new Error('Item ID is required.');
    this.cachedVaultItems = this.cachedVaultItems.filter((it) => it.id !== id);
    await this.persist();
    this.touchActivity();
    return { ok: true };
  }

  /**
   * Persists the in-memory vault to encrypted storage.
   */
  async persist() {
    if (!this.cachedMasterPassword || !Array.isArray(this.cachedVaultItems)) {
      throw new Error('Cannot persist locked vault.');
    }
    const encryptedPkg = await encryptVault(this.cachedVaultItems, this.cachedMasterPassword);
    await settings.set(VAULT_SETTING_KEY, encryptedPkg);
  }

  /**
   * Generates a strong password with strength metrics.
   */
  generatePassword(options = {}) {
    const password = generatePassword(options);
    const strength = calculateStrength(password);
    return { ok: true, password, strength };
  }

  /**
   * Exports decrypted vault for JSON backup.
   */
  exportVault() {
    if (!this.isUnlocked()) {
      return { ok: false, locked: true, error: 'Vault is locked.' };
    }
    this.touchActivity();
    return {
      ok: true,
      data: {
        format: 'hinterland-pass-export-v1',
        exportedAt: new Date().toISOString(),
        count: this.cachedVaultItems.length,
        items: this.cachedVaultItems.map(sanitizeItem),
      },
    };
  }

  /**
   * Imports logins from JSON.
   */
  async importVault(rawItems) {
    if (!this.isUnlocked()) {
      return { ok: false, locked: true, error: 'Vault is locked.' };
    }

    const items = Array.isArray(rawItems) ? rawItems : [];
    let count = 0;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const domain = normalizeDomain(item.domain || item.url || item.title);
      if (!domain && !item.title) continue;

      const existing = this.cachedVaultItems.find(
        (it) => it.domain === domain && it.username === (item.username || ''),
      );

      if (existing) {
        existing.password = String(item.password || existing.password);
        existing.notes = String(item.notes || existing.notes);
        existing.updatedAt = Date.now();
      } else {
        this.cachedVaultItems.push({
          id: item.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title: String(item.title || domain).trim(),
          domain,
          url: String(item.url || (domain ? `https://${domain}` : '')).trim(),
          username: String(item.username || '').trim(),
          password: String(item.password || ''),
          notes: String(item.notes || '').trim(),
          favorite: Boolean(item.favorite),
          createdAt: Number(item.createdAt) || Date.now(),
          updatedAt: Date.now(),
        });
        count++;
      }
    }

    await this.persist();
    this.touchActivity();
    return { ok: true, importedCount: count, totalCount: this.cachedVaultItems.length };
  }

  /**
   * In-page autofill helper for the active tab.
   */
  async autofillTab(tab, { username, password }) {
    if (!tab?.contents || tab.contents.isDestroyed()) return false;
    try {
      const code = `
        (function() {
          function setVal(input, val) {
            if (!input || !val) return;
            input.focus();
            const proto = Object.getPrototypeOf(input);
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(input, val);
            else input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          }

          const pInp = document.querySelector('input[type="password"]');
          if (!pInp) return false;
          setVal(pInp, ${JSON.stringify(password || '')});

          let uInp = null;
          if (pInp.form) {
            const inputs = [...pInp.form.querySelectorAll('input')];
            const pIdx = inputs.indexOf(pInp);
            for (let i = pIdx - 1; i >= 0; i--) {
              const inp = inputs[i];
              if (inp.type === 'text' || inp.type === 'email' || inp.type === 'tel') {
                uInp = inp; break;
              }
            }
          }
          if (!uInp) {
            const all = [...document.querySelectorAll('input')];
            const pIdx = all.indexOf(pInp);
            for (let i = pIdx - 1; i >= Math.max(0, pIdx - 4); i--) {
              const inp = all[i];
              if (inp.type === 'text' || inp.type === 'email') {
                uInp = inp; break;
              }
            }
          }
          if (uInp && ${JSON.stringify(username || '')}) {
            setVal(uInp, ${JSON.stringify(username || '')});
          }
          return true;
        })();
      `;
      const result = await tab.contents.executeJavaScript(code);
      return Boolean(result);
    } catch {
      return false;
    }
  }
}

function sanitizeItem(item) {
  return {
    id: String(item.id),
    title: String(item.title || ''),
    domain: String(item.domain || ''),
    url: String(item.url || ''),
    username: String(item.username || ''),
    password: String(item.password || ''),
    notes: String(item.notes || ''),
    favorite: Boolean(item.favorite),
    createdAt: Number(item.createdAt) || 0,
    updatedAt: Number(item.updatedAt) || 0,
  };
}

export const passwords = new PasswordManager();
