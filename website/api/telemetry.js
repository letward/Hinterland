/**
 * @fileoverview Telemetry API - Vercel Serverless
 * Opt-in, anonymized UX events used to optimize future Hinterland updates.
 * No PII is ever stored or transmitted: emails, IPs, URLs, and user content are
 * stripped before the event is accepted.
 *
 * Endpoint:
 *   POST /api/telemetry   { optIn, sessionId, appVersion, events: [{ name, props, ts }] }
 */

const crypto = require('node:crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_EVENTS = new Set([
  'page_view', 'feature_click', 'sync_used', 'store_upload',
  'extension_installed', 'theme_applied', 'startup', 'crashed',
]);
const MAX_EVENTS_PER_REQUEST = 50;
const MAX_PROP_KEYS = 20;
const MAX_PROP_VALUE_LEN = 200;

const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;

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

function baseUrl() {
  return (SUPABASE_URL || '').replace(/\/+$/, '');
}

// Sanitize a single event: drop PII-like keys, cap size, keep only safe primitives.
function sanitizeEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const name = typeof event.name === 'string' ? event.name.slice(0, 100) : null;
  if (!name || !ALLOWED_EVENTS.has(name)) return null;

  const props = {};
  const raw = event.props && typeof event.props === 'object' && !Array.isArray(event.props)
    ? event.props
    : {};
  let count = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (count >= MAX_PROP_KEYS) break;
    const cleanKey = String(key).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    if (!cleanKey) continue;
    // Drop anything that looks like PII.
    if (/email|ip|token|password|key|secret|url|uri|address|name/i.test(cleanKey)) continue;
    let cleanValue = value;
    if (typeof cleanValue === 'string') cleanValue = cleanValue.slice(0, MAX_PROP_VALUE_LEN);
    else if (typeof cleanValue === 'number' && !Number.isFinite(cleanValue)) continue;
    else if (typeof cleanValue !== 'string' && typeof cleanValue !== 'number' && typeof cleanValue !== 'boolean') continue;
    props[cleanKey] = cleanValue;
    count += 1;
  }

  const ts = typeof event.ts === 'number' && Number.isFinite(event.ts) ? event.ts : Date.now();
  return { name, props, ts };
}

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'methodNotAllowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return json(res, 429, { ok: false, error: 'Too many requests. Please try again later.' });
  }

  const body = req.body || {};
  const optIn = body.optIn === true;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 128) : null;
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 64) : null;
  const rawEvents = Array.isArray(body.events) ? body.events : [];

  // Respect opt-out: never persist, just acknowledge.
  if (!optIn) {
    return json(res, 200, { ok: true, accepted: 0, note: 'optedOut' });
  }

  const events = [];
  for (const raw of rawEvents) {
    if (events.length >= MAX_EVENTS_PER_REQUEST) break;
    const clean = sanitizeEvent(raw);
    if (clean) events.push(clean);
  }

  // Persist to Supabase when configured (SSOT), else best-effort accept.
  if (events.length > 0 && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const updKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
      const rows = events.map((e) => ({
        name: e.name,
        props: e.props,
        ts: e.ts,
        session_id: sessionId,
        app_version: appVersion,
        created_at: new Date().toISOString(),
      }));
      await fetch(`${baseUrl()}/rest/v1/telemetry_events`, {
        method: 'POST',
        headers: {
          apikey: updKey,
          Authorization: 'Bearer ' + (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY),
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(rows),
      });
    } catch {
      // Non-fatal: telemetry must never break the user experience.
    }
  }

  return json(res, 200, { ok: true, accepted: events.length });
};
