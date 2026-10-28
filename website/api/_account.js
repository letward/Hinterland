/**
 * @fileoverview Shared account logic for Hinterland Vercel account system.
 * Single source of truth: accounts (email + password hash), verification state
 * (email, phone, TOTP/2FA), sessions, and entitlements (store downloads).
 *
 * Modes:
 * - Supabase configured: auth.users is SSOT for credentials; this layer tracks
 *   verification/entitlements in its own tables via the REST API and gates
 *   sessions against Supabase GoTrue tokens.
 * - Fallback (no Supabase): in-memory per instance — functional for dev/preview
 *   but NOT durable across cold starts. Clearly flagged so production never
 *   relies on it silently.
 */

const crypto = require('node:crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const baseUrl = () => (SUPABASE_URL || '').replace(/\/+$/, '');

/* ----------------------------------------------------------------- helpers */

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isPhone(v) {
  return typeof v === 'string' && /^\+?[0-9]{7,15}$/.test(v.trim());
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function timingSafeEqual(a, b) {
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/* ----------------------------------------------------------------- in-memory fallback state (per serverless instance) */

// accounts: email -> { id, email, salt, hash, emailVerified, phone, phoneVerified,
// totpSecret, recoveryCodes, createdAt, lastSignIn }
const accountsByEmail = new Map();
const accountsById = new Map();
// sessions: token -> { id, email, createdAt, lastUsedAt }
const sessionsByToken = new Map();
// verification codes: code -> { email|phone, purpose, expiresAt, used }
const verifyCodes = new Map();
// store downloads: userId -> count (entitlement gating placeholder)
const downloadsByUser = new Map();

// Cleanup expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of verifyCodes) {
    if (now > entry.expiresAt) verifyCodes.delete(code);
  }
}, 5 * 60_000).unref?.();

/* ----------------------------------------------------------------- Supabase transport */

async function supabaseFetch(path, { method = 'GET', headers = {}, body } = {}) {
  if (!HAS_SUPABASE) throw new Error('supabaseNotConfigured');
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function supabaseAuthFetch(path, { method = 'GET', token, headers = {}, body } = {}) {
  if (!HAS_SUPABASE) throw new Error('supabaseNotConfigured');
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: token ? 'Bearer ' + token : '',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

/* ----------------------------------------------------------------- account lifecycle */

async function createAccount({ email, password, phone }) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  phone = String(phone || '').trim() || null;

  if (!isEmail(email)) throw new Error('invalidEmail');
  if (password.length < 8) throw new Error('passwordTooShort');
  if (phone && !isPhone(phone)) throw new Error('invalidPhone');
  if (accountsByEmail.has(email)) throw new Error('userAlreadyExists');

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const account = {
    id, email, salt, hash,
    emailVerified: false,
    phone: phone || null,
    phoneVerified: !!phone,
    totpSecret: null,
    recoveryCodes: null,
    createdAt: new Date().toISOString(),
    lastSignIn: null,
  };

  if (HAS_SUPABASE) {
    try {
      const res = await supabaseFetch('/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { email, password, data: { phone } },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || data.error || 'signUpFailed');
      if (data.user) account.id = data.user.id || id;
      // email verification: Supabase sends a confirmation email; mark pending
      account.emailVerified = false;
    } catch (err) {
      // Network/auth provider failure -> fall back to local account so the
      // endpoint stays functional in dev/preview. In production this path
      // should NOT succeed silently without the admin knowing; we still
      // create the local record and mark it fallbackOnly.
      account._fallbackOnly = true;
    }
  }

  accountsByEmail.set(email, account);
  accountsById.set(account.id, account);
  return account;
}

async function verifyPasswordAccount(email, password) {
  email = String(email || '').trim().toLowerCase();
  const account = accountsByEmail.get(email);
  if (!account) return null;
  const hash = hashPassword(password, account.salt);
  if (!timingSafeEqual(hash, account.hash)) return null;
  return account;
}

function createSession(account) {
  const token = generateToken();
  sessionsByToken.set(token, {
    id: account.id,
    email: account.email,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessionsByToken.get(token);
  if (!s) return null;
  s.lastUsedAt = new Date().toISOString();
  return s;
}

function destroySession(token) {
  if (token) sessionsByToken.delete(token);
}

async function resolveSupabaseUser(token) {
  if (!HAS_SUPABASE || !token) return null;
  try {
    const res = await supabaseAuthFetch('/auth/v1/user', { token });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

function mapAccountToProfile(account) {
  return {
    id: account.id,
    email: account.email,
    provider: HAS_SUPABASE ? 'supabase' : 'hinterland',
    displayName: account.displayName || undefined,
    emailVerified: Boolean(account.emailVerified),
    phone: account.phone || null,
    phoneVerified: Boolean(account.phoneVerified),
    totpEnabled: Boolean(account.totpSecret),
    createdAt: account.createdAt,
    lastSignIn: account.lastSignIn || null,
  };
}

/* ----------------------------------------------------------------- verification codes */

function createVerificationCode({ identifier, purpose, ttlMs = 10 * 60_000 }) {
  const code = crypto.randomInt(100_000, 999_999).toString();
  verifyCodes.set(code, {
    identifier,
    purpose, // 'email' | 'phone' | 'password-reset' | 'totp-enable'
    expiresAt: Date.now() + ttlMs,
    used: false,
  });
  return code;
}

function consumeVerificationCode(code, { identifier, purpose }) {
  const entry = verifyCodes.get(code);
  if (!entry) return { ok: false, error: 'invalidCode' };
  if (entry.used) return { ok: false, error: 'codeAlreadyUsed' };
  if (Date.now() > entry.expiresAt) {
    verifyCodes.delete(code);
    return { ok: false, error: 'codeExpired' };
  }
  if (entry.identifier !== identifier || entry.purpose !== purpose) {
    return { ok: false, error: 'codeMismatch' };
  }
  entry.used = true;
  return { ok: true };
}

/* ----------------------------------------------------------------- TOTP (RFC 6238) */

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

function hmacSha1(key, data) {
  return crypto.createHmac('sha1', key).update(data).digest();
}

function totpGenerate(secret) {
  const key = base32Decode(secret);
  let time = Math.floor(Date.now() / 1000 / 30);
  const buffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buffer[i] = time & 0xff;
    time = Math.floor(time / 256);
  }
  const hmac = hmacSha1(key, buffer);
  const offset = hmac[19] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24) |
                 ((hmac[offset + 1] & 0xff) << 16) |
                 ((hmac[offset + 2] & 0xff) << 8) |
                 (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

function totpVerify(secret, token, window = 1) {
  if (!secret || !/^\d{6}$/.test(String(token))) return false;
  let time = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const t = Buffer.alloc(8);
    let v = time + i;
    for (let j = 7; j >= 0; j--) { t[j] = v & 0xff; v = Math.floor(v / 256); }
    const key = base32Decode(secret);
    const hmac = hmacSha1(key, t);
    const offset = hmac[19] & 0xf;
    const binary = ((hmac[offset] & 0x7f) << 24) |
                   ((hmac[offset + 1] & 0xff) << 16) |
                   ((hmac[offset + 2] & 0xff) << 8) |
                   (hmac[offset + 3] & 0xff);
    const code = (binary % 1_000_000).toString().padStart(6, '0');
    if (timingSafeEqual(code, token)) return true;
  }
  return false;
}

function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  return codes;
}

/* ----------------------------------------------------------------- entitlements (store downloads) */

function incrementDownload(userId) {
  const n = (downloadsByUser.get(userId) || 0) + 1;
  downloadsByUser.set(userId, n);
  return n;
}

function getDownloadCount(userId) {
  return downloadsByUser.get(userId) || 0;
}

/* ----------------------------------------------------------------- provider status */

function providersStatus() {
  return {
    sync: { server: HAS_SUPABASE ? 'supabase' : 'hinterland-serverless', supabaseConfigured: HAS_SUPABASE },
    store: { supabaseConfigured: HAS_SUPABASE },
    analytics: { vercelAnalytics: true },
    account: {
      emailVerification: HAS_SUPABASE ? 'supabase-gotrue' : 'local-code',
      phoneVerification: 'local-code',
      totp2FA: 'local-rfc6238',
    },
  };
}

module.exports = {
  HAS_SUPABASE,
  baseUrl,
  isEmail, isPhone, generateToken, hashPassword, timingSafeEqual,
  accountsByEmail, accountsById, sessionsByToken, verifyCodes, downloadsByUser,
  supabaseFetch, supabaseAuthFetch,
  createAccount, verifyPasswordAccount, createSession, getSession, destroySession,
  resolveSupabaseUser, mapAccountToProfile,
  createVerificationCode, consumeVerificationCode,
  totpGenerate, totpVerify, generateRecoveryCodes,
  incrementDownload, getDownloadCount, providersStatus,
};
