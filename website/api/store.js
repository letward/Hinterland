/**
 * @fileoverview Hinterland Store Upload API - Vercel Serverless Endpoint
 * Allows logged-in users to post designs (themes) and upload extensions to
 * the Hinter Store. Uses Supabase as the backing store with an in-memory
 * fallback for local dev/preview. Auth state is shared with /api/account via
 * the shared _account.js module.
 *
 * Endpoints:
 *   GET  /api/store         -> list themes + extensions (public)
 *   POST /api/store         -> upload theme/extension (requires auth)
 */

const crypto = require('node:crypto');

const {
  HAS_SUPABASE, baseUrl, isEmail, isPhone,
  accountsById, sessionsByToken,
  verifyPasswordAccount, createSession, getSession,
  resolveSupabaseUser, mapAccountToProfile,
  incrementDownload, getDownloadCount,
} = require('./_account');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// In-memory fallback for local dev / preview / testing
const memoryThemes = [];
const memoryExtensions = [];

// Rate limiting
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

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

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
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

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return json(res, 429, { ok: false, error: 'Too many requests. Please try again later.' });
  }

  /* --------------------------------------------------- GET - list content */
  if (req.method === 'GET') {
    let themes = [...memoryThemes];
    let extensions = [...memoryExtensions];

    if (HAS_SUPABASE) {
      try {
        const themesRes = await fetch(`${baseUrl()}/rest/v1/store_themes?select=*&order=created_at.desc`, {
          headers: { apikey: process.env.SUPABASE_ANON_KEY },
        });
        const extsRes = await fetch(`${baseUrl()}/rest/v1/store_extensions?select=*&order=created_at.desc`, {
          headers: { apikey: process.env.SUPABASE_ANON_KEY },
        });
        if (themesRes.ok) themes = [...themes, ...(await themesRes.json())];
        if (extsRes.ok) extensions = [...extensions, ...(await extsRes.json())];
      } catch {
        // Fall back to memory lists on fetch error
      }
    }

    return json(res, 200, {
      ok: true,
      themes,
      extensions,
      source: HAS_SUPABASE ? 'supabase' : 'memory',
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  /* ------------------------------------------- POST - upload (requires auth) */
  const token = extractToken(req);
  const user = await resolveUser(token);
  if (!user) {
    return json(res, 401, { ok: false, error: 'notLoggedIn' });
  }

  const body = req.body || {};
  const { kind, ...data } = body;

  if (kind === 'theme') {
    if (!data.name || !data.id) {
      return json(res, 400, { ok: false, error: 'invalidTheme' });
    }
    const theme = {
      id: String(data.id).toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
      name: String(data.name).slice(0, 100),
      author: data.author || user.email || 'Community',
      source: 'community',
      version: data.version || '1.0.0',
      theme: data.theme || 'dark',
      accent: data.accent || '#4f7cff',
      accentContrast: data.accentContrast || '#ffffff',
      darkBackground: data.darkBackground || '#12141a',
      darkSurface: data.darkSurface || '#1a1d26',
      darkText: data.darkText || '#e6e9f2',
      lightBackground: data.lightBackground || '#f2f3f7',
      lightSurface: data.lightSurface || '#ffffff',
      lightText: data.lightText || '#161923',
      radius: data.radius ?? 10,
      density: data.density || 'cosy',
      fontStack: data.fontStack || 'system',
      blur: data.blur ?? 16,
      tags: Array.isArray(data.tags) ? data.tags : ['community', 'custom'],
      description: String(data.description || '').slice(0, 500),
      user_id: user.id,
      created_at: new Date().toISOString(),
    };

    if (HAS_SUPABASE && token) {
      try {
        const insertRes = await fetch(`${baseUrl()}/rest/v1/store_themes`, {
          method: 'POST',
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(theme),
        });
        if (insertRes.ok) {
          const inserted = await insertRes.json();
          return json(res, 201, { ok: true, theme: inserted[0] || theme });
        }
      } catch {
        // Fall back to memory storage on connection error
      }
    }

    memoryThemes.unshift(theme);
    return json(res, 201, { ok: true, theme });
  }

  if (kind === 'extension') {
    if (!data.id || !data.name) {
      return json(res, 400, { ok: false, error: 'invalidExtension' });
    }
    const cleanId = String(data.id).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const extension = {
      id: cleanId,
      name: String(data.name).slice(0, 100),
      author: data.author || user.email || 'Community',
      source: 'community',
      version: data.version || '1.0.0',
      category: data.category || 'utilities',
      iconName: data.iconName || 'puzzle',
      bundled: false,
      permissions: Array.isArray(data.permissions) ? data.permissions : ['activeTab'],
      description: String(data.description || '').slice(0, 500),
      contentScript: typeof data.contentScript === 'string' ? data.contentScript.slice(0, 5000) : '',
      configOptions: Array.isArray(data.configOptions) ? data.configOptions : [],
      user_id: user.id,
      created_at: new Date().toISOString(),
    };

    if (HAS_SUPABASE && token) {
      try {
        const insertRes = await fetch(`${baseUrl()}/rest/v1/store_extensions`, {
          method: 'POST',
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(extension),
        });
        if (insertRes.ok) {
          const inserted = await insertRes.json();
          return json(res, 201, { ok: true, extension: inserted[0] || extension });
        }
      } catch {
        // Fall back to memory storage on connection error
      }
    }

    memoryExtensions.unshift(extension);
    return json(res, 201, { ok: true, extension });
  }

  return json(res, 400, { ok: false, error: 'invalidKind' });
};
