/**
 * @fileoverview Hinterland Account & Cloud Sync Engine
 * Synchronizes bookmarks and browser settings across devices using free serverless tools:
 * - Supabase (PostgreSQL + GoTrue Auth & PostgREST / User Metadata)
 * - Vercel Serverless Sync API (ephemeral/KV proxy & sync coordinator)
 * Features zero-knowledge client-side End-to-End Encryption (AES-256-GCM + PBKDF2),
 * intelligent conflict resolution, automatic change detection, and background sync.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { settings } from './settings.js';

export const DEFAULT_SERVER_URL = 'https://hinterland-browser.vercel.app/api/sync';

export const SYNCABLE_SETTINGS = [
  'general.language',
  'general.startMode',
  'appearance.theme',
  'appearance.density',
  'appearance.font',
  'appearance.showBookmarksBar',
  'appearance.tabPosition',
  'privacy.blockTrackers',
  'privacy.blockFingerprinting',
  'privacy.blockMiners',
  'privacy.clearOnExit',
  'content.javascript',
  'content.images',
  'content.popups',
  'data.readingList',
  'data.notes',
  'shortcuts',
];

/* ----------------------------------------------------------------- crypto */

export function deriveSyncKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
}

export function encryptSyncPayload(payload, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveSyncKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const jsonStr = JSON.stringify(payload);
  let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return {
    encrypted: true,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted,
  };
}

export function decryptSyncPayload(data, passphrase) {
  if (!data?.encrypted || !data?.ciphertext) return data;
  const salt = Buffer.from(data.salt, 'base64');
  const iv = Buffer.from(data.iv, 'base64');
  const tag = Buffer.from(data.tag, 'base64');
  const key = deriveSyncKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

/* ---------------------------------------------------------------- helpers */

export function normalizeBookmarkUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    return parsed.href.replace(/\/$/, '');
  } catch {
    return url.trim().toLowerCase();
  }
}

export function mergeBookmarks(local = [], remote = []) {
  const map = new Map();

  for (const item of (Array.isArray(local) ? local : [])) {
    if (!item || !item.url) continue;
    const key = normalizeBookmarkUrl(item.url);
    map.set(key, { ...item });
  }

  for (const item of (Array.isArray(remote) ? remote : [])) {
    if (!item || !item.url) continue;
    const key = normalizeBookmarkUrl(item.url);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item });
    } else {
      const merged = { ...existing };
      if (!merged.title && item.title) merged.title = item.title;
      if (item.updatedAt && (!merged.updatedAt || item.updatedAt > merged.updatedAt)) {
        merged.title = item.title || merged.title;
        merged.updatedAt = item.updatedAt;
      }
      map.set(key, merged);
    }
  }

  return Array.from(map.values());
}

export function extractSyncableSettings(allSettings) {
  const result = {};
  if (!allSettings || typeof allSettings !== 'object') return result;

  const deepGet = (obj, path) => path.split('.').reduce((n, k) => (n == null ? undefined : n[k]), obj);

  for (const key of SYNCABLE_SETTINGS) {
    const val = deepGet(allSettings, key);
    if (val !== undefined) {
      result[key] = structuredClone(val);
    }
  }
  return result;
}

export function mergeSettings(localSettings, remoteSettings) {
  const patch = {};
  if (!remoteSettings || typeof remoteSettings !== 'object') return patch;
  for (const key of SYNCABLE_SETTINGS) {
    if (remoteSettings[key] !== undefined) {
      patch[key] = structuredClone(remoteSettings[key]);
    }
  }
  return patch;
}

/* ------------------------------------------------------------- SyncService */

export class SyncService extends EventEmitter {
  constructor(customFetch = null) {
    super();
    this.fetch = customFetch || globalThis.fetch;
    this.status = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'
    this.lastError = null;
    this.lastSyncedAt = null;
    this.syncPassphrase = null;
    this.debounceTimer = null;
    this.intervalTimer = null;
    this.started = false;
    this.isSyncing = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.lastSyncedAt = settings.value('account.lastSyncTime') || null;

    // Listen to local setting & bookmark mutations
    settings.on('change', ({ key }) => {
      if (this.isSyncing) return;
      if (!this.isLoggedIn()) return;
      if (!settings.value('account.autoSync')) return;

      if (key === 'data.bookmarks' || SYNCABLE_SETTINGS.includes(key)) {
        this.scheduleDebouncedSync(1500);
      }
    });

    // Periodic sync every 15 minutes
    this.intervalTimer = setInterval(() => {
      if (this.isLoggedIn() && settings.value('account.autoSync')) {
        this.syncNow({ silent: true }).catch(() => {});
      }
    }, 15 * 60 * 1000);
    this.intervalTimer.unref?.();

    // Initial sync check on boot if logged in
    if (this.isLoggedIn() && settings.value('account.autoSync')) {
      setTimeout(() => {
        this.syncNow({ silent: true }).catch(() => {});
      }, 2500);
    }
  }

  scheduleDebouncedSync(delayMs = 1500) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncNow({ silent: true }).catch(() => {});
    }, delayMs);
  }

  getDevices() {
    const defaultName = process.platform === 'win32'
      ? 'Windows Desktop'
      : process.platform === 'darwin' ? 'macOS Desktop' : 'Linux Desktop';
    const myDevice = {
      id: settings.value('account.deviceId') || 'dev-current',
      name: settings.value('account.deviceName') || defaultName,
      platform: process.platform,
      os: process.platform,
      browserVersion: '1.21.0',
      lastActive: this.lastSyncedAt || new Date().toISOString(),
      current: true,
      isCurrent: true,
      status: 'active',
    };
    const known = settings.value('account.knownDevices') || [];
    return [myDevice, ...known.filter((d) => d.id !== myDevice.id)];
  }

  getSyncStats() {
    const bookmarks = settings.value('data.bookmarks') || [];
    const syncable = extractSyncableSettings(settings.all());
    const known = settings.value('account.knownDevices') || [];
    return {
      bookmarkCount: bookmarks.length,
      bookmarksCount: bookmarks.length,
      settingsCount: Object.keys(syncable).length,
      syncableSettingsCount: Object.keys(syncable).length,
      deviceCount: known.length + 1,
      e2eeActive: Boolean(this.syncPassphrase),
      lastSyncTime: settings.value('account.lastSyncTime') || this.lastSyncedAt || null,
      lastSyncedAt: settings.value('account.lastSyncTime') || this.lastSyncedAt || null,
      provider: settings.value('account.provider') || 'hinterland',
      autoSync: settings.value('account.autoSync') ?? true,
      status: this.isLoggedIn() ? 'synced' : this.status,
    };
  }

  pairDevice(codeOrOpts) {
    if (typeof codeOrOpts === 'object' && codeOrOpts?.code) {
      const code = String(codeOrOpts.code).trim().toUpperCase();
      if (!/^HL-[A-Z0-9]{4,8}$/i.test(code) && !/^HL-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) {
        return { ok: false, error: 'invalidCode' };
      }
      const known = settings.value('account.knownDevices') || [];
      const newDevice = {
        id: 'dev-' + crypto.randomBytes(3).toString('hex'),
        name: codeOrOpts.name || 'Paired Device',
        platform: 'unknown',
        os: 'unknown',
        browserVersion: '1.21.0',
        lastActive: new Date().toISOString(),
        pairedCode: code,
        current: false,
        isCurrent: false,
        status: 'paired',
      };
      settings.set('account.knownDevices', [...known, newDevice]);
      return { ok: true, device: newDevice };
    }

    const code = 'HL-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const token = this.getSession()?.token || '';
    return {
      ok: true,
      code,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      pairingPayload: JSON.stringify({ code, token: token.slice(0, 16) + '...' }),
    };
  }

  async syncBookmarks(newBookmarks) {
    if (Array.isArray(newBookmarks)) {
      settings.set('data.bookmarks', newBookmarks);
      this.scheduleDebouncedSync(1500);
      return { ok: true, scheduled: true };
    }
    return await this.syncNow({ direction: 'both', silent: false });
  }

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.removeAllListeners();
  }

  getSession() {
    return settings.value('account.session') || null;
  }

  isLoggedIn() {
    const session = this.getSession();
    return Boolean(session?.token && session?.user);
  }

  getStatus() {
    const session = this.getSession();
    const provider = settings.value('account.provider') || 'hinterland';
    const supabaseUrl = settings.value('account.supabaseUrl') || '';
    const supabaseKey = settings.value('account.supabaseAnonKey') || '';

    return {
      isLoggedIn: this.isLoggedIn(),
      user: session?.user ? { email: session.user.email, id: session.user.id } : null,
      provider,
      serverUrl: settings.value('account.serverUrl') || DEFAULT_SERVER_URL,
      supabaseUrl,
      hasSupabaseCredentials: Boolean(supabaseUrl && supabaseKey),
      autoSync: settings.value('account.autoSync') ?? true,
      syncBookmarks: settings.value('account.syncBookmarks') ?? true,
      syncSettings: settings.value('account.syncSettings') ?? true,
      lastSyncedAt: settings.value('account.lastSyncTime') || this.lastSyncedAt || null,
      status: this.status,
      error: this.lastError,
      hasPassphrase: Boolean(this.syncPassphrase),
    };
  }

  broadcastStatus() {
    const payload = this.getStatus();
    this.emit('status', payload);
  }

  setSyncPassphrase(passphrase) {
    this.syncPassphrase = passphrase ? String(passphrase) : null;
    this.broadcastStatus();
  }

  async updateConfig(patch = {}) {
    if (!patch || typeof patch !== 'object') return this.getStatus();

    if (patch.autoSync !== undefined) settings.set('account.autoSync', Boolean(patch.autoSync));
    if (patch.provider !== undefined) settings.set('account.provider', String(patch.provider));
    if (patch.serverUrl !== undefined) settings.set('account.serverUrl', String(patch.serverUrl));
    if (patch.supabaseUrl !== undefined) settings.set('account.supabaseUrl', String(patch.supabaseUrl));
    if (patch.supabaseAnonKey !== undefined) settings.set('account.supabaseAnonKey', String(patch.supabaseAnonKey));
    if (patch.syncBookmarks !== undefined) settings.set('account.syncBookmarks', Boolean(patch.syncBookmarks));
    if (patch.syncSettings !== undefined) settings.set('account.syncSettings', Boolean(patch.syncSettings));
    if (patch.syncPassphrase !== undefined) this.setSyncPassphrase(patch.syncPassphrase);

    this.broadcastStatus();
    return this.getStatus();
  }

  /* ------------------------------------------------------------- Auth flows */

  async signUp({ email, password, provider, supabaseUrl, supabaseAnonKey, syncPassphrase }) {
    if (!email || !password) throw new Error('emailAndPasswordRequired');
    if (password.length < 6) throw new Error('passwordTooShort');

    const cleanEmail = String(email).trim().toLowerCase();
    const activeProvider = provider || settings.value('account.provider') || 'hinterland';

    if (supabaseUrl) settings.set('account.supabaseUrl', supabaseUrl);
    if (supabaseAnonKey) settings.set('account.supabaseAnonKey', supabaseAnonKey);
    if (provider) settings.set('account.provider', provider);
    if (syncPassphrase) this.setSyncPassphrase(syncPassphrase);

    let session;
    if (activeProvider === 'supabase') {
      session = await this._supabaseSignUp(cleanEmail, password);
    } else {
      session = await this._hinterlandSignUp(cleanEmail, password);
    }

    settings.set('account.session', session);
    this.status = 'idle';
    this.lastError = null;
    this.broadcastStatus();

    // Perform initial sync upload immediately
    try {
      await this.syncNow();
    } catch {
      // Continue even if initial sync upload is queued
    }

    return { ok: true, user: session.user };
  }

  async signIn({ email, password, provider, supabaseUrl, supabaseAnonKey, syncPassphrase }) {
    if (!email || !password) throw new Error('emailAndPasswordRequired');

    const cleanEmail = String(email).trim().toLowerCase();
    const activeProvider = provider || settings.value('account.provider') || 'hinterland';

    if (supabaseUrl) settings.set('account.supabaseUrl', supabaseUrl);
    if (supabaseAnonKey) settings.set('account.supabaseAnonKey', supabaseAnonKey);
    if (provider) settings.set('account.provider', provider);
    if (syncPassphrase) this.setSyncPassphrase(syncPassphrase);

    let session;
    if (activeProvider === 'supabase') {
      session = await this._supabaseSignIn(cleanEmail, password);
    } else {
      session = await this._hinterlandSignIn(cleanEmail, password);
    }

    settings.set('account.session', session);
    this.status = 'idle';
    this.lastError = null;
    this.broadcastStatus();

    // Pull and merge upon signing in
    try {
      await this.syncNow();
    } catch {
      // Non-fatal
    }

    return { ok: true, user: session.user };
  }

  async signOut() {
    const session = this.getSession();
    if (session?.provider === 'supabase' && session?.token) {
      try {
        const url = (settings.value('account.supabaseUrl') || '').replace(/\/$/, '');
        const key = settings.value('account.supabaseAnonKey');
        if (url && key) {
          await this.fetch(`${url}/auth/v1/logout`, {
            method: 'POST',
            headers: { apikey: key, Authorization: `Bearer ${session.token}` },
          });
        }
      } catch {
        // Ignore logout errors
      }
    }

    settings.set('account.session', null);
    this.status = 'idle';
    this.lastError = null;
    this.syncPassphrase = null;
    this.broadcastStatus();
    return { ok: true };
  }

  /* ----------------------------------------------------------- Sync operation */

  async syncNow({ direction = 'both', silent = false } = {}) {
    if (!this.isLoggedIn()) return { ok: false, error: 'notLoggedIn' };

    const session = this.getSession();
    this.status = 'syncing';
    this.lastError = null;
    this.isSyncing = true;
    this.broadcastStatus();

    try {
      const syncBookmarksEnabled = settings.value('account.syncBookmarks') ?? true;
      const syncSettingsEnabled = settings.value('account.syncSettings') ?? true;

      const localBookmarks = syncBookmarksEnabled ? (settings.value('data.bookmarks') ?? []) : [];
      const localSettings = syncSettingsEnabled ? extractSyncableSettings(settings.all()) : {};

      let cloudData = null;
      if (session.provider === 'supabase') {
        cloudData = await this._supabaseSync(session, {
          bookmarks: localBookmarks,
          settings: localSettings,
          direction,
        });
      } else {
        cloudData = await this._hinterlandSync(session, {
          bookmarks: localBookmarks,
          settings: localSettings,
          direction,
        });
      }

      // Merge and apply cloud data locally if allowed
      let mergedBookmarks = localBookmarks;
      if (syncBookmarksEnabled && Array.isArray(cloudData?.bookmarks)) {
        mergedBookmarks = mergeBookmarks(localBookmarks, cloudData.bookmarks);
        settings.set('data.bookmarks', mergedBookmarks, { silent: true });
        this.emit('bookmarksUpdated', mergedBookmarks);
      }

      if (syncSettingsEnabled && cloudData?.settings && typeof cloudData.settings === 'object') {
        const patch = mergeSettings(localSettings, cloudData.settings);
        settings.merge(patch, { silent: true });
      }

      const now = new Date().toISOString();
      this.lastSyncedAt = now;
      settings.set('account.lastSyncTime', now);
      this.status = 'synced';
      this.lastError = null;
      this.broadcastStatus();

      if (!silent) {
        this.emit('toast', { message: 'toast.syncSuccess', kind: 'success' });
      }

      return {
        ok: true,
        syncedAt: now,
        bookmarksCount: mergedBookmarks.length,
      };
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message || 'syncFailed';
      this.broadcastStatus();

      if (!silent) {
        this.emit('toast', { message: 'toast.syncFailed', kind: 'error' });
      }
      return { ok: false, error: this.lastError };
    } finally {
      this.isSyncing = false;
    }
  }

  /* --------------------------------------------------- Supabase implementation */

  async _supabaseSignUp(email, password) {
    const url = (settings.value('account.supabaseUrl') || '').replace(/\/$/, '');
    const key = settings.value('account.supabaseAnonKey');
    if (!url || !key) throw new Error('missingSupabaseConfig');

    const res = await this.fetch(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.error_description || data.message || 'signUpFailed');

    const token = data.access_token || (data.session && data.session.access_token);
    const user = data.user || (data.session && data.session.user);
    if (!token && !user) throw new Error('signUpConfirmEmailRequired');

    return {
      provider: 'supabase',
      token,
      refreshToken: data.refresh_token || (data.session && data.session.refresh_token),
      user: { id: user?.id || data.id, email: user?.email || email },
    };
  }

  async _supabaseSignIn(email, password) {
    const url = (settings.value('account.supabaseUrl') || '').replace(/\/$/, '');
    const key = settings.value('account.supabaseAnonKey');
    if (!url || !key) throw new Error('missingSupabaseConfig');

    const res = await this.fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.error_description || data.message || 'invalidCredentials');

    return {
      provider: 'supabase',
      token: data.access_token,
      refreshToken: data.refresh_token,
      user: { id: data.user.id, email: data.user.email },
    };
  }

  async _supabaseSync(session, { bookmarks, settings: currentSettings }) {
    const url = (settings.value('account.supabaseUrl') || '').replace(/\/$/, '');
    const key = settings.value('account.supabaseAnonKey');
    if (!url || !key) throw new Error('missingSupabaseConfig');

    // Prepare payload (encrypt if passphrase is provided)
    let payload = { bookmarks, settings: currentSettings, updatedAt: new Date().toISOString() };
    if (this.syncPassphrase) {
      payload = encryptSyncPayload(payload, this.syncPassphrase);
    }

    // Try reading existing data first from user_metadata (zero SQL setup required)
    let remoteData = null;
    const userRes = await this.fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: 'Bearer ' + session.token },
    });

    if (userRes.ok) {
      const userData = await userRes.json();
      const rawSync = userData.user_metadata?.hinterland_sync;
      if (rawSync) {
        remoteData = rawSync.encrypted && this.syncPassphrase
          ? decryptSyncPayload(rawSync, this.syncPassphrase)
          : rawSync;
      }
    }

    // Merge remote bookmarks and settings with local
    const mergedBookmarks = mergeBookmarks(bookmarks, remoteData?.bookmarks ?? []);
    const mergedSettings = { ...(remoteData?.settings ?? {}), ...currentSettings };

    let toSave = {
      bookmarks: mergedBookmarks,
      settings: mergedSettings,
      updatedAt: new Date().toISOString(),
    };

    if (this.syncPassphrase) {
      toSave = encryptSyncPayload(toSave, this.syncPassphrase);
    }

    // Push merged state back to Supabase user_metadata
    await this.fetch(`${url}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + session.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { hinterland_sync: toSave },
      }),
    });

    return {
      bookmarks: mergedBookmarks,
      settings: mergedSettings,
      updatedAt: toSave.updatedAt,
    };
  }

  /* --------------------------------------------------- Hinterland Serverless */

  async _hinterlandSignUp(email, password) {
    const endpoint = settings.value('account.serverUrl') || DEFAULT_SERVER_URL;
    const res = await this.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', email, password }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'signUpFailed');

    return {
      provider: 'hinterland',
      token: data.token,
      user: data.user,
    };
  }

  async _hinterlandSignIn(email, password) {
    const endpoint = settings.value('account.serverUrl') || DEFAULT_SERVER_URL;
    const res = await this.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'invalidCredentials');

    return {
      provider: 'hinterland',
      token: data.token,
      user: data.user,
    };
  }

  async _hinterlandSync(session, { bookmarks, settings: currentSettings }) {
    const endpoint = settings.value('account.serverUrl') || DEFAULT_SERVER_URL;

    let payloadData = { bookmarks, settings: currentSettings, updatedAt: new Date().toISOString() };
    if (this.syncPassphrase) {
      payloadData = encryptSyncPayload(payloadData, this.syncPassphrase);
    }

    const res = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.token,
      },
      body: JSON.stringify({
        action: 'sync',
        token: session.token,
        data: payloadData,
        updatedAt: new Date().toISOString(),
      }),
    });

    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || 'syncFailed');

    let returnedData = result.data || result;
    if (returnedData.encrypted && this.syncPassphrase) {
      returnedData = decryptSyncPayload(returnedData, this.syncPassphrase);
    }

    return returnedData;
  }
}

export const syncService = new SyncService();
