/**
 * @fileoverview Hinterland Store Upload API - Vercel Serverless Endpoint
 * Allows logged-in users to post designs (themes) and upload extensions to
 * the Hinter Store. Uses Supabase (free tier) as the backing store.
 * Free stack: Vercel serverless + Supabase free tier.
 */

const crypto = require('node:crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

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

function isEmail(val) {
  return typeof val === 'string' && /^[^\s@]+@[^\s@]+$/.test(val.trim());
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function verifySupabaseToken(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }

  // GET - list community content from Supabase
  if (req.method === 'GET') {
    const type = req.url.split('?')[0].split('/').pop() || 'all';
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(200).json({ ok: true, themes: [], extensions: [], source: 'supabase-disabled' });
    }
    try {
      const themesRes = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/store_themes?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      const extsRes = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/store_extensions?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      const themes = themesRes.ok ? await themesRes.json() : [];
      const extensions = extsRes.ok ? await extsRes.json() : [];
      return res.status(200).json({ ok: true, themes, extensions, source: 'supabase' });
    } catch {
      return res.status(200).json({ ok: true, themes: [], extensions: [], source: 'supabase-error' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // POST - upload theme or extension (requires auth)
  const token = extractToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'notLoggedIn' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ ok: false, error: 'supabaseNotConfigured' });
  }

  const body = req.body || {};
  const { kind, ...data } = body;

  if (kind === 'theme') {
    // Validate theme payload
    if (!data.name || !data.id) {
      return res.status(400).json({ ok: false, error: 'invalidTheme' });
    }
    const theme = {
      id: data.id,
      name: data.name,
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
      tags: data.tags || ['community', 'custom'],
      description: data.description || '',
      user_id: user.id,
      created_at: new Date().toISOString(),
    };
    try {
      const insertRes = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/store_themes`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(theme),
      });
      if (!insertRes.ok) {
        const err = await insertRes.json().catch(() => ({}));
        return res.status(insertRes.status).json({ ok: false, error: err.message || 'themeUploadFailed' });
      }
      const inserted = await insertRes.json();
      return res.status(201).json({ ok: true, theme: inserted[0] });
    } catch {
      return res.status(500).json({ ok: false, error: 'themeUploadFailed' });
    }
  }

  if (kind === 'extension') {
    if (!data.id || !data.name) {
      return res.status(400).json({ ok: false, error: 'invalidExtension' });
    }
    const extension = {
      id: data.id,
      name: data.name,
      author: data.author || user.email || 'Community',
      source: 'community',
      version: data.version || '1.0.0',
      category: data.category || 'utilities',
      iconName: data.iconName || 'puzzle',
      bundled: false,
      permissions: data.permissions || ['activeTab'],
      description: data.description || '',
      configOptions: data.configOptions || [],
      user_id: user.id,
      created_at: new Date().toISOString(),
    };
    try {
      const insertRes = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/store_extensions`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(extension),
      });
      if (!insertRes.ok) {
        const err = await insertRes.json().catch(() => ({}));
        return res.status(insertRes.status).json({ ok: false, error: err.message || 'extensionUploadFailed' });
      }
      const inserted = await insertRes.json();
      return res.status(201).json({ ok: true, extension: inserted[0] });
    } catch {
      return res.status(500).json({ ok: false, error: 'extensionUploadFailed' });
    }
  }

  return res.status(400).json({ ok: false, error: 'invalidKind' });
};
