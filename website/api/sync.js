/**
 * @fileoverview Hinterland Cloud Sync API - Vercel Serverless Endpoint
 * Handles user authentication, encrypted bookmark/settings synchronization,
 * and conflict resolution for the Hinterland browser using free serverless tools.
 */

const crypto = require('node:crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Ephemeral memory stores for serverless instances & unit/smoke tests
const usersByEmail = new Map();
const tokensToUser = new Map();
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

// Cleanup rate limits periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) if (now > e.reset) hits.delete(ip);
}, 5 * 60_000).unref?.();

function isEmail(val) {
  return typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, storedHash) {
  const hash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.href.replace(/\/$/, '');
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }

  // Handle GET status check
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'hinterland-sync',
      version: '1.19.0',
      provider: SUPABASE_URL ? 'supabase-proxy' : 'serverless',
      time: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body || {};
  const action = body.action || 'sync';

  // Extract auth token
  const authHeader = req.headers.authorization || '';
  const token = body.token || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

  /* ----------------------------------------------------------------- signup */
  if (action === 'signup') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!isEmail(email)) return res.status(400).json({ ok: false, error: 'invalidEmail' });
    if (password.length < 6) return res.status(400).json({ ok: false, error: 'passwordTooShort' });

    // If upstream Supabase is configured
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const upstream = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/signup`, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const upData = await upstream.json();
        if (!upstream.ok) return res.status(upstream.status).json({ ok: false, error: upData.msg || 'signUpFailed' });
        const user = upData.user || { id: upData.id, email };
        const userToken = upData.access_token || generateToken();
        return res.status(201).json({ ok: true, token: userToken, user: { id: user.id, email } });
      } catch {
        // Fall back to local serverless handler on network exception
      }
    }

    if (usersByEmail.has(email)) {
      return res.status(409).json({ ok: false, error: 'userAlreadyExists' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const userId = crypto.randomUUID();
    const user = { id: userId, email, salt, hash, created: new Date().toISOString() };

    usersByEmail.set(email, user);
    const newToken = generateToken();
    tokensToUser.set(newToken, user);

    return res.status(201).json({
      ok: true,
      token: newToken,
      user: { id: user.id, email: user.email },
    });
  }

  /* ------------------------------------------------------------------ login */
  if (action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!isEmail(email) || !password) {
      return res.status(400).json({ ok: false, error: 'invalidCredentials' });
    }

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const upstream = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const upData = await upstream.json();
        if (!upstream.ok) return res.status(401).json({ ok: false, error: 'invalidCredentials' });
        return res.status(200).json({
          ok: true,
          token: upData.access_token,
          user: { id: upData.user.id, email: upData.user.email },
        });
      } catch {
        // Fall back to local serverless auth
      }
    }

    const user = usersByEmail.get(email);
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
      return res.status(401).json({ ok: false, error: 'invalidCredentials' });
    }

    const newToken = generateToken();
    tokensToUser.set(newToken, user);

    return res.status(200).json({
      ok: true,
      token: newToken,
      user: { id: user.id, email: user.email },
    });
  }

  /* ------------------------------------------------------ authenticated sync */
  if (!token) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const user = tokensToUser.get(token);
  // If token is unknown and no Supabase is configured, reject
  if (!user && !SUPABASE_URL) {
    return res.status(401).json({ ok: false, error: 'sessionExpired' });
  }

  const userId = user?.id || token;

  if (action === 'pull') {
    const stored = syncDataByUser.get(userId) || { bookmarks: [], settings: {}, updatedAt: null };
    return res.status(200).json({ ok: true, data: stored, syncedAt: stored.updatedAt });
  }

  if (action === 'push') {
    const toSave = {
      ...body.data,
      updatedAt: new Date().toISOString(),
    };
    syncDataByUser.set(userId, toSave);
    return res.status(200).json({ ok: true, syncedAt: toSave.updatedAt });
  }

  // Default: two-way 'sync' merge
  const incoming = body.data || {};
  const current = syncDataByUser.get(userId);

  if (!current) {
    // First sync upload
    const initial = {
      ...incoming,
      updatedAt: new Date().toISOString(),
    };
    syncDataByUser.set(userId, initial);
    return res.status(200).json({ ok: true, data: initial, syncedAt: initial.updatedAt });
  }

  // If payload is end-to-end encrypted, store latest encrypted snapshot
  if (incoming.encrypted) {
    const encryptedSnapshot = {
      ...incoming,
      updatedAt: new Date().toISOString(),
    };
    syncDataByUser.set(userId, encryptedSnapshot);
    return res.status(200).json({ ok: true, data: encryptedSnapshot, syncedAt: encryptedSnapshot.updatedAt });
  }

  // Plaintext merge
  const mergedBookmarks = mergeBookmarks(incoming.bookmarks ?? [], current.bookmarks ?? []);
  const mergedSettings = { ...(current.settings ?? {}), ...(incoming.settings ?? {}) };
  const merged = {
    bookmarks: mergedBookmarks,
    settings: mergedSettings,
    updatedAt: new Date().toISOString(),
  };

  syncDataByUser.set(userId, merged);
  return res.status(200).json({ ok: true, data: merged, syncedAt: merged.updatedAt });
};
