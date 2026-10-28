/**
 * @fileoverview Hinterland Cloud Sync API - Vercel Serverless Endpoint
 * Encrypted bookmark/settings synchronization with conflict resolution.
 * Auth state is shared with /api/account via the shared _account.js module.
 *
 * Endpoints (POST with JSON body):
 *   { action: 'signup', email, password }        -> creates account (delegated to /api/account/register)
 *   { action: 'login', email, password }          -> login (delegated to /api/account/login)
 *   { action: 'pull', token }                     -> pull cloud sync data
 *   { action: 'push', token, data }               -> push sync data (merge)
 *   { action: 'sync', token, data }               -> two-way merge
 *   GET                                           -> service status
 */

const {
  HAS_SUPABASE, baseUrl,
  accountsById, sessionsByToken,
  verifyPasswordAccount, createSession, getSession, destroySession,
  resolveSupabaseUser, mapAccountToProfile,
} = require('./_account');

const crypto = require('node:crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Sync payload store: userId -> { bookmarks, settings, updatedAt, ... }
const syncDataByUser = new Map();

// Rate limiting
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_PER_WINDOW;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) if (now > e.reset) hits.delete(ip);
}, 5 * 60_000).unref?.();

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).json(payload);
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.href.replace(/\/+$/, '');
  } catch {
    return String(url || '').trim().toLowerCase();
  }
}

function mergeBookmarks(local = [], remote = []) {
  const map = new Map();
  for (const item of (Array.isArray(remote) ? remote : [])) {
    if (item && item.url) map.set(normalizeUrl(item.url), { ...item });
  }
  for (const item of (Array.isArray(local) ? local : [])) {
    if (!item || !item.url) continue;
    const key = normalizeUrl(item.url);
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

async function resolveUser(token) {
  if (!token) return null;
  if (HAS_SUPABASE) {
    const user = await resolveSupabaseUser(token);
    return user || null;
  }
  const s = getSession(token);
  if (!s) return null;
  return accountsById.get(s.id) || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return json(res, 429, { ok: false, error: 'Too many requests. Please try again later.' });
  }

  // GET status check
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'hinterland-sync',
      version: '1.21.0',
      provider: HAS_SUPABASE ? 'supabase-proxy' : 'serverless',
      time: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const body = req.body || {};
  const action = body.action || 'sync';

  // Extract auth token from header or body
  const authHeader = req.headers.authorization || '';
  const token = body.token || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

  /* --------------------------------------------------------------- signup */
  if (action === 'signup') {
    // Delegieren an den Account-Endpoint, damit Validierung + Verifizierung zentral sind
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const phone = String(body.phone || '').trim() || undefined;

    // Inline-Account-Erstellung (kein HTTP-Roundtrip nötig, gleiche Logik)
    const { createAccount, isEmail, isPhone } = require('./_account');
    if (!isEmail(email)) return json(res, 400, { ok: false, error: 'invalidEmail' });
    if (password.length < 8) return json(res, 400, { ok: false, error: 'passwordTooShort' });
    if (phone && !isPhone(phone)) return json(res, 400, { ok: false, error: 'invalidPhone' });

    let account;
    try {
      account = await createAccount({ email, password, phone });
    } catch (err) {
      const code = err.message;
      if (code === 'userAlreadyExists') return json(res, 409, { ok: false, error: 'userAlreadyExists' });
      if (code === 'invalidEmail' || code === 'passwordTooShort' || code === 'invalidPhone') {
        return json(res, 400, { ok: false, error: code });
      }
      return json(res, 500, { ok: false, error: 'registrationFailed' });
    }

    if (HAS_SUPABASE) {
      return json(res, 201, {
        ok: true,
        requiresEmailVerification: true,
        user: { id: account.id, email: account.email, emailVerified: false },
      });
    }

    const { createVerificationCode } = require('./_account');
    const code = createVerificationCode({ identifier: email, purpose: 'email', ttlMs: 10 * 60_000 });
    const tok = createSession(account);
    return json(res, 201, {
      ok: true,
      requiresEmailVerification: true,
      verificationCode: code,
      token: tok,
      user: mapAccountToProfile(account),
    });
  }

  /* ---------------------------------------------------------------- login */
  if (action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const totp = String(body.totp || '').trim();

    if (!isEmail_val(email) || !password) return json(res, 400, { ok: false, error: 'invalidCredentials' });

    let account;
    if (HAS_SUPABASE) {
      try {
        const resUp = await fetch(`${baseUrl()}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await resUp.json();
        if (!resUp.ok) return json(res, 401, { ok: false, error: 'invalidCredentials' });
        const supaUser = data.user || {};
        account = accountsById.get(supaUser.id) || {
          id: supaUser.id, email, emailVerified: !!supaUser.email_confirmed_at,
          phone: null, phoneVerified: false, totpSecret: null, createdAt: new Date().toISOString(),
        };
        return json(res, 200, {
          ok: true,
          token: data.access_token,
          requiresTotp: Boolean(account.totpSecret),
          user: mapAccountToProfile(account),
        });
      } catch {
        return json(res, 401, { ok: false, error: 'invalidCredentials' });
      }
    }

    account = await verifyPasswordAccount(email, password);
    if (!account) return json(res, 401, { ok: false, error: 'invalidCredentials' });

    account.lastSignIn = new Date().toISOString();

    if (account.totpSecret) {
      if (!totp || !totpVerify(account.totpSecret, totp)) {
        return json(res, 200, { ok: true, requiresTotp: true, email: account.email });
      }
    }

    const tok = createSession(account);
    return json(res, 200, {
      ok: true,
      token: tok,
      requiresTotp: false,
      user: mapAccountToProfile(account),
    });
  }

  /* ------------------------------------------------------- authenticated */
  if (!token) {
    return json(res, 401, { ok: false, error: 'unauthorized' });
  }

  const user = await resolveUser(token);
  if (!user) {
    return json(res, 401, { ok: false, error: 'sessionExpired' });
  }

  const userId = user.id;

  if (action === 'pull') {
    const stored = syncDataByUser.get(userId) || { bookmarks: [], settings: {}, updatedAt: null };
    return json(res, 200, { ok: true, data: stored, syncedAt: stored.updatedAt });
  }

  if (action === 'push') {
    const toSave = { ...body.data, updatedAt: new Date().toISOString() };
    syncDataByUser.set(userId, toSave);
    return json(res, 200, { ok: true, syncedAt: toSave.updatedAt });
  }

  // Default: two-way 'sync' merge
  const incoming = body.data || {};
  const current = syncDataByUser.get(userId);

  if (!current) {
    const initial = { ...incoming, updatedAt: new Date().toISOString() };
    syncDataByUser.set(userId, initial);
    return json(res, 200, { ok: true, data: initial, syncedAt: initial.updatedAt });
  }

  if (incoming.encrypted) {
    const encryptedSnapshot = { ...incoming, updatedAt: new Date().toISOString() };
    syncDataByUser.set(userId, encryptedSnapshot);
    return json(res, 200, { ok: true, data: encryptedSnapshot, syncedAt: encryptedSnapshot.updatedAt });
  }

  const mergedBookmarks = mergeBookmarks(incoming.bookmarks ?? [], current.bookmarks ?? []);
  const mergedSettings = { ...(current.settings ?? {}), ...(incoming.settings ?? {}) };
  const merged = { bookmarks: mergedBookmarks, settings: mergedSettings, updatedAt: new Date().toISOString() };
  syncDataByUser.set(userId, merged);
  return json(res, 200, { ok: true, data: merged, syncedAt: merged.updatedAt });
};

function isEmail_val(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function totpVerify(secret, token) {
  if (!secret || !/^\d{6}$/.test(String(token))) return false;
  const time = Math.floor(Date.now() / 1000 / 30);
  for (let i = -1; i <= 1; i++) {
    const t = Buffer.alloc(8);
    let v = time + i;
    for (let j = 7; j >= 0; j--) { t[j] = v & 0xff; v = Math.floor(v / 256); }
    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key).update(t).digest();
    const offset = hmac[19] & 0xf;
    const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
                   ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
    const expected = (binary % 1_000_000).toString().padStart(6, '0');
    if (expected === token) return true;
  }
  return false;
}

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = [];
  for (const ch of str.toUpperCase()) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(output);
}
