/**
 * @fileoverview Hinterland Account API - Vercel Serverless
 * Real accounts with email + password, email/phone verification, TOTP 2FA,
 * and store-download entitlements. Auth state owned by Supabase GoTrue when
 * configured; a shared in-memory layer serves as dev/preview fallback.
 *
 * Endpoints:
 *   POST  /api/account/register   { email, password, phone? } -> { token, user, requiresEmailVerification }
 *   POST  /api/account/login      { email, password, totp? }  -> { token, user, requiresTotp }
 *   GET   /api/account/me         -> { ok, user }
 *   PUT   /api/account/me         -> update profile
 *   POST  /api/account/verify     { code, purpose ('email'|'phone'|'totp-enable'|'password-reset') }
 *   POST  /api/account/totp/setup -> { secret, uri, recoveryCodes }
 *   POST  /api/account/totp/verify { token } -> { ok, verified }
 *   POST  /api/account/logout     -> { ok }
 *   GET   /api/account/download/entitlement -> { ok, remaining }
 *   POST  /api/account/download/consume   -> { ok, remaining }
 *   GET   /api/account/providers  -> provider status
 */

const crypto = require('node:crypto');

const {
  HAS_SUPABASE, baseUrl, isEmail, isPhone, hashPassword, timingSafeEqual,
  accountsByEmail, accountsById, sessionsByToken, verifyCodes, downloadsByUser,
  supabaseFetch, supabaseAuthFetch,
  createAccount, verifyPasswordAccount, createSession, getSession, destroySession,
  resolveSupabaseUser, mapAccountToProfile,
  createVerificationCode, consumeVerificationCode,
  totpGenerate, totpVerify, generateRecoveryCodes,
  incrementDownload, getDownloadCount, providersStatus,
} = require('./_account');

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

/* ------------------------------------------------------------- auth helpers */

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function resolveUser(token) {
  if (!token) return null;
  if (HAS_SUPABASE) {
    const user = await resolveSupabaseUser(token);
    if (user) {
      const local = accountsById.get(user.id) || accountsByEmail.get(user.email);
      return { ...user, ...(local || {}) };
    }
    return null;
  }
  const s = getSession(token);
  if (!s) return null;
  return accountsById.get(s.id) || null;
}

/* ------------------------------------------------------------- handler */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return json(res, 429, { ok: false, error: 'Too many requests. Please try again later.' });
  }

  const url = req.url.split('?')[0];
  const path = url.replace(/\/+$/, '');

  /* --------------------------------------------------- POST /api/account/register */
  if (req.method === 'POST' && path === '/api/account/register') {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const phone = String(body.phone || '').trim() || undefined;

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

    const code = createVerificationCode({ identifier: email, purpose: 'email', ttlMs: 10 * 60_000 });
    const token = createSession(account);
    return json(res, 201, {
      ok: true,
      requiresEmailVerification: true,
      verificationCode: code,
      token,
      user: mapAccountToProfile(account),
    });
  }

  /* ------------------------------------------------------ POST /api/account/login */
  if (req.method === 'POST' && path === '/api/account/login') {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const totp = String(body.totp || '').trim();

    if (!isEmail(email) || !password) return json(res, 400, { ok: false, error: 'invalidCredentials' });

    let account;
    if (HAS_SUPABASE) {
      try {
        const resUp = await fetch(`${baseUrl()}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });
        const data = await resUp.json();
        if (!resUp.ok) return json(res, 401, { ok: false, error: 'invalidCredentials' });
        const supaUser = data.user || {};
        account = accountsById.get(supaUser.id) || accountsByEmail.get(email) || {
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

    const token = createSession(account);
    return json(res, 200, {
      ok: true,
      token,
      requiresTotp: false,
      user: mapAccountToProfile(account),
    });
  }

  /* --------------------------------------------------------- GET /api/account/me */
  if (req.method === 'GET' && path === '/api/account/me') {
    const token = extractToken(req);
    const user = await resolveUser(token);
    if (!user) return json(res, 401, { ok: false, error: 'notLoggedIn' });
    return json(res, 200, { ok: true, user: mapAccountToProfile(user) });
  }

  /* ------------------------------------------------------- PUT /api/account/me */
  if (req.method === 'PUT' && path === '/api/account/me') {
    const token = extractToken(req);
    const user = await resolveUser(token);
    if (!user) return json(res, 401, { ok: false, error: 'notLoggedIn' });

    const body = req.body || {};
    const { displayName } = body;
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 80)) {
      return json(res, 400, { ok: false, error: 'invalidDisplayName' });
    }

    if (HAS_SUPABASE && token) {
      try {
        await fetch(`${baseUrl()}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ data: { displayName: displayName || '' } }),
        });
      } catch {
        // non-fatal
      }
    }

    const local = accountsById.get(user.id);
    if (local && displayName !== undefined) local.displayName = displayName.trim();

    return json(res, 200, { ok: true, user: mapAccountToProfile({ ...user, displayName }) });
  }

  /* ------------------------------------------------ POST /api/account/verify */
  if (req.method === 'POST' && path === '/api/account/verify') {
    const body = req.body || {};
    const { code, purpose, email, phone } = body;
    if (!code || !purpose) return json(res, 400, { ok: false, error: 'missingCodeOrPurpose' });

    const identifier = purpose === 'phone' ? (phone || '') : (email || '');
    if (!identifier) return json(res, 400, { ok: false, error: 'missingIdentifier' });

    const result = consumeVerificationCode(code, { identifier, purpose });
    if (!result.ok) return json(res, 400, { ok: false, error: result.error });

    const acct = purpose === 'phone'
      ? [...accountsByEmail.values()].find((a) => a.phone === identifier)
      : accountsByEmail.get(identifier);
    if (acct) {
      if (purpose === 'email') acct.emailVerified = true;
      if (purpose === 'phone') acct.phoneVerified = true;
    }

    return json(res, 200, { ok: true, verified: true });
  }

  /* -------------------------------------------- POST /api/account/totp/setup */
  if (req.method === 'POST' && path === '/api/account/totp/setup') {
    const token = extractToken(req);
    const user = await resolveUser(token);
    if (!user) return json(res, 401, { ok: false, error: 'notLoggedIn' });

    const acct = accountsById.get(user.id);
    if (!acct) return json(res, 404, { ok: false, error: 'accountNotFound' });
    if (acct.totpSecret) return json(res, 409, { ok: false, error: 'totpAlreadyEnabled' });

    const secret = crypto.randomBytes(10).toString('base64').replace(/[+/=]/g, '').slice(0, 32);
    const issuer = 'Hinterland';
    const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(acct.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    const recoveryCodes = generateRecoveryCodes();

    sessionsByToken.forEach((s) => { if (s.id === user.id) s._pendingTotp = { secret, recoveryCodes }; });

    return json(res, 200, { ok: true, secret, uri, recoveryCodes });
  }

  /* ------------------------------------------ POST /api/account/totp/verify */
  if (req.method === 'POST' && path === '/api/account/totp/verify') {
    const token = extractToken(req);
    const user = await resolveUser(token);
    if (!user) return json(res, 401, { ok: false, error: 'notLoggedIn' });

    const body = req.body || {};
    const code = String(body.token || '').trim();
    if (!/^\d{6}$/.test(code)) return json(res, 400, { ok: false, error: 'invalidTotpCode' });

    const acct = accountsById.get(user.id);
    if (!acct) return json(res, 404, { ok: false, error: 'accountNotFound' });

    let pending = null;
    sessionsByToken.forEach((s) => { if (s.id === user.id && s._pendingTotp) pending = s._pendingTotp; });
    if (!pending || !totpVerify(pending.secret, code)) {
      if (acct.totpSecret && totpVerify(acct.totpSecret, code)) {
        return json(res, 200, { ok: true, verified: true });
      }
      return json(res, 400, { ok: false, error: 'invalidTotpCode' });
    }

    acct.totpSecret = pending.secret;
    acct.recoveryCodes = pending.recoveryCodes;
    sessionsByToken.forEach((s) => { if (s.id === user.id) delete s._pendingTotp; });

    return json(res, 200, { ok: true, verified: true });
  }

  /* ---------------------------------------------------- POST /api/account/logout */
  if (req.method === 'POST' && path === '/api/account/logout') {
    const token = extractToken(req);
    if (token) destroySession(token);
    return json(res, 200, { ok: true });
  }

  /* -------------------------------------- GET /api/account/download/entitlement */
  if (req.method === 'GET' && path === '/api/account/download/entitlement') {
    const token = extractToken(req);
    const user = await resolveUser(token);
    if (!user) return json(res, 401, { ok: false, error: 'notLoggedIn' });
    const verified = HAS_SUPABASE
      ? Boolean(user.email_confirmed_at || user.emailVerified)
      : Boolean(user.emailVerified);
    const remaining = verified ? Math.max(0, 50 - getDownloadCount(user.id)) : 0;
    return json(res, 200, { ok: true, verified, remaining, limit: 50 });
  }

  /* --------------------------------------- POST /api/account/download/consume */
  if (req.method === 'POST' && path === '/api/account/download/consume') {
    const token = extractToken(req);
    const user = await resolveUser(token);
    if (!user) return json(res, 401, { ok: false, error: 'notLoggedIn' });
    const verified = HAS_SUPABASE
      ? Boolean(user.email_confirmed_at || user.emailVerified)
      : Boolean(user.emailVerified);
    if (!verified) return json(res, 403, { ok: false, error: 'emailNotVerified' });
    const n = incrementDownload(user.id);
    const remaining = Math.max(0, 50 - n);
    return json(res, 200, { ok: true, consumed: n, remaining });
  }

  /* --------------------------------------- GET /api/account/providers */
  if (req.method === 'GET' && path === '/api/account/providers') {
    return json(res, 200, { ok: true, ...providersStatus() });
  }

  return json(res, 404, { ok: false, error: 'notFound' });
};
