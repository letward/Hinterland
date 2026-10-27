/**
 * @fileoverview Hinterland Account API - Vercel Serverless
 * Single source of truth for user profiles on Vercel.
 * Auth state is owned by Supabase (GoTrue) when configured; a small in-memory
 * registry serves as the dev/preview fallback so the endpoints stay functional
 * without any external provisioning.
 *
 * Endpoints:
 *   GET  /api/account/me          -> { ok, user: { id, email, provider, ...profile } }
 *   PUT  /api/account/me          -> update profile (displayName, etc.)
 *   GET  /api/account/providers   -> configured auth/sync providers status
 */

const crypto = require('node:crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// In-memory fallback (per serverless instance). Real state lives in Supabase auth.users.
const usersByEmail = new Map();   // email -> { id, email, salt, hash, created }
const tokensToUser = new Map();   // token -> { id, email }
const profilesByUserId = new Map(); // userId -> { displayName, ... }

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+$/.test(v.trim());
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, storedHash) {
  const hash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function baseUrl() {
  return (SUPABASE_URL || '').replace(/\/+$/, '');
}

/* ------------------------------------------------------------- auth helpers */

async function verifySupabaseToken(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${baseUrl()}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + token,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function resolveUser(token) {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return await verifySupabaseToken(token);
  }
  return tokensToUser.get(token) || null;
}

function userProfile(user) {
  const profile = profilesByUserId.get(user.id) || {};
  return {
    id: user.id,
    email: user.email,
    provider: SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'hinterland',
    ...profile,
  };
}

/* ------------------------------------------------------------- rate limit */

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
  entry.count += 1;
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

/* ------------------------------------------------------------- handler */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return json(res, 429, { ok: false, error: 'Too many requests. Please try again later.' });
  }

  const url = req.url.split('?')[0];
  const path = url.replace(/\/+$/, '');

  /* ------------------------------------------------------ GET /api/account/me */
  if (req.method === 'GET' && path.endsWith('/account/me')) {
    const token = extractToken(req);
    const user = await resolveUser(token);
    if (!user) {
      return json(res, 401, { ok: false, error: 'notLoggedIn' });
    }
    return json(res, 200, { ok: true, user: userProfile(user) });
  }

  /* --------------------------------------------------- PUT /api/account/me */
  if (req.method === 'PUT' && path.endsWith('/account/me')) {
    const token = extractToken(req);
    const user = await resolveUser(token);
    if (!user) {
      return json(res, 401, { ok: false, error: 'notLoggedIn' });
    }

    const body = req.body || {};
    const { displayName } = body;
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 80)) {
      return json(res, 400, { ok: false, error: 'invalidDisplayName' });
    }

    const profile = { ...(profilesByUserId.get(user.id) || {}) };
    if (displayName !== undefined) profile.displayName = displayName.trim();
    profilesByUserId.set(user.id, profile);

    // Persist into Supabase user_metadata when available (cross-device SSOT)
    if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
      try {
        const updKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
        await fetch(`${baseUrl()}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            apikey: updKey,
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ data: { profile } }),
        });
      } catch {
        // Non-fatal: in-memory profile is still current for this session
      }
    }

    return json(res, 200, { ok: true, user: userProfile(user) });
  }

  /* --------------------------------------- GET /api/account/providers */
  if (req.method === 'GET' && path.endsWith('/account/providers')) {
    return json(res, 200, {
      ok: true,
      sync: {
        server: SUPABASE_URL ? 'supabase' : 'hinterland-serverless',
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
      },
      store: {
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
      },
      analytics: {
        vercelAnalytics: true,
      },
    });
  }

  return json(res, 404, { ok: false, error: 'notFound' });
};
