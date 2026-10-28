import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const accountApi = require('../../website/api/account.js');
const {
  isEmail,
  isPhone,
  hashPassword,
  timingSafeEqual,
  createAccount,
  verifyPasswordAccount,
  createSession,
  getSession,
  destroySession,
  createVerificationCode,
  consumeVerificationCode,
  totpGenerate,
  totpVerify,
  generateRecoveryCodes,
  incrementDownload,
  getDownloadCount,
  providersStatus,
  accountsByEmail,
  accountsById,
  sessionsByToken,
} = require('../../website/api/_account.js');

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

describe('Hinterland v1.22.0 Account & Security Architecture', () => {
  describe('Core Cryptography & Validation Utilities (_account.js)', () => {
    it('validates email addresses accurately', () => {
      assert.equal(isEmail('user@example.com'), true);
      assert.equal(isEmail('user.name+tag@sub.domain.org'), true);
      assert.equal(isEmail('invalid-email'), false);
      assert.equal(isEmail('user@domain'), false);
      assert.equal(isEmail(''), false);
    });

    it('validates international phone numbers accurately', () => {
      assert.equal(isPhone('+4915123456789'), true);
      assert.equal(isPhone('015123456789'), true);
      assert.equal(isPhone('+14155552671'), true);
      assert.equal(isPhone('abc-123'), false);
      assert.equal(isPhone('123'), false); // Too short
    });

    it('hashes passwords with scrypt and verifies with timingSafeEqual', () => {
      const salt = 'testsalt12345678';
      const hash1 = hashPassword('MySecurePassword123!', salt);
      const hash2 = hashPassword('MySecurePassword123!', salt);
      const hashWrong = hashPassword('WrongPassword!', salt);

      assert.equal(hash1, hash2);
      assert.notEqual(hash1, hashWrong);
      assert.equal(timingSafeEqual(hash1, hash2), true);
      assert.equal(timingSafeEqual(hash1, hashWrong), false);
    });

    it('generates single-use verification codes with TTL and purpose gating', () => {
      const code = createVerificationCode({
        identifier: 'test@hinterland.local',
        purpose: 'email',
        ttlMs: 5000,
      });

      assert.match(code, /^\d{6}$/);

      // Mismatch purpose
      const badPurpose = consumeVerificationCode(code, {
        identifier: 'test@hinterland.local',
        purpose: 'phone',
      });
      assert.equal(badPurpose.ok, false);
      assert.equal(badPurpose.error, 'codeMismatch');

      // Successful consumption
      const success = consumeVerificationCode(code, {
        identifier: 'test@hinterland.local',
        purpose: 'email',
      });
      assert.equal(success.ok, true);

      // Re-use rejected
      const reused = consumeVerificationCode(code, {
        identifier: 'test@hinterland.local',
        purpose: 'email',
      });
      assert.equal(reused.ok, false);
      assert.equal(reused.error, 'codeAlreadyUsed');
    });

    it('generates and verifies RFC 6238 TOTP tokens and recovery codes', () => {
      const secret = 'JBSWY3DPEHPK3PXP'; // Base32 RFC test secret
      const token = totpGenerate(secret);
      assert.match(token, /^\d{6}$/);

      const isValid = totpVerify(secret, token);
      assert.equal(isValid, true);

      const isInvalid = totpVerify(secret, '000000');
      assert.equal(isInvalid, false);

      const recoveryCodes = generateRecoveryCodes(8);
      assert.equal(recoveryCodes.length, 8);
      recoveryCodes.forEach((c) => assert.match(c, /^[0-9A-F]{8}$/));
    });

    it('tracks store download entitlements per user', () => {
      const userId = 'user-download-test-' + Date.now();
      assert.equal(getDownloadCount(userId), 0);
      assert.equal(incrementDownload(userId), 1);
      assert.equal(incrementDownload(userId), 2);
      assert.equal(getDownloadCount(userId), 2);
    });
  });

  describe('Account API Endpoints (website/api/account.js)', () => {
    const testEmail = `agent-${Date.now()}@hinterland.local`;
    let sessionToken = '';
    let verificationCode = '';

    it('registers a new account and generates an email verification code', async () => {
      const req = {
        method: 'POST',
        url: '/api/account/register',
        headers: {},
        body: {
          email: testEmail,
          password: 'PassPhraseSecure2026!',
          phone: '+4915100000000',
        },
      };
      const res = mockRes();
      await accountApi(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.user.email, testEmail);
      assert.equal(res.data.requiresEmailVerification, true);
      assert.ok(res.data.verificationCode);
      verificationCode = res.data.verificationCode;
    });

    it('rejects duplicate registration for the same email', async () => {
      const req = {
        method: 'POST',
        url: '/api/account/register',
        headers: {},
        body: { email: testEmail, password: 'PassPhraseSecure2026!' },
      };
      const res = mockRes();
      await accountApi(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'userAlreadyExists');
    });

    it('verifies account email with verification code', async () => {
      const req = {
        method: 'POST',
        url: '/api/account/verify',
        headers: {},
        body: { code: verificationCode, purpose: 'email', email: testEmail },
      };
      const res = mockRes();
      await accountApi(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.verified, true);
    });

    it('logs in with email and password and returns session token', async () => {
      const req = {
        method: 'POST',
        url: '/api/account/login',
        headers: {},
        body: { email: testEmail, password: 'PassPhraseSecure2026!' },
      };
      const res = mockRes();
      await accountApi(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.ok(res.data.token);
      assert.equal(res.data.user.email, testEmail);
      sessionToken = res.data.token;
    });

    it('fetches authenticated profile via GET /api/account/me', async () => {
      const req = {
        method: 'GET',
        url: '/api/account/me',
        headers: { authorization: `Bearer ${sessionToken}` },
      };
      const res = mockRes();
      await accountApi(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.user.email, testEmail);
      assert.equal(res.data.user.emailVerified, true);
    });

    it('updates user display name via PUT /api/account/me', async () => {
      const req = {
        method: 'PUT',
        url: '/api/account/me',
        headers: { authorization: `Bearer ${sessionToken}` },
        body: { displayName: 'Quantum Pioneer' },
      };
      const res = mockRes();
      await accountApi(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.user.displayName, 'Quantum Pioneer');
    });

    it('checks and consumes store download entitlement when email is verified', async () => {
      const getReq = {
        method: 'GET',
        url: '/api/account/download/entitlement',
        headers: { authorization: `Bearer ${sessionToken}` },
      };
      const getRes = mockRes();
      await accountApi(getReq, getRes);

      assert.equal(getRes.statusCode, 200);
      assert.equal(getRes.data.ok, true);
      assert.equal(getRes.data.verified, true);
      assert.equal(getRes.data.remaining, 50);

      const postReq = {
        method: 'POST',
        url: '/api/account/download/consume',
        headers: { authorization: `Bearer ${sessionToken}` },
      };
      const postRes = mockRes();
      await accountApi(postReq, postRes);

      assert.equal(postRes.statusCode, 200);
      assert.equal(postRes.data.ok, true);
      assert.equal(postRes.data.consumed, 1);
      assert.equal(postRes.data.remaining, 49);
    });

    it('logs out and revokes active session', async () => {
      const req = {
        method: 'POST',
        url: '/api/account/logout',
        headers: { authorization: `Bearer ${sessionToken}` },
      };
      const res = mockRes();
      await accountApi(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);

      // Subsequent authenticated call should fail
      const checkReq = {
        method: 'GET',
        url: '/api/account/me',
        headers: { authorization: `Bearer ${sessionToken}` },
      };
      const checkRes = mockRes();
      await accountApi(checkReq, checkRes);
      assert.equal(checkRes.statusCode, 401);
    });
  });
});
