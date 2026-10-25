/**
 * @fileoverview Hinterland Pass - Background Service Worker
 * Manages encrypted vault storage, memory sessions, auto-lock timer, and IPC message routing.
 */

import {
  encryptVault,
  decryptVault,
  verifyMasterPassword,
  generatePassword,
  calculateStrength,
  normalizeDomain,
} from './crypto.js';

const STORAGE_VAULT_KEY = 'hp_vault_data';
const STORAGE_SETTINGS_KEY = 'hp_user_settings';

const DEFAULT_SETTINGS = {
  autoLockMinutes: 15,
  autofillEnabled: true,
  savePromptEnabled: true,
  neverDomains: [],
};

// In-memory unlocked session state (wiped on lock or reload)
let cachedMasterPassword = null;
let cachedVaultItems = null;
let autoLockTimeoutId = null;

/**
 * Resets or starts the inactivity auto-lock timer.
 */
async function touchActivity() {
  if (autoLockTimeoutId) {
    clearTimeout(autoLockTimeoutId);
    autoLockTimeoutId = null;
  }

  if (!cachedMasterPassword) return;

  const settings = await getSettings();
  const minutes = typeof settings.autoLockMinutes === 'number' ? settings.autoLockMinutes : 15;
  if (minutes > 0) {
    autoLockTimeoutId = setTimeout(() => {
      lockVault();
    }, minutes * 60 * 1000);
  }
}

/**
 * Locks the vault and wipes sensitive memory.
 */
function lockVault() {
  cachedMasterPassword = null;
  cachedVaultItems = null;
  if (autoLockTimeoutId) {
    clearTimeout(autoLockTimeoutId);
    autoLockTimeoutId = null;
  }
  updateBadgeForActiveTab().catch(() => {});
}

/**
 * Retrieves user settings from storage.
 */
async function getSettings() {
  const data = await chrome.storage.local.get(STORAGE_SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[STORAGE_SETTINGS_KEY] || {}) };
}

/**
 * Saves user settings to storage.
 */
async function saveSettings(patch) {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: updated });
  await touchActivity();
  return updated;
}

/**
 * Retrieves the raw encrypted vault package.
 */
async function getEncryptedPackage() {
  const data = await chrome.storage.local.get(STORAGE_VAULT_KEY);
  return data[STORAGE_VAULT_KEY] || null;
}

/**
 * Persists the current in-memory vault to encrypted storage.
 */
async function persistVault() {
  if (!cachedMasterPassword || !Array.isArray(cachedVaultItems)) {
    throw new Error('Vault is not unlocked; cannot persist.');
  }
  const encryptedPkg = await encryptVault(cachedVaultItems, cachedMasterPassword);
  await chrome.storage.local.set({ [STORAGE_VAULT_KEY]: encryptedPkg });
  await touchActivity();
}

/**
 * Updates browser action badge with count of matching logins for the active tab.
 */
async function updateBadgeForActiveTab() {
  if (typeof chrome === 'undefined' || !chrome.action?.setBadgeText) return;

  try {
    const tabs = await chrome.tabs.query({});
    const activeTab = tabs[0];
    if (!activeTab?.url) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    if (!cachedMasterPassword || !Array.isArray(cachedVaultItems)) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    const domain = normalizeDomain(activeTab.url);
    if (!domain) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    const matches = cachedVaultItems.filter((item) => normalizeDomain(item.domain || item.url) === domain);
    if (matches.length > 0) {
      await chrome.action.setBadgeText({ text: String(matches.length) });
      await chrome.action.setBadgeBackgroundColor({ color: '#388bfd' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    // Tab querying may be unavailable in some window states
  }
}

// Lifecycle listeners
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Hinterland Pass] Installed:', details.reason);
  const settings = await getSettings();
  await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: settings });
});

if (chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    updateBadgeForActiveTab().catch(() => {});
  });
}

if (chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      updateBadgeForActiveTab().catch(() => {});
    }
  });
}

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  const { type, payload } = message;

  (async () => {
    try {
      switch (type) {
        case 'HP_GET_STATUS': {
          const pkg = await getEncryptedPackage();
          const settings = await getSettings();
          const isInitialized = Boolean(pkg?.ciphertext);
          const isUnlocked = Boolean(cachedMasterPassword && Array.isArray(cachedVaultItems));

          let activeTabDomain = '';
          try {
            const tabs = await chrome.tabs.query({});
            if (tabs[0]?.url) activeTabDomain = normalizeDomain(tabs[0].url);
          } catch {
            // Ignore tab lookup error
          }

          sendResponse({
            ok: true,
            status: {
              isInitialized,
              isUnlocked,
              autoLockMinutes: settings.autoLockMinutes,
              vaultCount: isUnlocked ? cachedVaultItems.length : 0,
              activeTabDomain,
              settings,
            },
          });
          break;
        }

        case 'HP_SETUP_MASTER_PASSWORD': {
          const { masterPassword } = payload || {};
          if (!masterPassword || typeof masterPassword !== 'string' || masterPassword.length < 8) {
            throw new Error('Master password must be at least 8 characters long.');
          }

          cachedMasterPassword = masterPassword;
          cachedVaultItems = [];
          await persistVault();
          sendResponse({ ok: true, vaultCount: 0 });
          break;
        }

        case 'HP_UNLOCK': {
          const { masterPassword } = payload || {};
          if (!masterPassword || typeof masterPassword !== 'string') {
            throw new Error('Master password is required.');
          }

          const pkg = await getEncryptedPackage();
          if (!pkg) {
            throw new Error('Vault has not been initialized yet.');
          }

          const isValid = await verifyMasterPassword(pkg, masterPassword);
          if (!isValid) {
            sendResponse({ ok: false, error: 'Incorrect master password. Please try again.' });
            return;
          }

          cachedMasterPassword = masterPassword;
          cachedVaultItems = await decryptVault(pkg, masterPassword);
          await touchActivity();
          await updateBadgeForActiveTab();

          sendResponse({ ok: true, vaultCount: cachedVaultItems.length });
          break;
        }

        case 'HP_LOCK': {
          lockVault();
          sendResponse({ ok: true });
          break;
        }

        case 'HP_CHANGE_MASTER_PASSWORD': {
          const { currentPassword, newPassword } = payload || {};
          if (!currentPassword || !newPassword || newPassword.length < 8) {
            throw new Error('New master password must be at least 8 characters long.');
          }

          const pkg = await getEncryptedPackage();
          const isValid = await verifyMasterPassword(pkg, currentPassword);
          if (!isValid) {
            throw new Error('Current master password does not match.');
          }

          const items = cachedVaultItems || (await decryptVault(pkg, currentPassword));
          cachedMasterPassword = newPassword;
          cachedVaultItems = items;
          await persistVault();
          sendResponse({ ok: true });
          break;
        }

        case 'HP_GET_LOGINS_FOR_URL': {
          const urlOrHost = payload?.url || payload?.domain || sender?.tab?.url;
          const domain = normalizeDomain(urlOrHost);

          if (!cachedMasterPassword || !Array.isArray(cachedVaultItems)) {
            sendResponse({ ok: true, locked: true, domain, logins: [] });
            return;
          }

          await touchActivity();
          const matches = cachedVaultItems.filter((item) => {
            const itemDomain = normalizeDomain(item.domain || item.url);
            return itemDomain === domain;
          });

          sendResponse({
            ok: true,
            locked: false,
            domain,
            logins: matches,
          });
          break;
        }

        case 'HP_GET_ALL_LOGINS': {
          if (!cachedMasterPassword || !Array.isArray(cachedVaultItems)) {
            sendResponse({ ok: false, locked: true, error: 'Vault is locked.' });
            return;
          }

          await touchActivity();
          const query = (payload?.query || '').trim().toLowerCase();
          let results = [...cachedVaultItems];

          if (query) {
            results = results.filter((item) => {
              const title = (item.title || '').toLowerCase();
              const domain = (item.domain || '').toLowerCase();
              const username = (item.username || '').toLowerCase();
              const notes = (item.notes || '').toLowerCase();
              return title.includes(query) || domain.includes(query) || username.includes(query) || notes.includes(query);
            });
          }

          // Sort favorites first, then by title
          results.sort((a, b) => {
            if (Boolean(a.favorite) !== Boolean(b.favorite)) {
              return a.favorite ? -1 : 1;
            }
            return (a.title || a.domain || '').localeCompare(b.title || b.domain || '');
          });

          sendResponse({ ok: true, logins: results });
          break;
        }

        case 'HP_SAVE_LOGIN': {
          if (!cachedMasterPassword || !Array.isArray(cachedVaultItems)) {
            sendResponse({ ok: false, locked: true, error: 'Vault must be unlocked to save credentials.' });
            return;
          }

          const itemData = payload || {};
          const domain = normalizeDomain(itemData.domain || itemData.url);
          if (!domain && !itemData.title) {
            throw new Error('Domain or title is required.');
          }

          const id = itemData.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const now = Date.now();

          const entry = {
            id,
            title: (itemData.title || domain).trim(),
            domain,
            url: (itemData.url || (domain ? `https://${domain}` : '')).trim(),
            username: (itemData.username || '').trim(),
            password: itemData.password || '',
            notes: (itemData.notes || '').trim(),
            favorite: Boolean(itemData.favorite),
            createdAt: itemData.createdAt || now,
            updatedAt: now,
          };

          const existingIndex = cachedVaultItems.findIndex((it) => it.id === id);
          if (existingIndex >= 0) {
            cachedVaultItems[existingIndex] = { ...cachedVaultItems[existingIndex], ...entry };
          } else {
            // Check if matching domain and username exists to avoid clutter
            const dupIndex = cachedVaultItems.findIndex(
              (it) => it.domain === domain && it.username === entry.username,
            );
            if (dupIndex >= 0) {
              cachedVaultItems[dupIndex] = { ...cachedVaultItems[dupIndex], ...entry };
            } else {
              cachedVaultItems.push(entry);
            }
          }

          await persistVault();
          await updateBadgeForActiveTab();
          sendResponse({ ok: true, item: entry });
          break;
        }

        case 'HP_DELETE_LOGIN': {
          if (!cachedMasterPassword || !Array.isArray(cachedVaultItems)) {
            sendResponse({ ok: false, locked: true, error: 'Vault is locked.' });
            return;
          }

          const id = payload?.id;
          if (!id) throw new Error('Item ID is required.');

          cachedVaultItems = cachedVaultItems.filter((it) => it.id !== id);
          await persistVault();
          await updateBadgeForActiveTab();
          sendResponse({ ok: true });
          break;
        }

        case 'HP_GENERATE_PASSWORD': {
          const pwd = generatePassword(payload || {});
          const strength = calculateStrength(pwd);
          sendResponse({ ok: true, password: pwd, strength });
          break;
        }

        case 'HP_AUTOFILL_ACTIVE_TAB': {
          const { username, password, tabId: passedTabId } = payload || {};
          let targetTabId = passedTabId;
          if (!targetTabId) {
            try {
              const tabs = await chrome.tabs.query({});
              targetTabId = tabs[0]?.id;
            } catch {}
          }
          if (!targetTabId) {
            throw new Error('No active tab found.');
          }

          await chrome.tabs.sendMessage(targetTabId, {
            type: 'HP_DO_AUTOFILL',
            payload: { username, password },
          });

          sendResponse({ ok: true });
          break;
        }

        case 'HP_NEVER_SAVE_DOMAIN': {
          const domain = normalizeDomain(payload?.domain);
          if (domain) {
            const settings = await getSettings();
            const neverList = new Set(settings.neverDomains || []);
            neverList.add(domain);
            await saveSettings({ neverDomains: [...neverList] });
          }
          sendResponse({ ok: true });
          break;
        }

        case 'HP_EXPORT_VAULT': {
          if (!cachedMasterPassword || !Array.isArray(cachedVaultItems)) {
            sendResponse({ ok: false, locked: true, error: 'Vault is locked.' });
            return;
          }
          await touchActivity();
          const exportPayload = {
            format: 'hinterland-pass-export-v1',
            exportedAt: new Date().toISOString(),
            count: cachedVaultItems.length,
            items: cachedVaultItems,
          };
          sendResponse({ ok: true, data: exportPayload });
          break;
        }

        case 'HP_IMPORT_VAULT': {
          if (!cachedMasterPassword || !Array.isArray(cachedVaultItems)) {
            sendResponse({ ok: false, locked: true, error: 'Vault is locked.' });
            return;
          }

          const rawItems = Array.isArray(payload?.items) ? payload.items : [];
          let importedCount = 0;

          for (const item of rawItems) {
            if (!item || typeof item !== 'object') continue;
            const domain = normalizeDomain(item.domain || item.url || item.title);
            if (!domain && !item.title) continue;

            const existing = cachedVaultItems.find(
              (it) => it.domain === domain && it.username === (item.username || ''),
            );

            if (existing) {
              existing.password = item.password || existing.password;
              existing.notes = item.notes || existing.notes;
              existing.updatedAt = Date.now();
            } else {
              cachedVaultItems.push({
                id: item.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                title: item.title || domain,
                domain,
                url: item.url || (domain ? `https://${domain}` : ''),
                username: item.username || '',
                password: item.password || '',
                notes: item.notes || '',
                favorite: Boolean(item.favorite),
                createdAt: item.createdAt || Date.now(),
                updatedAt: Date.now(),
              });
              importedCount++;
            }
          }

          await persistVault();
          await updateBadgeForActiveTab();
          sendResponse({ ok: true, importedCount, totalCount: cachedVaultItems.length });
          break;
        }

        case 'HP_UPDATE_SETTINGS': {
          const updated = await saveSettings(payload || {});
          sendResponse({ ok: true, settings: updated });
          break;
        }

        default:
          sendResponse({ ok: false, error: `Unknown message type: ${type}` });
          break;
      }
    } catch (err) {
      console.warn('[Hinterland Pass] Request error:', err);
      sendResponse({ ok: false, error: err?.message || 'Internal error' });
    }
  })();

  return true; // Keep asynchronous message channel open
});
